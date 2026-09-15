// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * audio.js - The sounds of the game.
 *
 * REBUILT AROUND THE 2D GAME'S SAMPLE CHOICES rather than ported line for line,
 * which is the exception to D2 and worth saying plainly. audio.class.tsx is
 * four fifths TypeScript property declarations that JavaScript does not need,
 * and its remaining logic is "pick one of N at random and call play()". What it
 * did NOT have is everything this file exists for: a gesture gate, a preload
 * policy, a persisted mute, and the iOS keep-alive. The sample groups and the
 * random pick are its own.
 *
 * ONLY 23 OF THE 70 FILES ARE REAL. The 2D game declares slots for collide,
 * pads, running, smack, sneak, steps and tap and never loads a single one of
 * them, so those methods are silent there too. Shipping the other 47 would have
 * been 645KB of audio that nothing can ever play. What remains is 199KB.
 *
 * NOTHING PLAYS BEFORE A GESTURE. Browsers will not start audio without one,
 * and a scene that tries anyway logs errors and looks broken. `unlock()` is
 * called from the first real interaction, which in this game is the snap.
 *
 * THE iOS SILENT SWITCH, which is the interesting part.
 *
 * iOS puts plain Web Audio in the "ambient" session, which the hardware
 * ring/silent switch mutes outright. Three scenes on this site (roqui, family,
 * dad) work around it by looping an inaudible clip through a hidden <audio>
 * element to promote the session to "playback", the category the switch does
 * not silence. All three build that clip as a `blob:` URL, and every page here
 * carries `default-src 'self'`, which does not permit `blob:` for media. The
 * CSP has been blocking it and the workaround has never once worked.
 *
 * This scene is the first with real same-origin audio files, so it loops one
 * of those instead and the policy allows it.
 *
 * AND THE LOOP IS NOW LOAD BEARING, because the samples moved to Web Audio.
 *
 * ---- WEB AUDIO, BECAUSE AN <audio> ELEMENT IS LATE ON AN iPHONE ----
 *
 * QA on a real iPhone, 2026-09-14: "the audio sounds are a bit laggy, especially
 * the click/tap sounds". Every sample used to be an HTMLAudioElement rewound
 * with `currentTime = 0` and started with `play()`, and iOS Safari puts a
 * hundred to three hundred milliseconds between those two calls and a sound,
 * which is exactly the gap between a finger and a click that reads as broken.
 * A decoded AudioBuffer started on an AudioBufferSourceNode is a few
 * milliseconds.
 *
 * The cost is the silent switch: Web Audio on its own is the "ambient" session
 * the switch mutes. The keep-alive loop above promotes the page to "playback",
 * and `navigator.audioSession` says so directly where Safari has it, so both
 * are set whenever sound is on.
 *
 * AN ELEMENT IS STILL THE FALLBACK for a sample that has not finished decoding,
 * and for a browser with no Web Audio at all. A sound a little late beats no
 * sound, and it only happens for the first press after the sound comes on.
 *
 * ---- AND SOUND STARTS OFF ----
 *
 * Also from that QA pass. A game that makes noise the moment somebody taps on
 * a phone in a quiet room is a game closed in a hurry. `muted` is true until
 * the visitor turns it on, and the choice they make is remembered.
 */
import { XO_CONFIG as CFG } from './config.min.js';

const BASE = 'assets/audio/';

/** The groups, and the files behind them, exactly as game.tsx wired them.
 *  Note grunt uses 1, 2, 5, 6, 7 and hike uses 1, 2, 3, 6: the gaps are the
 *  2D game's own choices about which takes were any good. */
const GROUPS = {
    snap: ['snap-8', 'snap-6s'],
    hike: ['hike-1', 'hike-2', 'hike-3', 'hike-6'],
    wind: ['wind-1', 'wind-2', 'wind-3'],
    catch: ['catch-1', 'catch-2', 'catch-4'],
    grunt: ['grunt-1', 'grunt-2', 'grunt-5', 'grunt-6', 'grunt-7'],
    incomplete: ['incomplete-1', 'incomplete-2'],
    whistle: ['whistle-6', 'whistle-2', 'whistle-7', 'whistle-5'],
};

