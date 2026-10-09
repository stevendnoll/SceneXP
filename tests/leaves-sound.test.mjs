// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf blower's whoosh (www/leaves/js/sound.js, M6), against a recording
 * AudioContext.
 *
 * Steve's rule (2026-10-06) is "mutable and muted by default", so most of
 * this is about silence: no AudioContext until the visitor turns the sound
 * on, nothing remembered, a browser with no Web Audio or a refusing one
 * left quiet and unbroken. Then the whoosh itself: it rises with the blower
 * and falls with it, the neighbor's is quieter and panned toward him, every
 * filter has its Q set (an unset Q is 1, which rings), and a steady blow
 * does not hand the audio thread a new event every frame.
 */
import { readFile } from 'node:fs/promises';

const { createSound, settled } = await import('../www/leaves/js/sound.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = C.sound;

let built;

function param(initial = 0) {
    return {
        value: initial,
        calls: [],
        setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); return this; },
        setTargetAtTime(v, t, c) { this.value = v; this.calls.push(['target', v, t, c]); return this; },
        linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['linear', v, t]); return this; },
        exponentialRampToValueAtTime(v, t) { this.value = v; this.calls.push(['exp', v, t]); return this; }
    };
}

function node(kind) {
    const n = {
        kind, to: [], disconnected: false, listeners: {},
        connect(target) { this.to.push(target); return target; },
        disconnect() { this.disconnected = true; },
        addEventListener(type, fn) { this.listeners[type] = fn; }
    };
    built.nodes.push(n);
    return n;
}

class FakeAudioContext {
    constructor() {
        built.contexts++;
        this.currentTime = 10;
        this.sampleRate = 48000;
        this.destination = { kind: 'destination' };
        this.state = 'suspended';
    }
    createGain() { const n = node('gain'); n.gain = param(1); return n; }
    createBiquadFilter() {
        const n = node('filter');
        n.type = 'lowpass';
        n.frequency = param(350);
        n.Q = param(1);
        return n;
    }
    createStereoPanner() { const n = node('panner'); n.pan = param(0); return n; }
    createOscillator() {
        const n = node('oscillator');
        n.frequency = param(440);
        n.start = (t) => { n.started = t; };
        n.stop = (t) => { n.stopped = t; };
        return n;
    }
    createBufferSource() {
        const n = node('source');
        n.start = (t) => { n.started = t; };
        n.stop = () => { n.stopped = true; };
        return n;
    }
    createBuffer(channels, frames, rate) {
        const data = new Float32Array(frames);
        built.buffers.push({ channels, frames, rate, data });
        return { length: frames, getChannelData: () => data };
    }
    // Like a browser, the context runs a moment after it is asked to.
    resume() { built.resumed++; return Promise.resolve().then(() => { this.state = 'running'; }); }
    suspend() { built.suspended++; return Promise.resolve(); }
    close() { built.closed++; return Promise.resolve(); }
}

let savedWindow;
let savedNavigator;
beforeEach(() => {
    built = { contexts: 0, nodes: [], buffers: [], resumed: 0, suspended: 0, closed: 0 };
    savedWindow = globalThis.window;
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    globalThis.window = { AudioContext: FakeAudioContext };
});
afterEach(() => {
    globalThis.window = savedWindow;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
});

const gains = () => built.nodes.filter((n) => n.kind === 'gain');
const filters = () => built.nodes.filter((n) => n.kind === 'filter');
/** The two voices' output gains (each feeds a panner). */
const voiceGains = () => gains().filter((g) => g.to.some((t) => t.kind === 'panner'));

