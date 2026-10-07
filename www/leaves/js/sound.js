// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sound.js - the leaf blower's whoosh (M6).
 *
 * OFF UNTIL THE VISITOR TURNS IT ON. A leaf blower is famously annoying, and
 * a page that roars the moment somebody taps it in a quiet room is a page
 * closed in a hurry, so the sound starts off on every visit (Steve,
 * 2026-10-06: "mutable and muted by default"). The button in the corner or
 * the M key turns it on. Nothing is remembered: the only thing this scene
 * keeps past a visit is the character choice.
 *
 * NOTHING EXISTS UNTIL THEN. No AudioContext is made until the visitor turns
 * the sound on, which is always a click or a key, the gesture a browser
 * wants before it will play anything. A browser with no Web Audio, or one
 * that refuses, simply stays quiet.
 *
 * EVERY SOUND IS MADE HERE, from two seconds of noise. No audio file, so
 * the page's Content Security Policy needs no media-src. Each blower is a
 * voice: the noise through a lowpass that spools up when the blower starts
 * and down when it stops (the "whoosh"), and a band for its body, through a
 * gain and a pan. The visitor's blower is one voice and the neighbor's is
 * another, quieter, from where he stands, and louder with the big blower.
 *
 * ON AN iPHONE plain Web Audio is muted by the ring switch. A visitor who
 * has turned the sound on has asked for it, so where Safari offers
 * navigator.audioSession it is set to playback while the sound is on.
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
    let on = false;
    let paused = false;
    const voices = {};
    let wobble = 0;

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
            const noise = ctx.createBuffer(1, frames, ctx.sampleRate);
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

    function setOn(next) {
        on = Boolean(next);
        audioSession(on);
        if (on && !ctx && !failed) build();
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
            [voices.his, his && his.blowing ? S.neighbor * (his.big ? S.big : 1) : 0, his ? his.pan || 0 : 0]
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
        toggle: () => setOn(!on),
        update,
        pause,
        resume,
        dispose,
        voices,
        context: () => ctx
    };
}
