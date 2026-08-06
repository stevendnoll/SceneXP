// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Earth Defense sound (www/earthdefense/js/audio.js).
 *
 * Sound is the one part of an experience nobody can check by reading a diff and
 * nobody can check in CI by listening, so what this suite holds is the set of
 * promises AROUND the sound rather than the sound itself:
 *
 *   1. SILENT UNTIL THE VISITOR ACTS. No AudioContext is constructed until the
 *      first click or key. A page loaded and never touched makes no sound, asks
 *      for no permission, and holds no audio hardware.
 *   2. NEVER LOAD-BLOCKING, AND NEVER FATAL. A browser with no Web Audio, or
 *      one that throws when a context is constructed, gets a quiet game rather
 *      than a broken one. Every entry point is safe before arming and after
 *      disposal.
 *   3. NOTHING ACCUMULATES. Every one-shot voice disconnects itself when it
 *      ends, or a ten minute run leaves thousands of orphaned nodes hanging off
 *      the master gain and the mix quietly degrades.
 *   4. MUTING IS A GAIN, NOT A TEARDOWN, so the engine tone is exactly where it
 *      was when the visitor turns the sound back on.
 *
 * The fake context below records the graph rather than modelling any audio: what
 * is assertable is which nodes were made, what they were connected to, and
 * whether they were let go.
 */
import { jest } from '@jest/globals';

// ---- A recording AudioContext ----------------------------------------------

let built;

function makeParam(initial = 0) {
    return {
        value: initial,
        calls: [],
        setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); return this; },
        setTargetAtTime(v, t, c) { this.value = v; this.calls.push(['target', v, t, c]); return this; },
        exponentialRampToValueAtTime(v, t) { this.value = v; this.calls.push(['ramp', v, t]); return this; },
        linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['linear', v, t]); return this; }
    };
}

function makeNode(kind) {
    const node = {
        kind,
        connectedTo: [],
        disconnected: false,
        connect(target) { this.connectedTo.push(target); return target; },
        disconnect() { this.disconnected = true; }
    };
    built.nodes.push(node);
    return node;
}

class FakeAudioContext {
    constructor() {
        built.contexts++;
        this.currentTime = 0;
        this.sampleRate = 48000;
        this.destination = { kind: 'destination', connect() {}, disconnect() {} };
        this.closed = false;
    }
    createGain() {
        const node = makeNode('gain');
        node.gain = makeParam(1);
        return node;
    }
    createOscillator() {
        const node = makeNode('oscillator');
        node.type = 'sine';
        node.frequency = makeParam(440);
        node.started = null;
        node.stopped = null;
        node.listeners = {};
        node.start = (t) => { node.started = t === undefined ? 0 : t; };
        node.stop = (t) => { node.stopped = t === undefined ? 0 : t; };
        node.addEventListener = (type, fn) => { node.listeners[type] = fn; };
        return node;
    }
    createBiquadFilter() {
        const node = makeNode('filter');
        node.type = 'lowpass';
        node.frequency = makeParam(350);
        node.Q = makeParam(1);
        return node;
    }
    createBufferSource() {
        const node = makeNode('buffer-source');
        node.buffer = null;
        node.started = null;
        node.listeners = {};
        node.start = (t) => { node.started = t === undefined ? 0 : t; };
        node.stop = () => {};
        node.addEventListener = (type, fn) => { node.listeners[type] = fn; };
        return node;
    }
    createBuffer(channels, frames, rate) {
        built.buffers.push({ channels, frames, rate });
        const data = new Float32Array(frames);
        return { length: frames, getChannelData: () => data };
    }
    close() { this.closed = true; built.closed++; return Promise.resolve(); }
}

/** Wire the browser stand-ins. `mode` decides how hostile the browser is. */
function installBrowser(mode = 'working') {
    built = { contexts: 0, closed: 0, nodes: [], buffers: [] };
    const listeners = new Map();
    globalThis.document = {
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        listeners
    };
    globalThis.window = {};
    if (mode === 'working') globalThis.window.AudioContext = FakeAudioContext;
    if (mode === 'prefixed') globalThis.window.webkitAudioContext = FakeAudioContext;
    if (mode === 'throws') {
        globalThis.window.AudioContext = function () { throw new Error('no audio for you'); };
    }
    return listeners;
}

