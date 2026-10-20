// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sound.js - Derby Day's sound (M2): the gate dropping, the wheels on the
 * aluminum, the timer's beep as each car crosses, and the crowd's murmur.
 *
 * NO CHEER, NO GROAN (Steve's QA, 2026-10-19): a crowd made from noise
 * trembling a few times a second read as a rasp, not applause, so both
 * came out. A crowd's reaction is the families jumping, not a sound.
 *
 * MUTED BY DEFAULT (D2), with the floating speaker button and M, as
 * www/leaves has. Nothing is remembered yet: the settings join the garage's
 * storage in M3, with its privacy disclosure.
 *
 * TWO WAYS OUT OF ONE BUS (PLANNING, The clip). Every sound goes into a bus,
 * and the bus splits: to the speakers, through the mute, and to the share
 * clip's recording, through its own gain. Muting the speakers never
 * silences a clip: the clip's sound follows only its "Include sound" box.
 *
 * NOTHING EXISTS UNTIL A GESTURE, as in www/leaves: a browser will not start
 * audio before a click, a tap or a key. The context is made when the
 * visitor turns the sound on, or asks for a clip (both gestures). A browser
 * with no Web Audio, or one that refuses, simply stays quiet, and every
 * call is safe before the context exists and after it has gone.
 *
 * ON AN iPHONE plain Web Audio is muted by the ring switch, so a visitor who
 * turns the sound on has asked for it, and where Safari offers
 * navigator.audioSession it is set to playback, through the switch.
 *
 * THE WORKSHOP (M4) has two more: the coping saw's rasp and the sandpaper's
 * hush, each a band of the same noise, pulsing a stroke at a time.
 *
 * EVERY SOUND IS MADE HERE, from two seconds of noise and a few tones, so
 * the page loads no audio file. One-shots let go of their nodes when they
 * end, so nothing piles up across a race day.
 */

/** The browser's AudioContext, or null. */
function contextClass(win) {
    if (!win) return null;
    return win.AudioContext || win.webkitAudioContext || null;
}

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
 * The sound, off. `S` is config.sound, `win` the window (for its
 * AudioContext). Returns { isOn, setOn, toggle, setLevel, ensure, roll,
 * gate, beep, work, puff, tap, buzz, murmur, recordStream, setRecording,
 * dispose }.
 */
export function createSound(S, { win = typeof window === 'undefined' ? null : window } = {}) {
    let ctx = null;
    let failed = false;
    let on = false;
    let level = S.master;
    let bus = null;
    let speakers = null;
    let recordGain = null;
    let recordDest = null;
    let recording = false;
    let includeSound = true;
    let noise = null;
    let rollVoice = null;
    let murmurVoice = null;

    function build() {
        if (ctx || failed) return Boolean(ctx);
        const Ctor = contextClass(win);
        if (!Ctor) {
            failed = true;
            return false;
        }
        try {
            ctx = new Ctor();
            bus = ctx.createGain();
            speakers = ctx.createGain();
            speakers.gain.value = on ? level : 0;
            bus.connect(speakers);
            const L = S.limiter;
            if (ctx.createDynamicsCompressor) {
                const limiter = ctx.createDynamicsCompressor();
                limiter.threshold.value = L.threshold;
                limiter.knee.value = L.knee;
                limiter.ratio.value = L.ratio;
                limiter.attack.value = L.attack;
                limiter.release.value = L.release;
                speakers.connect(limiter);
                limiter.connect(ctx.destination);
            } else {
                speakers.connect(ctx.destination);
            }
            recordGain = ctx.createGain();
            recordGain.gain.value = 0;
            bus.connect(recordGain);
            const frames = Math.floor(ctx.sampleRate * 2);
            noise = ctx.createBuffer(1, frames, ctx.sampleRate);
            const data = noise.getChannelData(0);
            let last = 0;
            for (let k = 0; k < frames; k++) {
                last = last * 0.5 + (Math.random() * 2 - 1) * 0.5;
                data[k] = last * 1.5;
            }
            rollVoice = makeRoll();
            return true;
        } catch (e) {
            ctx = null;
            failed = true;
            return false;
        }
    }

    /** The wheels: looped noise through a band and a top cut, into a gain
     *  the frame sets. */
    function makeRoll() {
        const R = S.roll;
        const source = ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = R.hz;
        band.Q.value = R.q;
        const top = ctx.createBiquadFilter();
        top.type = 'lowpass';
        top.frequency.value = R.top;
        top.Q.value = 0.7;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(band);
        band.connect(top);
        top.connect(gain);
        gain.connect(bus);
        source.start(ctx.currentTime);
        return { source, gain };
    }

    /** Whether anyone would hear a sound made now: the speakers, or a clip. */
    function audible() {
        return Boolean(ctx) && (on || (recording && includeSound));
    }

    function glide(param, value, tau) {
        param.setTargetAtTime(value, ctx.currentTime + S.ahead, tau);
    }

    /** A one-shot's envelope on `gain`: up to `peak` over `attack`, down
     *  over `decay`, and the nodes let go when it ends. */
    function envelope(gain, peak, attack, decay, nodes) {
        const t = ctx.currentTime + S.ahead;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        const end = t + attack + decay + 0.05;
        for (const n of nodes) {
            if (n.stop) n.stop(end);
        }
        const first = nodes[0];
        if (first) first.onended = () => nodes.concat([gain]).forEach((n) => { try { n.disconnect(); } catch (e) { /* gone */ } });
        return t;
    }

    function noiseShot(type, hz, q) {
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = hz;
        filter.Q.value = q;
        const gain = ctx.createGain();
        source.connect(filter);
        filter.connect(gain);
        gain.connect(bus);
        source.start(ctx.currentTime + S.ahead);
        return { source, filter, gain };
    }

    function tone(type, hz) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = hz;
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(bus);
        osc.start(ctx.currentTime + S.ahead);
        return { osc, gain };
    }

    const api = {
        isOn: () => on,
        /** The visitor's own choice, from the button or M (a gesture). */
        setOn(next) {
            on = Boolean(next);
            audioSession(on);
            if (on) build();
            if (!ctx) return on;
            if (on && ctx.resume) quietly(ctx.resume());
            glide(speakers.gain, on ? level : 0, 0.05);
            return on;
        },
        toggle() {
            return api.setOn(!on);
        },
        /** How loud the speakers are, all told (a phone a little quieter). */
        setLevel(value) {
            level = value;
            if (ctx && on) glide(speakers.gain, level, 0.05);
        },
        /** Make the context now, from a gesture (asking for a clip). */
        ensure() {
            const ok = build();
            if (ctx && ctx.resume) quietly(ctx.resume());
            return ok;
        },
        /** The wheels, 0 (still) to 1 (the field at full speed). */
        roll(amount) {
            if (!ctx || !rollVoice) return;
            const a = audible() ? Math.max(0, Math.min(1, amount)) : 0;
            glide(rollVoice.gain.gain, a * S.roll.gain, 0.06);
        },
        /** The gate dropping: a click and a thunk. */
        gate() {
            if (!audible()) return;
            const G = S.gate;
            const click = noiseShot('highpass', G.clickHz, 0.7);
            envelope(click.gain, G.gain, 0.002, G.seconds * 0.4, [click.source]);
            const thunk = tone('triangle', G.thunkHz);
            thunk.osc.frequency.exponentialRampToValueAtTime(G.thunkHz * 0.5, ctx.currentTime + S.ahead + G.seconds);
            envelope(thunk.gain, G.gain * 0.8, 0.004, G.seconds, [thunk.osc]);
        },
        /** The timer's beep as a car crosses. */
        beep() {
            if (!audible()) return;
            const B = S.beep;
            const t = tone('sine', B.hz);
            envelope(t.gain, B.gain, 0.004, B.seconds, [t.osc]);
        },
        /** The saw (`saw`) or the sandpaper (`sand`), for `seconds`: noise
         *  through a band, its loudness pulsing with each stroke. */
        work(kind, seconds) {
            if (!audible()) return;
            const W = S[kind];
            if (!W) return;
            const shot = noiseShot('bandpass', W.hz, W.q);
            shot.source.loop = true;
            // The strokes: the band's level swung by a slow wave, before the
            // envelope, so they fade with it.
            const strokes = ctx.createGain();
            strokes.gain.value = 0.55;
            shot.filter.disconnect();
            shot.filter.connect(strokes);
            strokes.connect(shot.gain);
            const lfo = ctx.createOscillator();
            lfo.type = 'triangle';
            lfo.frequency.value = W.strokeHz;
            const depth = ctx.createGain();
            depth.gain.value = 0.45;
            lfo.connect(depth);
            depth.connect(strokes.gain);
            lfo.start(ctx.currentTime + S.ahead);
            envelope(shot.gain, W.gain, 0.05, seconds, [shot.source, lfo]);
        },
        /** The crowd's murmur in the hall (M6.4), on or off: a band of
         *  noise swaying slowly, faded in and out. */
        murmur(onOff) {
            if (!ctx) return;
            const M = S.murmur;
            if (!murmurVoice) {
                const source = ctx.createBufferSource();
                source.buffer = noise;
                source.loop = true;
                const band = ctx.createBiquadFilter();
                band.type = 'bandpass';
                band.frequency.value = M.hz;
                band.Q.value = M.q;
                const sway = ctx.createOscillator();
                sway.frequency.value = M.wobbleHz;
                const depth = ctx.createGain();
                depth.gain.value = M.hz * 0.25;
                sway.connect(depth);
                depth.connect(band.frequency);
                const gain = ctx.createGain();
                gain.gain.value = 0;
                source.connect(band);
                band.connect(gain);
                gain.connect(bus);
                source.start(ctx.currentTime);
                sway.start(ctx.currentTime);
                murmurVoice = { gain };
            }
            glide(murmurVoice.gain.gain, onOff && audible() ? M.gain : 0, 0.6);
        },
        /** A puff of graphite: a short breath of low noise. */
        puff() {
            if (!audible()) return;
            const P = S.puff;
            const shot = noiseShot('lowpass', P.hz, P.q);
            envelope(shot.gain, P.gain, 0.01, P.seconds, [shot.source]);
        },
        /** A tap of the hammer on an axle. */
        tap() {
            if (!audible()) return;
            const T = S.tap;
            const t = tone('triangle', T.hz);
            envelope(t.gain, T.gain, 0.003, T.seconds, [t.osc]);
        },
        /** The weigh-in's buzz: a car over the limit. */
        buzz() {
            if (!audible()) return;
            const Z = S.buzz;
            const t = tone('square', Z.hz);
            envelope(t.gain, Z.gain, 0.01, Z.seconds, [t.osc]);
        },
        /** The clip's audio track: the recording output, made once. */
        recordStream() {
            if (!ctx || !ctx.createMediaStreamDestination) return null;
            if (!recordDest) {
                recordDest = ctx.createMediaStreamDestination();
                recordGain.connect(recordDest);
            }
            return recordDest.stream;
        },
        /** A clip is being recorded (or not), with its sound or without. */
        setRecording(isRecording, withSound = includeSound) {
            recording = Boolean(isRecording);
            includeSound = Boolean(withSound);
            if (!ctx) return;
            glide(recordGain.gain, recording && includeSound ? S.record : 0, 0.02);
        },
        dispose() {
            if (ctx && ctx.close) quietly(ctx.close());
            ctx = null;
        }
    };
    return api;
}
