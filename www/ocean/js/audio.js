// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * audio.js - The sea, synthesized.
 *
 * EVERY SOUND IS SYNTHESIZED, and here that is a design decision rather than a
 * download saving. A recording of surf becomes recognizably a loop within about
 * two passes, and this is a scene built to be left running for as long as
 * someone likes. Noise through filters never repeats. It also needs no CSP
 * exception, cannot fail to load halfway through, and costs nothing on a phone
 * connection.
 *
 * THE SHAPE OF ONE WAVE IS THE WHOLE MODULE. A burst of filtered noise reads as
 * static, and no amount of tuning fixes that. The same noise split into three
 * stages in the right order reads unmistakably as a wave breaking on a beach:
 *
 *   1. THE CRASH. Broadband, hit hard, filter falling fast from bright to dull.
 *      A crack that becomes a thud, which is a wave toppling forward.
 *   2. THE WASH. The foam sheet running up the sand. Swells in rather than
 *      starting at full, and runs three or four seconds. The longest stage, the
 *      loudest, and the one people actually hear as "a beach".
 *   3. THE DRAG. Water pulling back over wet sand. Quiet and easy to miss on
 *      purpose, because its job is to set up the silence before the next one.
 *
 * The gaps between those stages carry as much as the stages do. Surf is not a
 * texture, it is a rhythm, and a scene whose camera never moves is relying on
 * that rhythm for its pulse.
 *
 * A PHONE SPEAKER DECIDES THE MIX. A phone reproduces very little below roughly
 * 500 Hz, so the deep rumble that carries most of the real ocean's power is a
 * sound only someone on headphones will get. What survives is the hiss of the
 * wash, up around 2 kHz, which is also the part that identifies a beach. So the
 * wash is mixed to carry the scene alone and everything below it is a bonus.
 * Anyone tempted to push the rumble up should check it on a phone first.
 *
 * SILENT UNTIL THE VISITOR ACTS. Browsers refuse to build an AudioContext
 * before a gesture and they are right to. Nothing here constructs one until the
 * first click, key, or touch, so a page loaded and left alone makes no sound and
 * holds no audio hardware.
 *
 * NEVER LOAD-BLOCKING, NEVER FATAL. Everything is lazy. This module could fail
 * outright and the ocean would simply be a silent ocean. Every exported
 * function is safe to call before arming, after disposal, and in a browser with
 * no Web Audio at all.
 *
 * NOTHING ACCUMULATES. A visitor may leave this scene open for an hour, which
 * is thousands of breaks and tens of thousands of nodes. Every one-shot voice
 * disconnects itself when it ends. The bed is the only thing that persists.
 *
 * THE SCHEDULER IS TEMPORARY, AND SEPARABLE ON PURPOSE. Until the water
 * simulation exists this module times its own waves so the beach can be heard.
 * When the water lands it calls `playBreak` from the visual break instead, and
 * `setAutoBreaks(false)` retires the timer. Keeping those apart is what makes
 * the crash you hear the wave you watched, rather than a timer running
 * alongside it and drifting out of step within a minute.
 */

import { OCEAN_CONFIG, seaStateLevels } from './config.min.js';

let ctx = null;
let master = null;
let bed = null;            // { swell, wash, wind, gains... }
let settings = null;
let noiseBuffer = null;

let muted = false;
// Silence the visitor did not ask for and has no control for: the tab is
// hidden, so the sea stops with it. Kept apart from `muted` rather than folded
// into it, because they answer to different people and both have to hold. See
// `level`, which is the one place that resolves them.
let suspended = false;
let armed = false;
let armListeners = null;

let elapsed = 0;           // seconds of sea, for the bed drift and the sets
let nextBreakIn = 0;       // seconds until the scheduler fires again
let autoBreaks = true;
let intensity = 0.5;       // sea state, 0 calm to 1 stormy
let lastBreakAt = -Infinity;

// Two breaks landing on the same frame would stack into a single louder crash
// rather than two waves. Nothing schedules that today, but the water sim will
// be firing these from a simulation and simulations do surprising things.
const MIN_BREAK_GAP = 0.35;