describe('on, but silent until the visitor acts', () => {
    // Steve's M6 QA, 2026-10-07: "Let's have the sound on by default."
    test('on from the start, and still no AudioContext before a gesture, however much the blower runs', () => {
        expect(S.startOn).toBe(true);
        const sound = createSound(S);
        expect(sound.isOn()).toBe(true);
        for (let k = 0; k < 120; k++) sound.update(1 / 60, { blowing: true }, { blowing: true, pan: 0 });
        expect(built.contexts).toBe(0);
    });

    test('the first gesture makes one context, and only ever one, however often it is toggled', async () => {
        const sound = createSound(S);
        // An iPhone's pointerdown makes it but cannot start it, so the next
        // gesture is still wanted, and once it runs no more are.
        expect(sound.unlock()).toBe(false);
        await Promise.resolve();
        await Promise.resolve();
        expect(sound.unlock()).toBe(true);
        expect(sound.toggle()).toBe(false);
        expect(sound.toggle()).toBe(true);
        expect(sound.toggle()).toBe(false);
        expect(built.contexts).toBe(1);
        // Two seconds of noise, made here, not loaded.
        expect(built.buffers).toHaveLength(1);
        expect(built.buffers[0].frames).toBe(96000);
        const peak = built.buffers[0].data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        expect(peak).toBeGreaterThan(0.1);
        expect(peak).toBeLessThanOrEqual(1.6);
    });

    test('turned off, the master falls to nothing', () => {
        const sound = createSound(S);
        sound.unlock();
        const master = gains().find((g) => g.to.some((t) => t.kind === 'destination'));
        sound.setOn(false);
        expect(master.gain.calls[master.gain.calls.length - 1][1]).toBe(0);
    });

    test('a browser with no Web Audio, or one that refuses, stays quiet and unbroken', () => {
        globalThis.window = {};
        const none = createSound(S);
        expect(() => none.setOn(true)).not.toThrow();
        expect(() => none.update(1 / 60, { blowing: true }, { blowing: false })).not.toThrow();
        expect(() => none.pause()).not.toThrow();
        expect(() => none.dispose()).not.toThrow();
        globalThis.window = { AudioContext: function NoAudio() { throw new Error('no audio for you'); } };
        const refused = createSound(S);
        expect(() => refused.setOn(true)).not.toThrow();
        expect(() => refused.update(1 / 60, { blowing: true }, { blowing: false })).not.toThrow();
        expect(refused.context()).toBe(null);
    });

    test('nothing about it is remembered: the module never touches storage', async () => {
        const source = await readFile(new URL('../www/leaves/js/sound.js', import.meta.url), 'utf8');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
        // And it plays no media element, so the page needs no media-src.
        expect(source).not.toMatch(/createElement\(\s*['"]audio|new Audio\(|createObjectURL/);
    });

    test('on an iPhone, on by default respects the ring switch, and only the visitor turning it on plays through it', () => {
        const session = { type: 'auto' };
        Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session }, configurable: true, writable: true });
        const sound = createSound(S);
        sound.unlock();
        expect(session.type).toBe('auto');
        sound.setOn(false);
        expect(session.type).toBe('auto');
        sound.setOn(true);
        expect(session.type).toBe('playback');
        sound.setOn(false);
        expect(session.type).toBe('auto');
    });

    test('off by default, a gesture makes nothing', () => {
        const sound = createSound({ ...S, startOn: false });
        expect(sound.isOn()).toBe(false);
        sound.unlock();
        expect(built.contexts).toBe(0);
    });
});