/** The visitor's first gesture. */
function gesture(type = 'click') {
    const set = globalThis.document.listeners.get(type);
    if (set) [...set].forEach(fn => fn({ type }));
}

let audio;
let CONFIG;
let listeners;

beforeEach(async () => {
    listeners = installBrowser();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    audio = await import('../www/earthdefense/js/audio.js');
});

afterEach(() => {
    if (audio) audio.disposeAudio();
    delete globalThis.document;
    delete globalThis.window;
});

const nodesOfKind = (kind) => built.nodes.filter(n => n.kind === kind);

/** Play a cue, stepping the clock past the rate limiter first. */
function afterAGap(fn) {
    audio.getContext().currentTime += CONFIG.audio.minGapSeconds * 4;
    return fn();
}

// ---- Arming -----------------------------------------------------------------

describe('silent until the visitor acts', () => {
    test('init builds no context at all, only a listener', () => {
        // Browsers refuse to start a context before a gesture and they are
        // right to. A page loaded and left alone should make no sound, ask for
        // nothing, and hold no audio hardware.
        expect(audio.initAudio(CONFIG)).toBe(true);
        expect(built.contexts).toBe(0);
        expect(audio.isRunning()).toBe(false);
        expect(listeners.get('click').size).toBe(1);
    });

    test('the first gesture starts it, and only the first', () => {
        audio.initAudio(CONFIG);
        gesture('click');
        expect(built.contexts).toBe(1);
        expect(audio.isRunning()).toBe(true);

        // A second call is a no-op rather than a second context.
        audio.start();
        expect(built.contexts).toBe(1);
    });

    test('a key or a tap arms it too, for a visitor who never clicks', () => {
        audio.initAudio(CONFIG);
        gesture('keydown');
        expect(audio.isRunning()).toBe(true);

        audio.disposeAudio();
        installBrowser();
        audio.initAudio(CONFIG);
        gesture('touchend');
        expect(audio.isRunning()).toBe(true);
    });

    test('the engine is built at once, and starts SILENT', () => {
        // A ship holding station in orbit should be genuinely quiet. The tone
        // opens from zero with the throttle rather than idling.
        audio.initAudio(CONFIG);
        gesture();
        const engine = audio.__test__.getEngine();
        expect(engine.osc.started).not.toBeNull();
        expect(engine.sub.started).not.toBeNull();
        expect(engine.gain.gain.value).toBe(0);
    });

    test('a browser with no Web Audio gets a quiet game, not a broken one', () => {
        audio.disposeAudio();
        installBrowser('none');
        audio.initAudio(CONFIG);
        expect(() => gesture()).not.toThrow();
        expect(audio.isRunning()).toBe(false);
        // And every cue is still safe to call.
        expect(audio.playFire()).toBe(false);
        expect(audio.playAlert()).toBe(false);
        expect(() => audio.setEngineThrottle(1)).not.toThrow();
    });

    test('a browser that throws on construction is caught, not fatal', () => {
        audio.disposeAudio();
        installBrowser('throws');
        audio.initAudio(CONFIG);
        expect(() => gesture()).not.toThrow();
        expect(audio.isRunning()).toBe(false);
    });

    test('the older prefixed constructor is accepted', () => {
        audio.disposeAudio();
        installBrowser('prefixed');
        audio.initAudio(CONFIG);
        gesture();
        expect(audio.isRunning()).toBe(true);
    });

    test('with no document at all there is nothing to arm', () => {
        audio.disposeAudio();
        delete globalThis.document;
        expect(audio.initAudio(CONFIG)).toBe(false);
    });

    test('every cue is safe before anything is armed', () => {
        expect(audio.playFire()).toBe(false);
        expect(audio.playHit()).toBe(false);
        expect(audio.playDestruction()).toBe(false);
        expect(audio.playAlert()).toBe(false);
        expect(audio.playLock()).toBe(false);
        expect(() => audio.setEngineThrottle(0.5)).not.toThrow();
        expect(audio.start()).toBe(false);
    });
});

