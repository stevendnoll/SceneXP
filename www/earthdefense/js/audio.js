// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * audio.js - The engine tone and the handful of cues over it.
 *
 * EVERY SOUND IS SYNTHESIZED. There is not one audio file in this experience
 * and there never will be: a game that opens on a planet has better things to
 * spend its download on, and generated tones cost nothing, need no CSP
 * exception, and cannot fail to load halfway through a run. The whole module is
 * oscillators, a noise buffer, and envelopes.
 *
 * NOTHING IS CARRIED BY SOUND ALONE (PRD 8.5). Every cue here duplicates
 * something already on screen and already in the live region: a lock is a
 * change of shape, a hit is a flash, an alert is a banner and a sentence. Sound
 * is reinforcement, so a muted visitor and a deaf visitor lose nothing. That is
 * a constraint on what may be added later as much as a description of now.
 *
 * SILENT UNTIL THE VISITOR ACTS. Browsers refuse to start an AudioContext
 * before a gesture, and they are right to. Nothing here builds one until the
 * first click or key, so a page that is loaded and never touched makes no
 * sound, asks no permission, and holds no audio hardware.
 *
 * NEVER LOAD-BLOCKING. Everything is created lazily on that first gesture, so
 * the module could fail entirely and the game would simply be quiet. Every
 * public function is safe to call before the context exists, after it has been
 * disposed, and in a browser with no Web Audio at all.
 *
 * ONE VOICE PER CUE, AND THEY ARE SHORT. The engine is the one continuous
 * sound: three sine oscillators making a low hum, which gets louder with the
 * throttle. Everything else is a fire-and-forget node that disconnects itself.
 * Nothing accumulates.
 *
 * A PHONE SPEAKER IS THE HARD CASE. It reproduces very little below about
 * 500 Hz, so anything that carries its meaning down there is a sound only the
 * author hears. The cues are all mixed above that line. The engine is not, and
 * cannot be: it is a low hum by design. `buildEngine` has the long version.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

let ctx = null;
let master = null;
let engine = null;        // { hum, beat, octave, gain, ... }
let settings = null;
let muted = false;
let armed = false;
let armListeners = null;

// The last cue of each kind, so a firefight cannot stack forty overlapping
// clicks into a wall of noise. Keyed by cue name, holding a context timestamp.
const lastPlayed = new Map();

// How much of the engine is present at a standstill, as a fraction of full.
// Low on purpose: LOUDNESS IS THE THROTTLE, so there has to be somewhere to
// climb from. Not zero, because a ship holding station is still under power.
const HUM_AT_IDLE = 0.10;

const DEFAULTS = {
    masterGain: 0.16,
    engineGain: 0.45,
    engineGlide: 0.35,     // seconds for the hum to follow a throttle change
    // Three sine voices and nothing else. The pitch moves a little, but the
    // throttle is carried by LEVEL, which is what the ship is asked to sound
    // like: quiet hum parked, loud hum running.
    engineIdleHz: 90,
    engineFullHz: 140,
    engineDetune: 1.006,   // the second voice, just off the first, so it breathes
    engineHumGain: 0.55,
    engineBeatGain: 0.44,
    engineOctaveGain: 0.28,
    fireGain: 0.30,
    fireHz: 220,
    hitGain: 0.34,
    destroyGain: 0.45,
    alertGain: 0.38,
    lockGain: 0.22,
    minGapSeconds: 0.05    // per cue kind, so a burst does not become a wall
};

// ---- Arming -----------------------------------------------------------------

/** Wire the one-time gesture listener. Cheap, synchronous, and it builds
 *  nothing: the context itself waits for the gesture. */
export function initAudio(config = EARTHDEFENSE_CONFIG) {
    disposeAudio();
    settings = { ...DEFAULTS, ...(config.audio || {}) };
    muted = false;

    if (typeof document === 'undefined') return false;

    const arm = () => { start(); };
    armListeners = arm;
    document.addEventListener('click', arm, { once: true });
    document.addEventListener('keydown', arm, { once: true });
    document.addEventListener('touchend', arm, { once: true });
    return true;
}

/** Build the context and the engine voice. Called by the first gesture, and
 *  safe to call again: a second call is a no-op. */