describe('the whoosh', () => {
    test('every filter has its Q set, and none rings', () => {
        createSound(S).setOn(true);
        expect(filters().length).toBe(4);
        for (const f of filters()) {
            expect(f.Q.value).not.toBe(1);
            expect(f.Q.value).toBeLessThanOrEqual(1);
        }
    });

    test('it spools up with the blower and down when it stops', () => {
        const sound = createSound(S);
        sound.setOn(true);
        const [mine] = voiceGains();
        const air = filters().find((f) => f.type === 'lowpass');
        sound.update(1 / 60, { blowing: true }, { blowing: false, pan: 0 });
        const up = mine.gain.calls[mine.gain.calls.length - 1];
        expect(up[0]).toBe('target');
        expect(up[1]).toBe(1);
        expect(up[3]).toBe(S.attack);
        // Scheduled ahead of the audio clock, never at it.
        expect(up[2]).toBeGreaterThan(10);
        expect(air.frequency.value).toBeGreaterThan(S.fullHz * (1 - S.wobble.depth) - 1);
        sound.update(1 / 60, { blowing: false }, { blowing: false, pan: 0 });
        const down = mine.gain.calls[mine.gain.calls.length - 1];
        expect(down[1]).toBe(0);
        expect(down[3]).toBe(S.release);
        expect(air.frequency.value).toBe(S.idleHz);
    });

    test('the neighbor\'s is quieter, louder with the big blower, and comes from his side', () => {
        const sound = createSound(S);
        sound.setOn(true);
        const [, his] = voiceGains();
        const panners = built.nodes.filter((n) => n.kind === 'panner');
        sound.update(1 / 60, { blowing: false }, { blowing: true, big: false, pan: 0.8 });
        expect(his.gain.value).toBeCloseTo(S.neighbor, 5);
        expect(panners[1].pan.value).toBe(0.8);
        sound.update(1 / 60, { blowing: false }, { blowing: true, big: true, pan: 0.8 });
        expect(his.gain.value).toBeCloseTo(S.neighbor * S.big, 5);
        expect(S.neighbor).toBeGreaterThanOrEqual(0.75);
    });

    test('a steady blow does not hand the audio thread an event every frame', () => {
        const sound = createSound(S);
        sound.setOn(true);
        const before = built.nodes.reduce((n, x) => n + ['gain', 'frequency', 'pan'].reduce((m, k) => m + ((x[k] && x[k].calls) ? x[k].calls.length : 0), 0), 0);
        for (let k = 0; k < 120; k++) sound.update(1 / 60, { blowing: true }, { blowing: false, pan: 0 });
        const after = built.nodes.reduce((n, x) => n + ['gain', 'frequency', 'pan'].reduce((m, k) => m + ((x[k] && x[k].calls) ? x[k].calls.length : 0), 0), 0);
        // Two seconds: the start, and the air's slow breathing.
        expect(after - before).toBeLessThan(40);
    });

    test('a hidden page lets the audio clock rest, and comes back only if the sound is on', () => {
        const sound = createSound(S);
        sound.setOn(true);
        sound.pause();
        expect(built.suspended).toBe(1);
        const resumed = built.resumed;
        sound.resume();
        expect(built.resumed).toBe(resumed + 1);
        sound.setOn(false);
        sound.pause();
        sound.resume();
        expect(built.resumed).toBe(resumed + 1);
        sound.dispose();
        expect(built.closed).toBe(1);
        expect(built.nodes.filter((n) => n.kind === 'source').every((n) => n.stopped)).toBe(true);
    });

    // Steve's M6 QA: "If the user is blowing, then there is no need for 2
    // simultaneous blowing sounds - enough is enough."
    test('the neighbor\'s blower is heard only while ours is quiet', () => {
        const sound = createSound(S);
        sound.unlock();
        const [, his] = voiceGains();
        sound.update(1 / 60, { blowing: true }, { blowing: true, big: false, pan: 0.5 });
        expect(his.gain.value).toBe(0);
        sound.update(1 / 60, { blowing: false }, { blowing: true, big: false, pan: 0.5 });
        expect(his.gain.value).toBeCloseTo(S.neighbor, 5);
        sound.update(1 / 60, { blowing: true }, { blowing: true, big: true, pan: 0.5 });
        expect(his.gain.value).toBe(0);
    });
});

// Steve's M6 QA: "During the dive celebration, could we have a 'thud' sound
// when the character lands on the ground?"
describe('the landing', () => {
    test('a flop onto the lawn thuds: a low thump with a body a phone can play, and the leaves\' crackle', () => {
        const sound = createSound(S);
        sound.unlock();
        const before = built.nodes.length;
        expect(sound.thud(1)).toBe(true);
        const made = built.nodes.slice(before);
        const osc = made.find((n) => n.kind === 'oscillator');
        expect(osc).toBeTruthy();
        // It falls in pitch, a body coming to rest.
        const ramp = osc.frequency.calls.find((c) => c[0] === 'exp');
        expect(ramp[1]).toBeLessThan(osc.frequency.calls[0][1]);
        // A band at or above 500 Hz carries it on a phone's small speaker.
        const bands = made.filter((n) => n.kind === 'filter').map((f) => f.frequency.value);
        expect(Math.max(...bands)).toBeGreaterThanOrEqual(500);
        expect(bands.some((hz) => hz >= 400 && hz <= 900)).toBe(true);
        // Scheduled ahead of the audio clock, never at it.
        expect(osc.started).toBeGreaterThan(10);
    });

    test('a landing in the pile crunches instead, and nothing it made is left connected once it ends', () => {
        const sound = createSound(S);
        sound.unlock();
        const before = built.nodes.length;
        expect(sound.crunch(0.8)).toBe(true);
        const made = built.nodes.slice(before);
        expect(made.filter((n) => n.kind === 'source').length).toBeGreaterThanOrEqual(2);
        for (const n of made) if (n.listeners.ended) n.listeners.ended();
        const players = made.filter((n) => n.kind === 'source' || n.kind === 'oscillator');
        expect(players.length).toBeGreaterThan(0);
        expect(made.every((n) => n.disconnected)).toBe(true);
    });

    test('silent with the sound off, before any gesture, and in a browser with no Web Audio', () => {
        const before = createSound(S);
        expect(before.thud()).toBe(false);
        const off = createSound(S);
        off.unlock();
        off.setOn(false);
        expect(off.thud()).toBe(false);
        expect(off.crunch()).toBe(false);
        globalThis.window = {};
        const none = createSound(S);
        none.unlock();
        expect(none.thud()).toBe(false);
    });
});