// Seconds of white noise held for the whole session. ONE BUFFER, NOT ONE PER
// VOICE: an hour of surf is a few hundred breaks and three voices each, and
// filling a fresh buffer every time is real work on the main thread for no gain
// when a random offset into a shared one is already unrepeatable.
//
// IT MUST STAY COMFORTABLY LONGER THAN THE LONGEST SINGLE VOICE, which is the
// wash of a full strength wave at a shade over four seconds. A buffer shorter
// than the voice reading from it collapses the random-window range to zero and
// then runs off the end, cutting the wash short, and the only symptom is a
// wave that stops rather than fades. Four seconds of headroom above the longest
// voice costs about 1.5 MB once and removes the whole class of problem.
const NOISE_SECONDS = 8;

// ---- Arming -----------------------------------------------------------------

/** Wire the one-time gesture listener. Builds nothing: the context itself waits
 *  for the gesture, which on this page is the click that dismisses the welcome
 *  screen. */
export function initSurf(config = OCEAN_CONFIG) {
    disposeSurf();
    settings = config && config.audio ? config.audio : OCEAN_CONFIG.audio;
    muted = false;
    suspended = false;
    autoBreaks = true;
    elapsed = 0;
    nextBreakIn = 0;
    lastBreakAt = -Infinity;

    if (typeof document === 'undefined') return false;

    const arm = () => { start(); };
    armListeners = arm;
    document.addEventListener('click', arm, { once: true });
    document.addEventListener('keydown', arm, { once: true });
    document.addEventListener('touchend', arm, { once: true });
    armed = true;
    return true;
}

/** Build the context and the bed. Called by the first gesture, and safe to call
 *  again: a context that already exists is simply resumed. */
export function start() {
    if (ctx) {
        if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        return true;
    }
    if (!settings) settings = OCEAN_CONFIG.audio;

    const Ctx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
    if (!Ctx) return false;      // no Web Audio here, so the sea stays quiet

    try {
        ctx = new Ctx();
    } catch (e) {
        ctx = null;              // a context that refuses to build is not fatal
        return false;
    }

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    noiseBuffer = buildNoiseBuffer();
    bed = buildBed();

    // iOS suspends the context when the visitor leaves the tab or takes a call,
    // and Safari parks it in a nonstandard 'interrupted' state that never
    // resumes itself. Nudge it back whenever the tab returns. Learned the hard
    // way by the river in www/dad.
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
    }

    // Still inside the click that dismissed the welcome screen, which is the
    // only moment iOS will let a media element start.
    startSilentKeepAlive();

    // The sea arrives rather than switching on.
    fadeTo(level(), settings.fadeInSeconds);
    return true;
}

function onVisibility() {
    if (typeof document === 'undefined' || !ctx) return;
    if (!document.hidden && ctx.state !== 'running' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
    }
}

// ---- The iOS ring switch ----------------------------------------------------
//
// Plain Web Audio runs in the iOS "ambient" audio session, and the hardware
// ring/silent switch mutes that session outright. A great many phones live with
// that switch flipped, so without this the scene is silent for them with no
// explanation and no control that fixes it. Any playing HTML <audio> element
// promotes the session to "playback", the category the switch does not silence,
// so an inaudible looping wav holds the door open. Everywhere else it is a
// harmless no-op.
//
// THIS NEEDS `media-src 'self' blob:` IN THE PAGE CSP. A blob URL is not
// covered by `default-src 'self'`, so a page that forgets the directive blocks
// the element, `play()` rejects, the catch swallows it, and the failure is
// invisible. www/dad, www/family, and www/roqui all ship this workaround today
// without the directive, which means none of them actually work.
let keepAliveEl = null;

/** Half a second of 8-bit mono PCM silence as a same-origin blob URL (0x80 is
 *  the 8-bit midpoint, which is to say no signal at all). */