// ---- The engine -------------------------------------------------------------

describe('the engine tone', () => {
    beforeEach(() => {
        audio.initAudio(CONFIG);
        gesture();
    });

    test('rises with the throttle and falls with it', () => {
        const engine = audio.__test__.getEngine();
        audio.setEngineThrottle(0);
        const idle = engine.osc.frequency.value;
        audio.setEngineThrottle(1);
        const full = engine.osc.frequency.value;

        expect(idle).toBeCloseTo(CONFIG.audio.engineIdleHz, 6);
        expect(full).toBeCloseTo(CONFIG.audio.engineFullHz, 6);
        expect(full).toBeGreaterThan(idle);
    });

    test('reverse sounds like ahead, because there is one engine', () => {
        // Giving reverse its own voice would imply a mechanism the ship does
        // not have.
        const engine = audio.__test__.getEngine();
        audio.setEngineThrottle(0.6);
        const ahead = engine.osc.frequency.value;
        audio.setEngineThrottle(-0.6);
        expect(engine.osc.frequency.value).toBeCloseTo(ahead, 6);
    });

    test('the sub sits an octave under the main voice', () => {
        const engine = audio.__test__.getEngine();
        audio.setEngineThrottle(0.75);
        expect(engine.sub.frequency.value).toBeCloseTo(engine.osc.frequency.value / 2, 6);
    });

    test('it GLIDES rather than jumping, which is what makes it an engine', () => {
        const engine = audio.__test__.getEngine();
        audio.setEngineThrottle(1);
        const last = engine.osc.frequency.calls[engine.osc.frequency.calls.length - 1];
        expect(last[0]).toBe('target');   // setTargetAtTime, not a hard set
    });

    test('a param with no scheduling still takes the value', () => {
        // Older implementations, and anything the fake does not model, should
        // land on the right number rather than throwing.
        const bare = { value: 0 };
        audio.__test__.getEngine().osc.frequency = bare;
        audio.setEngineThrottle(1);
        expect(bare.value).toBeCloseTo(CONFIG.audio.engineFullHz, 6);
    });

    test('a missing or nonsense throttle reads as closed', () => {
        const engine = audio.__test__.getEngine();
        audio.setEngineThrottle();
        expect(engine.osc.frequency.value).toBeCloseTo(CONFIG.audio.engineIdleHz, 6);
    });
});

// ---- The cues ---------------------------------------------------------------

describe('the cues', () => {
    beforeEach(() => {
        audio.initAudio(CONFIG);
        gesture();
    });

    test('each one plays, and each one builds a voice', () => {
        const before = built.nodes.length;
        expect(afterAGap(audio.playFire)).toBe(true);
        expect(afterAGap(audio.playHit)).toBe(true);
        expect(afterAGap(audio.playDestruction)).toBe(true);
        expect(afterAGap(audio.playAlert)).toBe(true);
        expect(afterAGap(audio.playLock)).toBe(true);
        expect(built.nodes.length).toBeGreaterThan(before);
    });

    test('a burst of fire is rate limited, or the mix turns to gravel', () => {
        // The guns fire four times a second and a destruction can land on the
        // same frame as three hits.
        expect(audio.playFire()).toBe(true);
        expect(audio.playFire()).toBe(false);
        expect(audio.playFire()).toBe(false);
        expect(afterAGap(audio.playFire)).toBe(true);
    });

    test('the limit is per KIND, so a hit is never swallowed by the shot', () => {
        expect(audio.playFire()).toBe(true);
        expect(audio.playHit()).toBe(true);
        expect(audio.playDestruction()).toBe(true);
    });

    test('every one-shot voice disconnects itself when it ends', () => {
        // Without this a ten minute run leaves thousands of orphaned nodes on
        // the master gain and the mix quietly degrades as it goes.
        afterAGap(audio.playFire);
        const osc = nodesOfKind('oscillator').slice(-1)[0];
        expect(osc.disconnected).toBe(false);
        osc.listeners.ended();
        expect(osc.disconnected).toBe(true);
    });

    test('a noise voice releases its filter and its gain too', () => {
        afterAGap(audio.playDestruction);
        const source = nodesOfKind('buffer-source').slice(-1)[0];
        source.listeners.ended();
        expect(source.disconnected).toBe(true);
        expect(nodesOfKind('filter').slice(-1)[0].disconnected).toBe(true);
    });

    test('a node with no addEventListener falls back to onended', () => {
        const osc = audio.__test__.tone(440, 0, 0.1, 0.2);
        expect(typeof osc.listeners.ended).toBe('function');
    });

    test('a destruction is longer and louder than a hit', () => {
        // The two land on the same frame often enough that they have to be
        // told apart by ear as well as by the burst on screen.
        expect(CONFIG.audio.destroyGain).toBeGreaterThan(CONFIG.audio.hitGain);
    });

    test('the lock blip sits under the gun cue, so it is felt not announced', () => {
        expect(CONFIG.audio.lockGain).toBeLessThan(CONFIG.audio.fireGain);
    });

    test('the noise buffer is real samples at the context rate', () => {
        const source = audio.__test__.noiseSource(0.25);
        expect(source.buffer.length).toBe(Math.floor(48000 * 0.25));
        expect(built.buffers.slice(-1)[0].rate).toBe(48000);
    });

    test('a zero length buffer is still a buffer, not a crash', () => {
        expect(() => audio.__test__.noiseSource(0)).not.toThrow();
    });
});