// Steve's QA, 2026-10-08: a celebration when every last leaf is off the lawn.
describe('the chime', () => {
    test('rising bells, one after another, scheduled ahead, and nothing left connected once they ring out', () => {
        const sound = createSound(S);
        sound.unlock();
        const before = built.nodes.length;
        expect(sound.chime()).toBe(true);
        const made = built.nodes.slice(before);
        const oscs = made.filter((n) => n.kind === 'oscillator');
        // A sine and a partial for each note.
        expect(oscs.length).toBe(S.chime.notes.length * 2);
        const fundamentals = oscs.filter((_, k) => k % 2 === 0);
        const pitches = fundamentals.map((o) => o.frequency.calls[0][1]);
        expect(pitches).toEqual(S.chime.notes);
        const starts = fundamentals.map((o) => o.started);
        expect(starts[0]).toBeGreaterThan(10);
        for (let k = 1; k < starts.length; k++) expect(starts[k]).toBeCloseTo(starts[k - 1] + S.chime.gap, 6);
        // Each rings out to nothing, and lets go.
        for (const g of made.filter((n) => n.kind === 'gain')) expect(g.gain.calls.at(-1)).toEqual(['exp', 0.0001, expect.any(Number)]);
        for (const n of made) if (n.listeners.ended) n.listeners.ended();
        expect(made.every((n) => n.disconnected)).toBe(true);
    });

    test('silent with the sound off, before any gesture, and in a browser with no Web Audio', () => {
        expect(createSound(S).chime()).toBe(false);
        const off = createSound(S);
        off.unlock();
        off.setOn(false);
        expect(off.chime()).toBe(false);
        globalThis.window = {};
        const none = createSound(S);
        none.unlock();
        expect(none.chime()).toBe(false);
    });
});

// Steve's QA, 2026-10-08: a bigger celebration for a clear lawn.
describe('the fanfare', () => {
    test('bells rising, then a chord, and a shimmer over it for a clear lawn inside the time', () => {
        const sound = createSound(S);
        sound.unlock();
        let before = built.nodes.length;
        expect(sound.fanfare(false)).toBe(true);
        const small = built.nodes.slice(before).filter((n) => n.kind === 'oscillator');
        expect(small.length).toBe((S.fanfare.rise.length + S.fanfare.chord.length) * 2);
        // The chord rings together, after the rise.
        const starts = small.filter((_, k) => k % 2 === 0).map((o) => o.started);
        const chord = starts.slice(S.fanfare.rise.length);
        expect(new Set(chord).size).toBe(1);
        expect(chord[0]).toBeGreaterThan(starts[S.fanfare.rise.length - 1]);
        before = built.nodes.length;
        expect(sound.fanfare(true)).toBe(true);
        const big = built.nodes.slice(before).filter((n) => n.kind === 'oscillator');
        expect(big.length).toBe(small.length + S.fanfare.shimmer.length * 2);
        const off = createSound(S);
        expect(off.fanfare(true)).toBe(false);
    });
});

// Steve's QA, 2026-10-08: on a phone it "seems way too loud relative to the
// speaker's volume", and the silent switch kept, with the button fixed.
describe('on a phone', () => {
    test('a quieter level, set before or after the sound starts, and kept through off and on', () => {
        const sound = createSound(S);
        sound.setLevel(S.masterMobile);
        expect(sound.level()).toBe(S.masterMobile);
        sound.unlock();
        const master = gains()[0];
        expect(master.gain.value).toBe(S.masterMobile);
        sound.setOn(false);
        sound.setOn(true);
        expect(master.gain.calls.at(-1)).toEqual(['target', S.masterMobile, expect.any(Number), expect.any(Number)]);
        sound.setLevel(S.master);
        expect(master.gain.calls.at(-1)[1]).toBe(S.master);
        expect(S.masterMobile).toBeLessThan(S.master);
    });

    test('everything goes out through a limiter where the browser has one, and straight out where it has not', () => {
        const made = [];
        FakeAudioContext.prototype.createDynamicsCompressor = function () {
            const n = node('limiter');
            for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = param(0);
            made.push(n);
            return n;
        };
        try {
            const sound = createSound(S);
            sound.unlock();
            expect(made).toHaveLength(1);
            const limiter = made[0];
            expect(limiter.threshold.value).toBe(S.limiter.threshold);
            expect(limiter.ratio.value).toBe(S.limiter.ratio);
            expect(gains()[0].to).toEqual([limiter]);
            expect(limiter.to.map((t) => t.kind)).toEqual(['destination']);
        } finally {
            delete FakeAudioContext.prototype.createDynamicsCompressor;
        }
        const before = built.nodes.length;
        const plain = createSound(S);
        plain.unlock();
        const master = built.nodes.slice(before).find((n) => n.kind === 'gain');
        expect(master.to.map((t) => t.kind)).toEqual(['destination']);
    });
});