function createSilentWavUrl() {
    const rate = 8000;
    const samples = rate / 2;
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const writeTag = (offset, tag) => {
        for (let i = 0; i < tag.length; i++) bytes[offset + i] = tag.charCodeAt(i);
    };
    writeTag(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    writeTag(8, 'WAVE');
    writeTag(12, 'fmt ');
    view.setUint32(16, 16, true);     // fmt chunk size
    view.setUint16(20, 1, true);      // PCM
    view.setUint16(22, 1, true);      // mono
    view.setUint32(24, rate, true);   // sample rate
    view.setUint32(28, rate, true);   // byte rate (1 byte per sample)
    view.setUint16(32, 1, true);      // block align
    view.setUint16(34, 8, true);      // bits per sample
    writeTag(36, 'data');
    view.setUint32(40, samples, true);
    bytes.fill(0x80, 44);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/** Must be called from inside the gesture, which is the only moment iOS lets a
 *  media element start. `start` is, so this is. */
function startSilentKeepAlive() {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    if (typeof URL.createObjectURL !== 'function') return;
    try {
        if (!keepAliveEl) {
            keepAliveEl = document.createElement('audio');
            keepAliveEl.loop = true;
            keepAliveEl.setAttribute('playsinline', '');
            keepAliveEl.src = createSilentWavUrl();
        }
        const attempt = keepAliveEl.play();
        if (attempt && attempt.catch) attempt.catch(() => {});
    } catch (e) { /* no media element here, so the sea is quiet on silent mode */ }
}

function stopSilentKeepAlive() {
    if (keepAliveEl && typeof keepAliveEl.pause === 'function') {
        try { keepAliveEl.pause(); } catch (e) { /* already stopped */ }
    }
}

/** Seconds of white noise, shared by every voice in the session. */
function buildNoiseBuffer() {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

// ---- The bed ----------------------------------------------------------------

/** Three continuous filtered loops. On their own they are a flat shhhh, and
 *  that is correct: the bed is the room, and the breaks are the events in it.
 *  Anything characterful down here becomes maddening by the tenth minute. */
function buildBed() {
    const b = settings.bed;

    const swell = loopVoice('lowpass', b.swellHz, null, b.swellGain);
    const wash = loopVoice('bandpass', b.washHz, b.washQ, b.washGain);
    const wind = loopVoice('highpass', b.windHz, null, b.windGain);

    return { swell, wash, wind };
}

/** One looping layer of the bed: the shared noise through a filter into its own
 *  gain, so the sea state can move the layers independently. */
function loopVoice(type, hz, q, gainValue) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    if (q !== null && filter.Q) filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.value = gainValue;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();

    return { source, filter, gain, base: gainValue };
}

// ---- One wave ---------------------------------------------------------------

/**
 * Break one wave.
 *
 * `strength` is 0 to 1: a small inner slapping the sand through to a set wave
 * closing out in front of the camera. `pan` is -1 to 1 across the front, and
 * when it is left off the wave is placed for you, pulled toward the centre as
 * it gets bigger, since the big ones are the ones breaking in front of you.
 *
 * This is the seam the water simulation will drive. It is deliberately the only
 * thing it needs to call.
 */
export function playBreak(strength = 0.6, pan = null) {
    if (!ctx || muted || suspended) return false;
    const now = ctx.currentTime;
    if (now - lastBreakAt < MIN_BREAK_GAP) return false;
    lastBreakAt = now;

    const s = Math.max(0, Math.min(1, strength));
    const cfg = settings.breaks;

    // Bigger waves are brighter as well as louder. Without this a large wave is
    // just a small wave with the volume up, which fools nobody.
    const brightness = 1 + cfg.brightnessRange * (s - 0.5) * 2;
    const loudness = 0.35 + 0.65 * s;

    const placement = pan === null
        ? (Math.random() * 2 - 1) * settings.schedule.spread * (1 - 0.5 * s)
        : Math.max(-1, Math.min(1, pan));
    const out = panNode(placement);

    // 1. The collapse: bright crack falling to a thud.
    sweptNoise(out, {
        at: now + cfg.crashAt,
        seconds: cfg.crashSeconds,
        type: 'lowpass',
        fromHz: cfg.crashFromHz * brightness,
        toHz: cfg.crashToHz,
        gain: cfg.crashGain * loudness,
        attack: 0.015
    });

    // 2. The foam sheet running up the sand. Longer for a bigger wave, because
    //    a bigger wave pushes further up the beach before it gives up.
    sweptNoise(out, {
        at: now + cfg.washAt,
        seconds: cfg.washSeconds * (0.8 + 0.4 * s),
        type: 'bandpass',
        q: cfg.washQ,
        fromHz: cfg.washFromHz * brightness,
        toHz: cfg.washToHz,
        gain: cfg.washGain * loudness,
        attack: cfg.washAttack
    });

    // 3. The retreat, and then the beach is empty again.
    sweptNoise(out, {
        at: now + cfg.dragAt,
        seconds: cfg.dragSeconds,
        type: 'bandpass',
        q: 0.8,
        fromHz: cfg.dragFromHz,
        toHz: cfg.dragToHz,
        gain: cfg.dragGain * loudness,
        attack: 0.25
    });

    return true;
}

/** One stage of a break: noise through a filter that sweeps from one frequency
 *  to another, under a gain that rises and falls. Every stage in this module is
 *  this function with different numbers, which is most of why it stays small. */
function sweptNoise(destination, opts) {
    const { at, type, fromHz, toHz, gain: peak, attack, q } = opts;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    // A random window into the shared buffer, so two waves never overlay the
    // same noise. The clamp is belt and braces: NOISE_SECONDS is sized to clear
    // the longest voice, and this keeps a future retune of the wash from
    // silently truncating it if that ever stops being true.
    const seconds = Math.min(opts.seconds, NOISE_SECONDS);
    const room = Math.max(0, NOISE_SECONDS - seconds);
    const offset = room > 0 ? Math.random() * room : 0;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + seconds);
    if (q !== undefined && filter.Q) filter.Q.value = q;

    const gain = ctx.createGain();
    // Exponential ramps everywhere and never to a true zero: an exponential
    // ramp to 0 is undefined and a linear one to silence clicks.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(at, offset, seconds);
    cleanupOn(source, [filter, gain]);
    return source;
}

/** A stereo placement for one wave, or the master itself where the browser has
 *  no panner. SURF IS WIDE, and placing each break somewhere different across
 *  the front is most of what stops a row of breaks sounding like one machine
 *  cycling. Older Safari has no StereoPannerNode, and mono surf is still surf. */
function panNode(placement) {
    if (typeof ctx.createStereoPanner !== 'function') return master;
    const panner = ctx.createStereoPanner();
    panner.pan.value = placement;
    panner.connect(master);
    return panner;
}

/** Disconnect a finished voice and everything downstream of it. Without this an
 *  hour on this page leaves tens of thousands of orphaned nodes hanging off the
 *  master gain, and the mix gets quieter and heavier as it goes. */
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

// ---- The frame --------------------------------------------------------------

/**
 * Drive the bed drift and, while it is on, the wave scheduler. Called from the
 * render loop with the frame delta in seconds. Cheap early return when there is
 * nothing to hear, so a muted visitor pays almost nothing for this.
 */
export function update(deltaTime = 0) {
    if (!ctx || muted || suspended) return;
    const dt = Math.max(0, Math.min(0.25, deltaTime));   // a tab that was backgrounded
    elapsed += dt;

    driftBed();
    if (autoBreaks) {
        nextBreakIn -= dt;
        if (nextBreakIn <= 0) fireScheduledBreak();
    }
}

/** Move the bed layers under each other. Small, slow, and irregular: the wind
 *  comes and goes on its own long cycle while the water underneath stays where
 *  it is, which is the difference between a sea and a noise generator. */
function driftBed() {
    if (!bed) return;
    const b = settings.bed;
    const state = seaStateLevels(intensity);

    const wind = 0.5 + 0.5 * Math.sin(Math.PI * 2 * elapsed / b.windPeriodSeconds);
    bed.wind.gain.gain.value = b.windGain * (0.4 + 1.2 * wind) * state.bedScale;
    bed.swell.gain.gain.value = b.swellGain * state.bedScale;
    bed.wash.gain.gain.value = b.washGain * (0.85 + 0.3 * wind) * state.bedScale;
}

/** Pick the next wave and when the one after it arrives.
 *
 *  SETS ARE THE POINT. Real waves come in groups of a few large ones followed
 *  by a lull, and that pattern is what turns watching the sea into anticipation.
 *  Two periods that do not divide evenly multiply into a rhythm that takes
 *  minutes to come back around, so a visitor never hears the pattern repeat.
 *  The same trick drives the river in www/dad, at a much faster tempo. */
function fireScheduledBreak() {
    const sc = settings.schedule;
    const state = seaStateLevels(intensity);

    const set = Math.sin(Math.PI * 2 * elapsed / sc.setPeriodSeconds)
        * Math.sin(Math.PI * 2 * elapsed / sc.setSubPeriodSeconds);
    const strength = clamp01(state.strength + sc.setDepth * set + (Math.random() - 0.5) * 0.2);
    playBreak(strength);

    // A smaller inner behind the main one, often enough that the beach is never
    // truly silent and the breaks overlap the way real ones do.
    if (Math.random() < sc.innerChance) {
        scheduleInner(sc.innerStrength + Math.random() * 0.2);
    }

    const span = sc.maxGapSeconds - sc.minGapSeconds;
    nextBreakIn = (sc.minGapSeconds + Math.random() * span) * state.gapScale;
}

/** An inner break a beat behind the main one. Scheduled against the audio clock
 *  rather than the frame clock, so it lands where it was meant to even if the
 *  renderer stutters. */
function scheduleInner(strength) {
    if (typeof setTimeout !== 'function') return;
    const delay = 900 + Math.random() * 1600;
    setTimeout(() => {
        if (ctx && !muted && !suspended) playBreak(clamp01(strength));
    }, delay);
}

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

// ---- Sea state --------------------------------------------------------------

/** Move the sea between calm and stormy, 0 to 1. The weather cycle will drive
 *  this continuously, so a squall rolling through is heard as well as seen. */
export function setIntensity(value) {
    intensity = clamp01(typeof value === 'number' ? value : 0.5);
}

export function getIntensity() { return intensity; }

/** Hand wave timing over to the water simulation, or take it back. */
export function setAutoBreaks(on) {
    autoBreaks = !!on;
    if (autoBreaks && nextBreakIn <= 0) nextBreakIn = 1;
}

export function isAutoBreaks() { return autoBreaks; }

// ---- Mute and suspend -------------------------------------------------------

/** How loud the master should be right now, given both reasons it might not be.
 *
 *  ONE PLACE THAT ANSWERS IT, so the two switches compose instead of fighting.
 *  Either alone is silence and neither can override the other, which is the
 *  only arrangement where unmuting a hidden tab stays quiet and revealing a
 *  muted one does too. Two independent writers to `master.gain` would get this
 *  wrong the first time the second one ran. */
function level() {
    if (!settings) return 0;
    return (muted || suspended) ? 0 : settings.masterGain;
}

function fadeTo(target, seconds) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + Math.max(0.01, seconds));
}

