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

const { createSound } = await import('../www/leaves/js/sound.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = C.sound;

let built;

function param(initial = 0) {
    return {
        value: initial,
        calls: [],
        setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); return this; },
        setTargetAtTime(v, t, c) { this.value = v; this.calls.push(['target', v, t, c]); return this; }
    };
}

function node(kind) {
    const n = { kind, to: [], connect(target) { this.to.push(target); return target; }, disconnect() {} };
    built.nodes.push(n);
    return n;
}

class FakeAudioContext {
    constructor() {
        built.contexts++;
        this.currentTime = 10;
        this.sampleRate = 48000;
        this.destination = { kind: 'destination' };
        this.state = 'running';
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
    resume() { built.resumed++; return Promise.resolve(); }
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

describe('silent until asked', () => {
    test('no AudioContext at all until the sound is turned on, however much the blower runs', () => {
        const sound = createSound(S);
        for (let k = 0; k < 120; k++) sound.update(1 / 60, { blowing: true }, { blowing: true, pan: 0 });
        expect(built.contexts).toBe(0);
        expect(sound.isOn()).toBe(false);
    });

    test('turned on, one context, and only ever one, however often it is toggled', () => {
        const sound = createSound(S);
        expect(sound.toggle()).toBe(true);
        expect(sound.toggle()).toBe(false);
        expect(sound.toggle()).toBe(true);
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
        sound.setOn(true);
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

    test('on an iPhone it asks to play through the ring switch only while it is on', () => {
        const session = { type: 'auto' };
        Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session }, configurable: true, writable: true });
        const sound = createSound(S);
        sound.setOn(true);
        expect(session.type).toBe('playback');
        sound.setOn(false);
        expect(session.type).toBe('auto');
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
        expect(his.gain.value).toBeLessThan(1);
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
});