export function start() {
    if (armed || !settings) return false;
    const Ctx = typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext);
    // No Web Audio at all is a quiet game, not a broken one.
    if (!Ctx) { armed = true; return false; }

    try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : settings.masterGain;
        master.connect(ctx.destination);
        buildEngine();
        armed = true;
        return true;
    } catch (e) {
        ctx = null;
        master = null;
        armed = true;
        return false;
    }
}

/** The engine: A LOW HUM, MADE OF THREE SINE WAVES. That is the whole of it.
 *
 *  Two earlier versions are worth recording, because both were wrong in ways
 *  that are easy to walk back into.
 *
 *  The first was a sawtooth, and it buzzed like an insect. A sawtooth carries
 *  every harmonic at 1/n, so at full throttle it was a 128 Hz fundamental under
 *  ten strong partials. A phone speaker reproduces almost nothing below about
 *  500 Hz: it played the partials, threw the fundamental away, and what is left
 *  of a sawtooth minus its bottom is a bee.
 *
 *  The second answered that with a bed of filtered noise, which reads as air
 *  rushing past a hull. IN SPACE THERE IS NO AIR. It was a good engine for an
 *  aircraft and the wrong sound for this ship entirely.
 *
 *  So: sine waves only. A sine has exactly one partial, which means there is
 *  nothing in this voice that can buzz on any speaker, and no noise, which
 *  means nothing that can read as wind.
 *
 *    hum     The fundamental.
 *    beat    The same note a fraction of a percent sharp. Two near-identical
 *            sines drift in and out of phase, which is heard as a slow swell
 *            of about half a cycle a second. That swell is the only thing
 *            keeping this from sounding like a test tone, and it costs one
 *            oscillator.
 *    octave  Twice the fundamental, quiet. A hum lives below what a handset
 *            speaker can move, so this is the part a phone actually plays.
 *
 *  THE THROTTLE IS LEVEL, NOT PITCH. The hum climbs a little in pitch, enough
 *  to feel like effort, but the thing a player hears is the engine getting
 *  louder. */
function buildEngine() {
    const gain = ctx.createGain();
    gain.gain.value = 0;                 // silent at rest; the throttle opens it
    gain.connect(master);

    const voice = (hz, level) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = hz;
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = level;
        osc.connect(voiceGain);
        voiceGain.connect(gain);
        osc.start();
        return osc;
    };

    const base = settings.engineIdleHz;
    const hum = voice(base, settings.engineHumGain);
    const beat = voice(base * settings.engineDetune, settings.engineBeatGain);
    const octave = voice(base * 2, settings.engineOctaveGain);

    engine = { hum, beat, octave, gain };
}

// ---- The engine -------------------------------------------------------------

/** Follow the throttle. `fraction` is -1 to 1, the flight model's own number.
 *
 *  LOUDER IS FASTER. The level walks from a tenth of full at a standstill up to
 *  full at the stops, and that is the thing a player hears. The pitch comes up
 *  by about a fifth over the same range, which is enough to feel like effort
 *  without turning the hum into a siren.
 *
 *  It GLIDES rather than jumping, over about a third of a second, which is what
 *  makes it read as an engine spooling instead of as a slider. Reverse sounds
 *  the same as ahead: the ship has one engine and it is working either way, and
 *  giving reverse its own voice would imply a mechanism that is not there. */
export function setEngineThrottle(fraction) {
    if (!engine || !ctx) return;
    const amount = Math.min(1, Math.abs(fraction || 0));
    const target = settings.engineIdleHz +
        (settings.engineFullHz - settings.engineIdleHz) * amount;
    const now = ctx.currentTime;
    const glide = settings.engineGlide;

    ramp(engine.hum.frequency, target, now, glide);
    ramp(engine.beat.frequency, target * settings.engineDetune, now, glide);
    ramp(engine.octave.frequency, target * 2, now, glide);
    ramp(engine.gain.gain,
        settings.engineGain * (HUM_AT_IDLE + amount * (1 - HUM_AT_IDLE)), now, glide);
}

/** setTargetAtTime rather than a linear ramp: it never overshoots, it needs no
 *  cancel before it, and a value changed sixty times a second stays smooth. */
function ramp(param, value, now, seconds) {
    if (!param) return;
    if (typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(value, now, Math.max(0.01, seconds / 3));
    } else {
        param.value = value;
    }
}

// ---- Cues -------------------------------------------------------------------

/** True when a cue of this kind is allowed to sound now. Guns fire four times a
 *  second and a destruction can land on the same frame as three hits, so
 *  without this the mix turns to gravel in a real fight. */
