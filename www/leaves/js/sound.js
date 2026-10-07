// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sound.js - the leaf blower's whoosh (M6).
 *
 * ON BY DEFAULT (`startOn`). It began muted by default (Steve, 2026-10-06:
 * "mutable and muted by default"), and after hearing it Steve asked for it
 * on (2026-10-07: "Let's have the sound on by default"). The button in the
 * corner or the M key turns it off. Nothing is remembered: the only thing
 * this scene keeps past a visit is the character choice.
 *
 * NOTHING EXISTS UNTIL THE VISITOR'S FIRST GESTURE. A browser will not start
 * audio before a click, a tap or a key, so no AudioContext is made until
 * main.js calls unlock() from the first one (or the visitor presses the
 * button or M, which is one). A browser with no Web Audio, or one that
 * refuses, simply stays quiet.
 *
 * EVERY SOUND IS MADE HERE, from two seconds of noise. No audio file, so
 * the page's Content Security Policy needs no media-src. Each blower is a
 * voice: the noise through a lowpass that spools up when the blower starts
 * and down when it stops (the "whoosh"), and a band for its body, through a
 * gain and a pan. The visitor's blower is one voice and the neighbor's is
 * another, quieter, from where he stands, and louder with the big blower.
 * ONE BLOWER AT A TIME (Steve's M6 QA: "there is no need for 2 simultaneous
 * blowing sounds - enough is enough"): his is heard only while ours is off.
 *
 * AND THE DIVE'S LANDING (M6 QA: "a 'thud' sound when the character lands on
 * the ground"): a thud for a flop onto the lawn, and for a landing in the
 * pile a crunch of leaves. Each is a one-shot, its nodes let go when it
 * ends, so nothing piles up. The thud has a body in the low mids as well as
 * its low thump, since a phone's speaker plays next to nothing below about
 * 500 Hz.
 *
 * ON AN iPHONE plain Web Audio is muted by the ring switch, and on by
 * default it stays that way: a phone set to silent stays silent. A visitor
 * who turns the sound on themselves has asked for it, so then, where Safari
 * offers navigator.audioSession, it is set to playback.
 *
 * Every call is safe before the context exists, after it has gone, and in a
 * browser with no Web Audio at all.
 */

/** The browser's AudioContext, or null. */
function contextClass() {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || window.webkitAudioContext || null;
}

/** Ask an iPhone to play through the ring switch while the sound is on. */
function audioSession(on) {
    try {
        if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto';
    } catch (e) { /* not settable */ }
}

/** Let a promise from the audio API fail quietly (some return none). */
function quietly(p) {
    if (p && typeof p.catch === 'function') p.catch(() => {});
}

/**
 * The sound, off. `S` is config.sound. Returns { isOn, toggle, setOn,
 * update, pause, resume, dispose, voices }.
 */
export function createSound(S) {
    let ctx = null;
    let master = null;
    let failed = false;
    let on = Boolean(S.startOn);
    let paused = false;
    // Whether a gesture has happened, so a context may be made.
    let unlocked = false;
    const voices = {};
    let wobble = 0;
    let noise = null;

    /** A voice: looped noise, a spooling lowpass and a body band, summed
     *  into a gain, through a pan. */
    function voice(noise) {
        const source = ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const air = ctx.createBiquadFilter();
        air.type = 'lowpass';
        air.frequency.value = S.idleHz;
        // Set every Q: an unset Q is 1, which rings.
        air.Q.value = S.airQ;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = S.bodyHz;
        band.Q.value = S.bodyQ;
        const body = ctx.createGain();
        body.gain.value = S.bodyGain;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        source.connect(air);
        air.connect(gain);
        source.connect(band);
        band.connect(body);
        body.connect(gain);
        if (pan) {
            gain.connect(pan);
            pan.connect(master);
        } else {
            gain.connect(master);
        }
        source.start(ctx.currentTime);
        return { source, air, band, body, gain, pan, level: 0, hz: S.idleHz, side: 0 };
    }

    function build() {
        const Ctor = contextClass();
        if (!Ctor) {
            failed = true;
            return false;
        }
        try {
            ctx = new Ctor();
            master = ctx.createGain();
            master.gain.value = S.master;
            master.connect(ctx.destination);
            const frames = Math.floor(ctx.sampleRate * 2);
            noise = ctx.createBuffer(1, frames, ctx.sampleRate);
            const data = noise.getChannelData(0);
            // Slightly pinked white noise: a one-pole lowpass takes the hiss
            // off the top, where a phone speaker is harshest.
            let last = 0;
            for (let k = 0; k < frames; k++) {
                last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
                data[k] = last * 1.6;
            }
            voices.mine = voice(noise);
            voices.his = voice(noise);
            return true;
        } catch (e) {
            ctx = null;
            failed = true;
            return false;
        }
    }

    /** Move a param toward `value` with time constant `tau`, from a moment
     *  just ahead of the audio clock (a change scheduled at currentTime is
     *  already in the past). */
    function glide(param, value, tau) {
        param.setTargetAtTime(value, ctx.currentTime + S.ahead, tau);
    }

    /** The visitor's own choice, from the button or M (a gesture). Only
     *  that asks an iPhone to play through its ring switch. */
    function setOn(next, { chosen = true } = {}) {
        on = Boolean(next);
        if (chosen) {
            unlocked = true;
            audioSession(on);
        }
        if (on && unlocked && !ctx && !failed) build();
        if (!ctx) return on;
        if (on) {
            if (!paused && ctx.resume) quietly(ctx.resume());
            glide(master.gain, S.master, 0.05);
        } else {
            glide(master.gain, 0, 0.05);
            Object.values(voices).forEach((v) => { v.level = 0; glide(v.gain.gain, 0, 0.05); });
        }
        return on;
    }

    /**
     * One frame. `mine` is { blowing }; `his` is { blowing, big, pan } with
     * `pan` -1 (left of the view) to 1 (right).
     */
    function update(dt, mine, his) {
        if (!ctx || !on || paused) return;
        wobble += (dt > 0 ? dt : 0) * S.wobble.hz * Math.PI * 2;
        const breathe = 1 + S.wobble.depth * Math.sin(wobble);
        const want = [
            [voices.mine, mine && mine.blowing ? 1 : 0, 0],
            // His, only while ours is quiet.
            [voices.his, his && his.blowing && !(mine && mine.blowing) ? S.neighbor * (his.big ? S.big : 1) : 0, his ? his.pan || 0 : 0]
        ];
        for (const [v, level, side] of want) {
            if (!v) continue;
            const hz = level > 0 ? S.fullHz * breathe : S.idleHz;
            // Only when something changed enough to hear, so the audio
            // thread is not handed sixty new automation events a second.
            if (Math.abs(level - v.level) > 0.01) {
                glide(v.gain.gain, level, level > v.level ? S.attack : S.release);
                v.level = level;
            }
            if (Math.abs(hz - v.hz) / v.hz > 0.02) {
                glide(v.air.frequency, hz, level > 0 ? S.spool : S.release);
                v.hz = hz;
            }
            if (v.pan && Math.abs(side - v.side) > 0.05) {
                glide(v.pan.pan, side, 0.1);
                v.side = side;
            }
        }
    }

    /** A one-shot burst of the noise through a band, `peak` loud, gone in
     *  `decay` seconds, starting at `t`. Its nodes let go when it ends. */
    function burstOf(t, hz, q, peak, decay) {
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = hz;
        band.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        source.connect(band);
        band.connect(gain);
        gain.connect(master);
        source.addEventListener('ended', () => { source.disconnect(); band.disconnect(); gain.disconnect(); });
        // A random start in the buffer, so no two sound alike.
        source.start(t, Math.random() * 1.5, decay + 0.05);
        return source;
    }

    /** A falling sine, `peak` loud, from hz0 to hz1, gone in `decay`. */
    function thump(t, hz0, hz1, peak, decay) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz0, t);
        osc.frequency.exponentialRampToValueAtTime(hz1, t + decay * 0.6);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(gain);
        gain.connect(master);
        osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect(); });
        osc.start(t);
        osc.stop(t + decay + 0.05);
        return osc;
    }

    /** A body hitting the lawn: a low thump, an "oof" of a body in the low
     *  mids a phone can play, and the crackle of the leaves it lands on.
     *  `size` 0 to 1. Returns whether it sounded. */
    function thud(size = 1) {
        if (!ctx || !on || paused || !noise) return false;
        const T = S.thud;
        const t = ctx.currentTime + S.ahead;
        const k = T.level * Math.max(0.2, Math.min(1, size));
        // A sound is never worth breaking the dive over.
        try {
            thump(t, T.hz[0], T.hz[1], k, T.decay);
            burstOf(t, T.bodyHz, T.bodyQ, k * 0.9, T.decay * 0.6);
            burstOf(t + 0.01, T.leafHz, 0.7, k * 0.25, 0.12);
        } catch (e) {
            return false;
        }
        return true;
    }

    /** A body landing in a pile of leaves: a soft whump and a long crunch
     *  of leaves, louder for a bigger pile. Returns whether it sounded. */
    function crunch(size = 1) {
        if (!ctx || !on || paused || !noise) return false;
        const T = S.thud;
        const t = ctx.currentTime + S.ahead;
        const k = T.level * Math.max(0.2, Math.min(1, size));
        try {
            thump(t, T.hz[0] * 0.8, T.hz[1], k * 0.4, T.decay);
            burstOf(t, T.leafHz, 0.6, k * 0.8, 0.45);
            burstOf(t + 0.07, T.leafHz * 0.6, 0.8, k * 0.5, 0.6);
        } catch (e) {
            return false;
        }
        return true;
    }

    /** A click, a tap or a key: audio may start now. Returns whether there
     *  is nothing more a gesture can do (it is running, or cannot be). An
     *  iPhone does not count a pointerdown, so a context made on one waits,
     *  suspended, for the touchend that follows. */
    function unlock() {
        unlocked = true;
        if (on && !ctx && !failed) build();
        if (ctx && on && !paused && ctx.resume && ctx.state !== 'running') quietly(ctx.resume());
        return failed || Boolean(ctx && ctx.state === 'running');
    }

    /** The page is hidden: let the audio clock rest. */
    function pause() {
        paused = true;
        if (ctx && ctx.suspend) quietly(ctx.suspend());
    }

    function resume() {
        paused = false;
        if (ctx && on && ctx.resume) quietly(ctx.resume());
    }

    function dispose() {
        Object.values(voices).forEach((v) => {
            try { v.source.stop(); } catch (e) { /* never started */ }
        });
        if (ctx && ctx.close) quietly(ctx.close());
        ctx = null;
    }

    return {
        isOn: () => on,
        setOn,
        unlock,
        thud,
        crunch,
        toggle: () => setOn(!on),
        update,
        pause,
        resume,
        dispose,
        voices,
        context: () => ctx
    };
}