// Steve's QA, 2026-10-08: "sounds great if my system's volume is at 25% or
// less, but anything over 50% and it gets LOUD", on a phone and a computer.
describe('never too loud', () => {
    /** One biquad (Web Audio's, RBJ's cookbook) as a sample-at-a-time step. */
    function biquad(type, f0, Q, fs) {
        const w = 2 * Math.PI * f0 / fs;
        const c = Math.cos(w);
        const a = Math.sin(w) / (2 * Q);
        const b = type === 'lowpass' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [a, 0, -a];
        return step([...b, -2 * c, 1 - a].map((k) => k / (1 + a)));
    }
    function step(k) {
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        return (x) => {
            const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            return y;
        };
    }

    /** The blower at full blow, at `level`, through the voice's own filters
     *  and the module's own noise, measured as ITU-R BS.1770 loudness (LUFS,
     *  K-weighted, a centered pan sending cos(pi/4) to each side). Music is
     *  mastered near -14. */
    function loudness(level) {
        createSound(S).setOn(true);
        const noise = built.buffers[0].data;
        const fs = 48000;
        const air = biquad('lowpass', S.fullHz, S.airQ, fs);
        const band = biquad('bandpass', S.bodyHz, S.bodyQ, fs);
        // The K-weighting at 48 kHz, the standard's own coefficients.
        const shelf = step([1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]);
        const high = step([1, -2, 1, -1.99004745483398, 0.99007225036621]);
        const side = Math.cos(Math.PI / 4);
        let sum = 0;
        const n = fs * 4;
        for (let i = 0; i < n; i++) {
            const x = noise[i % noise.length];
            const k = high(shelf((air(x) + band(x) * S.bodyGain) * level * side));
            sum += k * k;
        }
        return -0.691 + 10 * Math.log10(2 * sum / n);
    }

    test('a computer\'s blower stays far under music, and a phone\'s a step under that', () => {
        const computer = loudness(S.master);
        const phone = loudness(S.masterMobile);
        // About -30.5 and -36.6. It was -22.5 and -28.6.
        expect(computer).toBeLessThan(-29);
        expect(computer).toBeGreaterThan(-33);
        expect(phone).toBeLessThan(computer - 5);
        // The measure itself is sound: the old level reads 8 dB louder.
        expect(loudness(0.22) - computer).toBeCloseTo(8, 0);
    });

    test('held, it settles back a few decibels, and every new blow starts at full strength', () => {
        expect(settled(0, 5, S.settle)).toBe(0);
        expect(settled(1, 0.5, S.settle)).toBe(1);
        expect(settled(1, S.settle.after + 0.1, S.settle)).toBe(S.settle.level);
        expect(settled(0.8, 9, S.settle)).toBeCloseTo(0.8 * S.settle.level, 9);
        expect(settled(1, 9, undefined)).toBe(1);
        const dB = 20 * Math.log10(S.settle.level);
        expect(dB).toBeLessThan(-3);
        expect(dB).toBeGreaterThan(-6);

        const sound = createSound(S);
        sound.setOn(true);
        const [mine, his] = voiceGains();
        const blow = (seconds, me, him = false) => {
            for (let t = 0; t < seconds; t += 1 / 60) sound.update(1 / 60, { blowing: me }, { blowing: him, pan: 0.4 });
        };
        blow(0.5, true);
        expect(mine.gain.value).toBe(1);
        blow(1.5, true);
        const ease = mine.gain.calls.at(-1);
        expect(ease[1]).toBe(S.settle.level);
        // Eased, not dropped: slower than the spool-up and the let-go.
        expect(ease[3]).toBe(S.settle.tau);
        expect(S.settle.tau).toBeGreaterThan(S.release);
        blow(0.1, false);
        expect(mine.gain.calls.at(-1)[1]).toBe(0);
        expect(mine.gain.calls.at(-1)[3]).toBe(S.release);
        blow(0.1, true);
        expect(mine.gain.calls.at(-1)).toEqual(['target', 1, expect.any(Number), S.attack]);
        // His settles the same way.
        blow(0.1, false, true);
        expect(his.gain.value).toBeCloseTo(S.neighbor, 5);
        blow(2, false, true);
        expect(his.gain.value).toBeCloseTo(S.neighbor * S.settle.level, 5);
    });
});