/** Muting is a gain of zero rather than a torn down context, so the bed is
 *  exactly where it was when the visitor turns the sound back on, and the sea
 *  does not restart mid wave. */
export function setMuted(on) {
    muted = !!on;
    if (!ctx) return muted;
    // Let the phone go back to its ambient session while muted, rather than
    // holding the playback category open for silence.
    if (muted) stopSilentKeepAlive(); else startSilentKeepAlive();
    fadeTo(level(), muted ? settings.fadeOutSeconds : settings.fadeInSeconds);
    return muted;
}

export function isMuted() { return muted; }

/** Stop the sound while the tab is hidden. Not the visitor's choice and not
 *  shown as one, which is why it is kept apart from `muted`. */
export function setSuspended(on) {
    suspended = !!on;
    if (!ctx) return suspended;
    fadeTo(level(), suspended ? settings.fadeOutSeconds : settings.fadeInSeconds);
    return suspended;
}

export function isSuspended() { return suspended; }

export function isRunning() { return !!ctx; }
export function getContext() { return ctx; }

// ---- Teardown ---------------------------------------------------------------

/** Give everything back. Safe to call twice, and safe to call having never
 *  started, which is what makes `initSurf` able to open with it. */
export function disposeSurf() {
    if (typeof document !== 'undefined') {
        if (armListeners) {
            document.removeEventListener('click', armListeners);
            document.removeEventListener('keydown', armListeners);
            document.removeEventListener('touchend', armListeners);
        }
        document.removeEventListener('visibilitychange', onVisibility);
    }
    armListeners = null;
    armed = false;
    stopSilentKeepAlive();

    if (bed) {
        Object.keys(bed).forEach((name) => {
            const voice = bed[name];
            try {
                if (voice.source.stop) voice.source.stop();
                voice.source.disconnect();
                voice.filter.disconnect();
                voice.gain.disconnect();
            } catch (e) { /* already gone */ }
        });
    }
    bed = null;

    if (ctx && typeof ctx.close === 'function') {
        try { ctx.close(); } catch (e) { /* already closed */ }
    }
    ctx = null;
    master = null;
    noiseBuffer = null;
    elapsed = 0;
    nextBreakIn = 0;
    lastBreakAt = -Infinity;
    intensity = 0.5;
}

export function isArmed() { return armed; }

export const __test__ = {
    MIN_BREAK_GAP,
    NOISE_SECONDS,
    level,
    clamp01,
    driftBed,
    fireScheduledBreak,
    panNode,
    getBed: () => bed,
    getElapsed: () => elapsed,
    getNextBreakIn: () => nextBreakIn,
    setElapsed: (v) => { elapsed = v; }
};
