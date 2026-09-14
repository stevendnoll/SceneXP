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
 * of those instead and the policy allows it. It may also not need the trick at
 * all: these samples are HTMLAudioElements rather than Web Audio, which should
 * already be a "playback" session. Belt and braces, because the only way to
 * know is a real iPhone with the switch flipped, and that is M6's gate.
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

/** Loaded with the scene because they are the first two sounds anybody hears
 *  and a late snap is worse than an early download. Everything else waits. */
const EAGER = ['snap', 'whistle'];

const elements = new Map();     // file name -> HTMLAudioElement
let muted = false;
let unlocked = false;
let keepAlive = null;
let warmed = false;

// ---- Persistence -----------------------------------------------------------

function load() {
    try {
        const raw = localStorage.getItem(CFG.storage.audio);
        if (raw) muted = JSON.parse(raw).muted === true;
    } catch (e) { /* private mode, or an older shape. Sound stays on. */ }
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
    // `preload="none"` is the whole loading policy: nothing is fetched until
    // something asks to play it, or until warm() asks for it by name.
    node.preload = 'none';
    elements.set(name, node);
    return node;
}

/** Ask the browser to fetch a group now. */
function warm(group) {
    for (const name of GROUPS[group] || []) {
        const node = element(name);
        if (node && node.preload !== 'auto') {
            node.preload = 'auto';
            try { node.load(); } catch (e) { /* nothing to do about it */ }
        }
    }
}

// ---- Public surface --------------------------------------------------------

export function initAudio() {
    load();
    for (const group of EAGER) {
        for (const name of GROUPS[group]) element(name);
    }
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
    if (!warmed) {
        warmed = true;
        for (const group of Object.keys(GROUPS)) warm(group);
    }
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

export function setMuted(next) {
    muted = !!next;
    save();
    if (muted) stopKeepAlive();
    else if (unlocked) startKeepAlive();
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