const elements = new Map();     // file name -> HTMLAudioElement, the fallback
const buffers = new Map();      // file name -> decoded AudioBuffer
const loading = new Map();      // file name -> Promise of the above
let context = null;
/** Off until the visitor turns it on (QA, 2026-09-14). */
let muted = true;
let unlocked = false;
let keepAlive = null;
let warmed = false;

// ---- Persistence -----------------------------------------------------------

function load() {
    try {
        const raw = localStorage.getItem(CFG.storage.audio);
        if (raw) muted = JSON.parse(raw).muted !== false;
    } catch (e) { /* private mode, or an older shape. Sound stays off. */ }
}

function save() {
    try {
        localStorage.setItem(CFG.storage.audio, JSON.stringify({ muted }));
    } catch (e) { /* a preference is not worth an exception */ }
}

// ---- Elements --------------------------------------------------------------

function element(name) {
    let node = elements.get(name);
    if (node) return node;
    if (typeof Audio !== 'function') return null;
    node = new Audio(`${BASE}${name}.mp3`);
    // `preload="none"`: this element is only the fallback for a sample Web
    // Audio has not decoded yet, so it fetches nothing until it is played.
    node.preload = 'none';
    elements.set(name, node);
    return node;
}

// ---- Web Audio -------------------------------------------------------------

/**
 * The one AudioContext, made on the first gesture rather than at load. A
 * context made earlier starts suspended, and Chrome logs a warning for every
 * one that is.
 */
function audioContext() {
    if (context) return context;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { context = new AC(); } catch (e) { context = null; }
    return context;
}

/** decodeAudioData, in either of the two shapes Safari has shipped it in. */
function decode(ctx, data) {
    return new Promise((resolve, reject) => {
        const result = ctx.decodeAudioData(data, resolve, reject);
        if (result && typeof result.then === 'function') result.then(resolve, reject);
    });
}

/** Fetch and decode one sample, once. Resolves to the buffer or null. */
function fetchBuffer(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (loading.has(name)) return loading.get(name);
    const ctx = audioContext();
    if (!ctx || typeof fetch !== 'function') return Promise.resolve(null);
    const pending = fetch(`${BASE}${name}.mp3`)
        .then((response) => (response && response.ok ? response.arrayBuffer() : null))
        .then((data) => (data ? decode(ctx, data) : null))
        .then((buffer) => {
            if (buffer) buffers.set(name, buffer);
            else loading.delete(name);   // a failure may be tried again later
            return buffer || null;
        })
        .catch(() => { loading.delete(name); return null; });
    loading.set(name, pending);
    return pending;
}

/**
 * Wake the context. Must run inside a gesture on iOS, which is why it is
 * called from `unlock`, from turning the sound on, and from every `play`: iOS
 * suspends a context when the page goes to the background and only a touch
 * brings it back.
 *
 * The one-sample silent buffer (`tick`) is for older iOS, which will not
 * consider a context unlocked until something has actually been started on it
 * inside a gesture. Only the unlock needs it, so a play does not pay for it.
 */
function wake({ tick = false } = {}) {
    const ctx = audioContext();
    if (!ctx) return null;
    if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
        try {
            const resumed = ctx.resume();
            if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
        } catch (e) { /* nothing to do about it */ }
    }
    if (!tick) return ctx;
    try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22050);
        source.connect(ctx.destination);
        source.start(0);
    } catch (e) { /* an unlock tick is not worth an exception */ }
    return ctx;
}

/** Tell Safari this page plays sound on purpose, so the silent switch does
 *  not apply. Only where the Audio Session API exists. */
function claimPlayback() {
    try {
        if (typeof navigator !== 'undefined' && navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }
    } catch (e) { /* older Safari, or no such thing */ }
}