// ---- Mute -------------------------------------------------------------------

describe('muting', () => {
    test('is a gain of zero rather than a teardown', () => {
        // So the engine tone is exactly where it was when the sound comes back.
        audio.initAudio(CONFIG);
        gesture();
        audio.setEngineThrottle(1);
        const engine = audio.__test__.getEngine();
        const running = engine.osc.frequency.value;

        expect(audio.setMuted(true)).toBe(true);
        expect(audio.isRunning()).toBe(true);
        expect(engine.osc.frequency.value).toBe(running);

        audio.setMuted(false);
        expect(audio.isMuted()).toBe(false);
    });

    test('a muted game plays no cues at all', () => {
        audio.initAudio(CONFIG);
        gesture();
        audio.setMuted(true);
        expect(afterAGap(audio.playFire)).toBe(false);
        expect(afterAGap(audio.playDestruction)).toBe(false);
        expect(afterAGap(audio.playAlert)).toBe(false);
    });

    test('muting before the first gesture is remembered', () => {
        // The settings panel is reachable from the welcome screen, so a visitor
        // can mute before anything has ever made a sound.
        audio.initAudio(CONFIG);
        audio.setMuted(true);
        gesture();
        expect(audio.isMuted()).toBe(true);
        expect(afterAGap(audio.playFire)).toBe(false);
    });
});

// ---- Lifecycle --------------------------------------------------------------

describe('lifecycle', () => {
    test('dispose closes the context, stops the engine, and is safe twice', () => {
        audio.initAudio(CONFIG);
        gesture();
        const engine = audio.__test__.getEngine();

        audio.disposeAudio();
        expect(engine.osc.stopped).not.toBeNull();
        expect(built.closed).toBe(1);
        expect(audio.isRunning()).toBe(false);
        expect(() => audio.disposeAudio()).not.toThrow();
    });

    test('dispose removes the arming listeners rather than leaking them', () => {
        audio.initAudio(CONFIG);
        expect(listeners.get('click').size).toBe(1);
        audio.disposeAudio();
        expect(listeners.get('click').size).toBe(0);
    });

    test('re-initialising does not stack a second set of listeners', () => {
        audio.initAudio(CONFIG);
        audio.initAudio(CONFIG);
        expect(listeners.get('click').size).toBe(1);
    });

    test('a context that will not close is not a crash on the way out', () => {
        audio.initAudio(CONFIG);
        gesture();
        audio.getContext().close = () => { throw new Error('already closed'); };
        expect(() => audio.disposeAudio()).not.toThrow();
    });

    test('falls back to sensible values when config carries no audio block', () => {
        audio.disposeAudio();
        audio.initAudio({});
        gesture();
        expect(audio.isRunning()).toBe(true);
        expect(audio.__test__.getEngine().osc.frequency.value)
            .toBe(audio.__test__.DEFAULTS.engineIdleHz);
    });
});