function allow(kind) {
    if (!ctx || muted) return false;
    const now = ctx.currentTime;
    const last = lastPlayed.get(kind);
    if (last !== undefined && now - last < settings.minGapSeconds) return false;
    lastPlayed.set(kind, now);
    return true;
}

/** The guns. Short, dry, and deliberately unremarkable: it happens four times a
 *  second for as long as a target is held, so anything with character would
 *  become unbearable inside ten seconds. */
export function playFire() {
    if (!allow('fire')) return false;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(settings.fireHz, now);
    osc.frequency.exponentialRampToValueAtTime(settings.fireHz * 0.45, now + 0.07);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(settings.fireGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.1);
    cleanupOn(osc, [gain]);
    return true;
}

/** A hit that did not kill. A filtered noise tick, so it sits under the fire
 *  rather than competing with it. */
export function playHit() {
    if (!allow('hit')) return false;
    const now = ctx.currentTime;
    const source = noiseSource(0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(settings.hitGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    cleanupOn(source, [filter, gain]);
    return true;
}

/** Something died. Longer noise through a falling low pass, which is the whole
 *  trick to a synthesized explosion. */
export function playDestruction() {
    if (!allow('destroy')) return false;
    const now = ctx.currentTime;
    const source = noiseSource(0.7);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.6);
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(settings.destroyGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    cleanupOn(source, [filter, gain]);
    return true;
}

/** An installation is under attack. Two notes, the second lower, which is the
 *  oldest alert shape there is and reads as one without being shrill. */
export function playAlert() {
    if (!allow('alert')) return false;
    const now = ctx.currentTime;
    tone(660, now, 0.16, settings.alertGain);
    tone(495, now + 0.18, 0.22, settings.alertGain);
    return true;
}

/** The guns have something. A single quiet blip, well under the fire cue, so
 *  acquiring a target is felt rather than announced. */
export function playLock() {
    if (!allow('lock')) return false;
    tone(880, ctx.currentTime, 0.06, settings.lockGain);
    return true;
}

function tone(hz, at, seconds, level) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, at);

    const gain = ctx.createGain();
    // A short attack rather than an instant one, so nothing clicks.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
    cleanupOn(osc, [gain]);
    return osc;
}

/** White noise of a given length, as a one-shot buffer source. */
function noiseSource(seconds) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
}

/** Disconnect a finished voice and everything downstream of it. Without this a
 *  ten minute run leaves a few thousand orphaned nodes attached to the master
 *  gain, and the mix gets quieter and heavier as it goes. */
function cleanupOn(source, nodes) {
    const release = () => {
        try {
            source.disconnect();
            nodes.forEach(n => n.disconnect());
        } catch (e) { /* already gone */ }
    };
    if (typeof source.addEventListener === 'function') {
        source.addEventListener('ended', release, { once: true });
    } else {
        source.onended = release;
    }
}

// ---- Mute -------------------------------------------------------------------

/** Muting is a gain of zero rather than a torn-down context, so the engine tone
 *  is exactly where it was when the visitor turns it back on. */
export function setMuted(on) {
    muted = !!on;
    if (!master || !ctx) return muted;
    ramp(master.gain, muted ? 0 : settings.masterGain, ctx.currentTime, 0.08);
    return muted;
}

export function isMuted() { return muted; }
export function isRunning() { return !!ctx; }
export function getContext() { return ctx; }

export function disposeAudio() {
    if (armListeners && typeof document !== 'undefined') {
        document.removeEventListener('click', armListeners);
        document.removeEventListener('keydown', armListeners);
        document.removeEventListener('touchend', armListeners);
    }
    armListeners = null;

    if (engine) {
        // Each in its own try. A voice that never started throws on stop, and
        // one that does must not take the others down with it: an oscillator
        // left running after dispose is a tone that outlives the game.
        for (const voice of [engine.hum, engine.beat, engine.octave]) {
            try { if (voice) voice.stop(); } catch (e) { /* never started */ }
        }
        try { engine.gain.disconnect(); } catch (e) { /* already gone */ }
    }
    if (ctx && typeof ctx.close === 'function') {
        try { ctx.close(); } catch (e) { /* already closed */ }
    }
    ctx = null;
    master = null;
    engine = null;
    settings = null;
    armed = false;
    muted = false;
    lastPlayed.clear();
}

export const __test__ = { DEFAULTS, allow, tone, noiseSource, getEngine: () => engine };