/** Fetch and decode the whole library, about 200KB. Only once sound is on:
 *  a visitor who never turns it on never downloads a byte of it. */
function warmAll() {
    if (warmed || muted || !audioContext()) return;
    warmed = true;
    for (const names of Object.values(GROUPS)) {
        for (const name of names) fetchBuffer(name);
    }
}

// ---- Public surface --------------------------------------------------------

export function initAudio() {
    load();
    return { muted };
}

/**
 * Called from the first genuine interaction.
 *
 * Fetches the rest of the library, and starts the keep-alive if sound is on.
 * Safe to call repeatedly.
 */
export function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (muted) return;
    wake({ tick: true });
    warmAll();
    claimPlayback();
    startKeepAlive();
}

/**
 * The inaudible loop.
 *
 * A real file at a real same-origin path, because `blob:` is what the other
 * three scenes got wrong. Muted at the element level as well as being silent
 * in content, so there is no way for it to be heard even if the file were
 * wrong.
 */
function startKeepAlive() {
    if (keepAlive || muted || typeof Audio !== 'function') return;
    try {
        keepAlive = new Audio(`${BASE}silence.mp3`);
        keepAlive.loop = true;
        keepAlive.volume = 0;
        const started = keepAlive.play();
        if (started && typeof started.catch === 'function') {
            started.catch(() => { keepAlive = null; });
        }
    } catch (e) {
        keepAlive = null;
    }
}

function stopKeepAlive() {
    if (!keepAlive) return;
    try { keepAlive.pause(); } catch (e) { /* already gone */ }
    keepAlive = null;
}

/** Play one sample from a group, chosen at random the way the 2D game does. */
export function play(group, delay = 0) {
    if (muted || !unlocked) return false;
    const names = GROUPS[group];
    if (!names || !names.length) return false;
    const name = names[Math.floor(Math.random() * names.length)];

    // THE FAST PATH: a decoded buffer, scheduled on the context's own clock,
    // which also makes a delay exact rather than whenever a timer gets round
    // to it.
    const buffer = buffers.get(name);
    const ctx = buffer ? wake() : null;
    if (buffer && ctx) {
        try {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(ctx.currentTime + Math.max(0, delay) / 1000);
            return true;
        } catch (e) { /* fall through to the element */ }
    }
    // Not decoded yet: ask for it, and play this one the old way.
    fetchBuffer(name);

    const fire = () => {
        const node = element(name);
        if (!node) return;
        try {
            node.currentTime = 0;
            const started = node.play();
            // A rejected play is normal (an interrupted gesture, a sample still
            // loading) and must never reach the console as an unhandled error.
            if (started && typeof started.catch === 'function') started.catch(() => {});
        } catch (e) { /* the game does not stop for a missing sound */ }
    };

    if (delay > 0) window.setTimeout(fire, delay);
    else fire();
    return true;
}

export function isMuted() {
    return muted;
}

/**
 * Turn the sound on or off, and remember it.
 *
 * TURNING IT ON IS A GESTURE, so it also counts as the unlock: the context is
 * woken, the library starts downloading, and the keep-alive starts, all inside
 * the press that asked for sound, which is the only moment iOS allows it.
 */
export function setMuted(next) {
    muted = !!next;
    save();
    if (muted) {
        stopKeepAlive();
    } else {
        unlocked = true;
        wake({ tick: true });
        warmAll();
        claimPlayback();
        startKeepAlive();
    }
    return muted;
}

export function toggleMuted() {
    return setMuted(!muted);
}

/**
 * The object the ported simulation expects.
 *
 * motion.js and routes.js call `audio.catch()`, `audio.collide()` and
 * `audio.incomplete()` from inside the physics. `collide` is deliberately a
 * no-op: the 2D game declares it empty too, and a sound on every collision in
 * a game with seventeen bodies would be a wall of noise.
 */
export function simAudio() {
    return {
        catch: () => play('catch'),
        collide: () => {},
        incomplete: () => play('incomplete'),
    };
}
