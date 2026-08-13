// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Ocean surf synth (www/ocean/js/audio.js).
 *
 * Sound is the one part of an experience nobody can check by reading a diff and
 * nobody can check in CI by listening, so what this suite holds is the set of
 * promises AROUND the sound rather than the sound itself:
 *
 *   1. SILENT UNTIL THE VISITOR ACTS. No AudioContext until the first gesture.
 *   2. NEVER FATAL. No Web Audio, or a context that throws on construction,
 *      gets a silent ocean rather than a broken page.
 *   3. NOTHING ACCUMULATES. This scene is built to be left running, so an hour
 *      of surf is several hundred breaks and thousands of nodes. Every one-shot
 *      voice must let go of itself.
 *   4. A WAVE IS THREE STAGES, and a bigger one is louder AND brighter. That is
 *      the difference between surf and a volume knob on static.
 *   5. MUTE IS A GAIN, NOT A TEARDOWN, and it composes with the hidden-tab
 *      suspend rather than fighting it.
 *
 * The fake context records the graph rather than modelling any audio: what is
 * assertable is which nodes were made, what they connect to, what was written
 * to their params, and whether they were let go.
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
        linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['linear', v, t]); return this; },
        cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
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

function makeSourceNode(kind) {
    const node = makeNode(kind);
    node.buffer = null;
    node.loop = false;
    node.started = null;
    node.startArgs = null;
    node.stopped = null;
    node.listeners = {};
    node.start = (...args) => { node.started = args[0] === undefined ? 0 : args[0]; node.startArgs = args; };
    node.stop = (t) => { node.stopped = t === undefined ? 0 : t; };
    node.addEventListener = (type, fn) => { node.listeners[type] = fn; };
    return node;
}

class FakeAudioContext {
    constructor() {
        built.contexts++;
        this.currentTime = 0;
        this.sampleRate = 48000;
        this.state = 'running';
        this.destination = { kind: 'destination', connect() {}, disconnect() {} };
        this.closed = false;
    }
    createGain() {
        const node = makeNode('gain');
        node.gain = makeParam(1);
        return node;
    }
    createBiquadFilter() {
        const node = makeNode('filter');
        node.type = 'lowpass';
        node.frequency = makeParam(350);
        node.Q = makeParam(1);
        return node;
    }
    createStereoPanner() {
        const node = makeNode('panner');
        node.pan = makeParam(0);
        return node;
    }
    createBufferSource() { return makeSourceNode('buffer-source'); }
    createBuffer(channels, frames, rate) {
        built.buffers.push({ channels, frames, rate });
        const data = new Float32Array(frames);
        return { length: frames, getChannelData: () => data };
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.closed = true; built.closed++; return Promise.resolve(); }
}

/** Wire the browser stand-ins. `mode` decides how hostile the browser is. */
function installBrowser(mode = 'working') {
    built = { contexts: 0, closed: 0, nodes: [], buffers: [], media: [] };
    const listeners = new Map();
    globalThis.document = {
        hidden: false,
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        createElement() {
            const el = {
                loop: false, src: null, playing: false, attrs: {},
                setAttribute(k, v) { this.attrs[k] = v; },
                play() { this.playing = true; return Promise.resolve(); },
                pause() { this.playing = false; }
            };
            built.media.push(el);
            return el;
        },
        listeners
    };
    globalThis.window = {};
    if (mode === 'working') globalThis.window.AudioContext = FakeAudioContext;
    if (mode === 'noPanner') {
        class NoPanner extends FakeAudioContext {}
        NoPanner.prototype.createStereoPanner = undefined;
        globalThis.window.AudioContext = NoPanner;
    }
    if (mode === 'prefixed') globalThis.window.webkitAudioContext = FakeAudioContext;
    if (mode === 'throws') {
        globalThis.window.AudioContext = function () { throw new Error('no audio for you'); };
    }
    globalThis.URL = { createObjectURL: () => 'blob:fake-silence' };
    globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
    return listeners;
}

/** The visitor's first gesture, which on the real page is the click that
 *  dismisses the welcome screen. */
function gesture(type = 'click') {
    const set = globalThis.document.listeners.get(type);
    if (set) [...set].forEach(fn => fn({ type }));
}

let surf;
let CONFIG;
let listeners;

beforeEach(async () => {
    listeners = installBrowser();
    jest.resetModules();
    ({ OCEAN_CONFIG: CONFIG } = await import('../www/ocean/js/config.js'));
    surf = await import('../www/ocean/js/audio.js');
});

afterEach(() => {
    if (surf) surf.disposeSurf();
    jest.restoreAllMocks();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.URL;
    delete globalThis.Blob;
});

const nodesOfKind = (kind) => built.nodes.filter(n => n.kind === kind);

/** Run one break clear of the stacking guard, and hand back only the nodes it
 *  created. */
function breakOnce(strength = 0.6, pan = 0) {
    surf.getContext().currentTime += surf.__test__.MIN_BREAK_GAP * 2;
    const mark = built.nodes.length;
    const fired = surf.playBreak(strength, pan);
    return { fired, nodes: built.nodes.slice(mark) };
}

// ---- Arming -----------------------------------------------------------------

describe('silent until the visitor acts', () => {
    test('init builds no context at all, only a listener', () => {
        expect(surf.initSurf(CONFIG)).toBe(true);
        expect(built.contexts).toBe(0);
        expect(surf.isRunning()).toBe(false);
        expect(listeners.get('click').size).toBe(1);
    });

    test('the first gesture starts it, and only the first', () => {
        surf.initSurf(CONFIG);
        gesture('click');
        expect(built.contexts).toBe(1);
        expect(surf.isRunning()).toBe(true);

        surf.start();
        expect(built.contexts).toBe(1);
    });

    test('a touch or a key arms it just as well as a click', () => {
        surf.initSurf(CONFIG);
        gesture('touchend');
        expect(surf.isRunning()).toBe(true);
    });

    test('the webkit-prefixed context is accepted', async () => {
        installBrowser('prefixed');
        jest.resetModules();
        surf = await import('../www/ocean/js/audio.js');
        surf.initSurf(CONFIG);
        gesture('click');
        expect(surf.isRunning()).toBe(true);
    });
});

// ---- Never fatal ------------------------------------------------------------

describe('a browser without Web Audio gets a silent ocean, not a broken one', () => {
    test('no AudioContext constructor at all', async () => {
        installBrowser('none');
        jest.resetModules();
        surf = await import('../www/ocean/js/audio.js');
        surf.initSurf(CONFIG);
        expect(surf.start()).toBe(false);
        expect(surf.isRunning()).toBe(false);
        expect(surf.playBreak(0.8)).toBe(false);
        expect(() => surf.update(0.016)).not.toThrow();
    });

    test('a constructor that throws is caught', async () => {
        installBrowser('throws');
        jest.resetModules();
        surf = await import('../www/ocean/js/audio.js');
        surf.initSurf(CONFIG);
        expect(surf.start()).toBe(false);
        expect(surf.isRunning()).toBe(false);
    });

    test('every entry point is safe before arming and after disposal', () => {
        expect(() => {
            surf.update(0.016);
            surf.playBreak(0.5);
            surf.setMuted(true);
            surf.setSuspended(true);
            surf.setIntensity(0.9);
            surf.setAutoBreaks(false);
            surf.disposeSurf();
            surf.disposeSurf();
        }).not.toThrow();
    });
});

// ---- The bed ----------------------------------------------------------------

describe('the bed', () => {
    beforeEach(() => { surf.initSurf(CONFIG); gesture(); });

    test('is three looping layers off one shared noise buffer', () => {
        // ONE BUFFER, NOT ONE PER VOICE. Filling a fresh buffer per wave is real
        // main-thread work for no gain when a random offset into a shared one is
        // already unrepeatable.
        expect(built.buffers).toHaveLength(1);
        expect(built.buffers[0].frames).toBe(48000 * surf.__test__.NOISE_SECONDS);

        const loops = nodesOfKind('buffer-source').filter(n => n.loop);
        expect(loops).toHaveLength(3);
        loops.forEach(n => expect(n.started).not.toBeNull());
    });

    test('drifts under itself as time passes rather than sitting still', () => {
        const bed = surf.__test__.getBed();
        const before = bed.wind.gain.gain.value;
        // A quarter period, which is the peak of the wind cycle. Half a period
        // is the one point that reads identically to the start.
        surf.__test__.setElapsed(CONFIG.audio.bed.windPeriodSeconds / 4);
        surf.__test__.driftBed();
        expect(bed.wind.gain.gain.value).not.toBeCloseTo(before, 5);
    });

    test('a rougher sea lifts every layer', () => {
        const bed = surf.__test__.getBed();
        surf.setIntensity(0);
        surf.__test__.driftBed();
        const calm = bed.swell.gain.gain.value;
        surf.setIntensity(1);
        surf.__test__.driftBed();
        expect(bed.swell.gain.gain.value).toBeGreaterThan(calm);
    });
});

// ---- One wave ---------------------------------------------------------------

describe('a wave is three stages', () => {
    beforeEach(() => { surf.initSurf(CONFIG); gesture(); });

    test('crash, wash, and drag, each its own voice, in that order', () => {
        const { fired, nodes } = breakOnce(0.7);
        expect(fired).toBe(true);

        const sources = nodes.filter(n => n.kind === 'buffer-source');
        expect(sources).toHaveLength(3);
        // The order the ear expects: the collapse, then the run up, then the
        // retreat. Each is scheduled later than the last.
        const starts = sources.map(n => n.started);
        expect(starts[0]).toBeLessThan(starts[1]);
        expect(starts[1]).toBeLessThan(starts[2]);

        // One-shots, not loops, and each takes a window of the shared buffer.
        sources.forEach((n) => {
            expect(n.loop).toBe(false);
            expect(n.startArgs).toHaveLength(3);
        });
    });

    test('the noise window never runs off the end of the buffer', () => {
        // A window that overruns the buffer does not error, it just stops early,
        // so the only symptom is a wash that cuts off rather than fades. The
        // full strength wave is the long one, so it is the one to check.
        const { nodes } = breakOnce(1);
        nodes.filter(n => n.kind === 'buffer-source').forEach((n) => {
            const [, offset, duration] = n.startArgs;
            expect(offset).toBeGreaterThanOrEqual(0);
            expect(offset + duration).toBeLessThanOrEqual(surf.__test__.NOISE_SECONDS + 1e-9);
        });
    });

    test('the noise buffer clears the longest voice the config can ask for', () => {
        // The guard above only holds while this does. Checked against the config
        // rather than a literal, so a retune of the wash trips this rather than
        // quietly shortening every large wave.
        const b = CONFIG.audio.breaks;
        const longestVoice = Math.max(
            b.crashAt + b.crashSeconds,
            b.washAt + b.washSeconds * 1.2,     // the strength-1 stretch
            b.dragAt + b.dragSeconds
        ) - b.washAt;
        expect(surf.__test__.NOISE_SECONDS).toBeGreaterThan(longestVoice);
    });

    test('a bigger wave is louder AND brighter, not just louder', () => {
        // Without the brightness move, a large wave is a small wave with the
        // volume up, which fools nobody.
        const small = breakOnce(0.1);
        const big = breakOnce(1);

        const peak = (set) => set.nodes.find(n => n.kind === 'gain')
            .gain.calls.find(c => c[0] === 'ramp')[1];
        const cutoff = (set) => set.nodes.find(n => n.kind === 'filter')
            .frequency.calls.find(c => c[0] === 'set')[1];

        expect(peak(big)).toBeGreaterThan(peak(small));
        expect(cutoff(big)).toBeGreaterThan(cutoff(small));
    });

    test('gains ramp exponentially and never to a true zero', () => {
        // An exponential ramp to 0 is undefined, and a linear one to silence
        // clicks. Every stage has to land just above zero instead.
        const { nodes } = breakOnce(0.6);
        nodes.filter(n => n.kind === 'gain').forEach((n) => {
            const ramps = n.gain.calls.filter(c => c[0] === 'ramp');
            expect(ramps.length).toBeGreaterThanOrEqual(2);
            ramps.forEach(r => expect(r[1]).toBeGreaterThan(0));
        });
    });

    test('two waves on the same frame do not stack into one louder crash', () => {
        surf.getContext().currentTime += 10;
        expect(surf.playBreak(0.8)).toBe(true);
        expect(surf.playBreak(0.8)).toBe(false);
        surf.getContext().currentTime += surf.__test__.MIN_BREAK_GAP * 2;
        expect(surf.playBreak(0.8)).toBe(true);
    });

    test('strength is clamped rather than trusted', () => {
        expect(breakOnce(50).fired).toBe(true);
        expect(breakOnce(-7).fired).toBe(true);
    });
});

// ---- Nothing accumulates ----------------------------------------------------

describe('nothing accumulates', () => {
    beforeEach(() => { surf.initSurf(CONFIG); gesture(); });

    test('every voice of a break disconnects itself when it ends', () => {
        // This scene is built to be left running. An hour is several hundred
        // breaks, and without this the master gain ends up carrying thousands of
        // dead nodes and the mix quietly degrades.
        const { nodes } = breakOnce(0.6);
        const sources = nodes.filter(n => n.kind === 'buffer-source');

        sources.forEach(n => expect(n.disconnected).toBe(false));
        sources.forEach(n => n.listeners.ended({ type: 'ended' }));

        nodes.filter(n => n.kind !== 'panner')
            .forEach(n => expect(n.disconnected).toBe(true));
    });

    test('a hundred breaks leave nothing connected behind them', () => {
        for (let i = 0; i < 100; i++) {
            const { nodes } = breakOnce(0.5);
            nodes.filter(n => n.kind === 'buffer-source')
                .forEach(n => n.listeners.ended({ type: 'ended' }));
        }
        const live = built.nodes.filter(n => !n.disconnected && n.kind === 'buffer-source' && !n.loop);
        expect(live).toHaveLength(0);
    });
});

// ---- Stereo -----------------------------------------------------------------

describe('surf is wide', () => {
    test('each break is placed across the front', () => {
        surf.initSurf(CONFIG);
        gesture();
        const { nodes } = breakOnce(0.5, -0.6);
        const panner = nodes.find(n => n.kind === 'panner');
        expect(panner).toBeDefined();
        expect(panner.pan.value).toBeCloseTo(-0.6, 5);
    });

    test('unplaced breaks land somewhere, and big ones pull toward the centre', () => {
        surf.initSurf(CONFIG);
        gesture();
        jest.spyOn(Math, 'random').mockReturnValue(1);   // hard right
        const wide = breakOnce(0, null).nodes.find(n => n.kind === 'panner').pan.value;
        const near = breakOnce(1, null).nodes.find(n => n.kind === 'panner').pan.value;
        expect(Math.abs(near)).toBeLessThan(Math.abs(wide));
    });

    test('a browser with no StereoPanner still gets surf, in mono', async () => {
        installBrowser('noPanner');
        jest.resetModules();
        surf = await import('../www/ocean/js/audio.js');
        surf.initSurf(CONFIG);
        gesture();
        const { fired, nodes } = breakOnce(0.6, 0.5);
        expect(fired).toBe(true);
        expect(nodes.find(n => n.kind === 'panner')).toBeUndefined();
    });
});

// ---- The scheduler ----------------------------------------------------------

describe('the scheduler', () => {
    beforeEach(() => {
        surf.initSurf(CONFIG);
        gesture();
        // Inners run on a real setTimeout, so keep them out of these counts.
        jest.spyOn(Math, 'random').mockReturnValue(0.99);
    });

    /** Step the frame clock and the audio clock together. */
    function run(seconds) {
        const step = 0.2;
        for (let t = 0; t < seconds; t += step) {
            surf.getContext().currentTime += step;
            surf.update(step);
        }
    }

    test('waves arrive on their own while it is on', () => {
        const before = nodesOfKind('panner').length;
        run(30);
        expect(nodesOfKind('panner').length).toBeGreaterThan(before);
    });

    test('handing timing to the water simulation stops the timer', () => {
        // The point of keeping these separable: once the water drives playBreak
        // from the visual break, the crash you hear is the wave you watched
        // rather than a timer drifting out of step beside it.
        surf.setAutoBreaks(false);
        expect(surf.isAutoBreaks()).toBe(false);
        const before = nodesOfKind('panner').length;
        run(30);
        expect(nodesOfKind('panner').length).toBe(before);
    });

    test('a rough sea closes the gaps between waves', () => {
        surf.setIntensity(0);
        run(60);
        const calm = nodesOfKind('panner').length;

        surf.disposeSurf();
        surf.initSurf(CONFIG);
        gesture();
        surf.setIntensity(1);
        run(60);
        expect(nodesOfKind('panner').length - calm).toBeGreaterThan(calm);
    });

    test('a backgrounded tab does not dump a minute of waves on return', () => {
        // requestAnimationFrame stops while hidden, so the first frame back can
        // carry an enormous delta. Clamping it is what stops the sea catching up
        // all at once.
        const before = surf.__test__.getElapsed();
        surf.update(600);
        expect(surf.__test__.getElapsed() - before).toBeLessThanOrEqual(0.25);
    });
});

// ---- Mute and suspend -------------------------------------------------------

describe('mute is a gain, not a teardown', () => {
    beforeEach(() => { surf.initSurf(CONFIG); gesture(); });

    test('muting leaves the bed exactly where it was', () => {
        const bed = surf.__test__.getBed();
        surf.setMuted(true);
        expect(surf.isMuted()).toBe(true);
        expect(surf.isRunning()).toBe(true);
        expect(bed.swell.source.stopped).toBeNull();
        expect(surf.__test__.getBed()).toBe(bed);
    });

    test('a muted sea fires no waves', () => {
        surf.setMuted(true);
        expect(surf.playBreak(0.9)).toBe(false);
    });

    test('mute and suspend compose instead of fighting', () => {
        // Either alone is silence and neither can override the other. Two
        // independent writers to master.gain would get this wrong the first time
        // the second one ran.
        const { level } = surf.__test__;
        surf.setMuted(true);
        surf.setSuspended(true);
        expect(level()).toBe(0);

        surf.setSuspended(false);         // revealing a muted tab stays quiet
        expect(level()).toBe(0);

        surf.setMuted(false);
        expect(level()).toBe(CONFIG.audio.masterGain);

        surf.setSuspended(true);          // hiding an unmuted tab goes quiet
        expect(level()).toBe(0);
    });

    test('a hidden tab makes no sound', () => {
        surf.setSuspended(true);
        expect(surf.playBreak(0.9)).toBe(false);
        surf.update(0.1);
        expect(surf.__test__.getElapsed()).toBe(0);
    });
});

// ---- The iOS ring switch ----------------------------------------------------

describe('the iOS ring switch workaround', () => {
    test('a silent element is playing while the sea is', () => {
        // Plain Web Audio sits in the "ambient" session, which the hardware
        // silent switch mutes outright. A playing media element promotes the
        // session to "playback", which it does not.
        surf.initSurf(CONFIG);
        gesture();
        expect(built.media).toHaveLength(1);
        expect(built.media[0].playing).toBe(true);
        expect(built.media[0].loop).toBe(true);
        expect(built.media[0].attrs.playsinline).toBe('');
    });

    test('muting releases the session rather than holding it open for silence', () => {
        surf.initSurf(CONFIG);
        gesture();
        surf.setMuted(true);
        expect(built.media[0].playing).toBe(false);
        surf.setMuted(false);
        expect(built.media[0].playing).toBe(true);
    });

    test('a browser with no blob URLs still gets the sea', async () => {
        installBrowser();
        globalThis.URL = {};
        jest.resetModules();
        surf = await import('../www/ocean/js/audio.js');
        surf.initSurf(CONFIG);
        expect(() => gesture()).not.toThrow();
        expect(surf.isRunning()).toBe(true);
    });
});

// ---- Teardown ---------------------------------------------------------------

describe('teardown', () => {
    test('gives back the context, the bed, and every listener', () => {
        surf.initSurf(CONFIG);
        gesture();
        const bed = surf.__test__.getBed();

        surf.disposeSurf();

        expect(built.closed).toBe(1);
        expect(surf.isRunning()).toBe(false);
        expect(surf.isArmed()).toBe(false);
        expect(bed.swell.source.stopped).not.toBeNull();
        expect(bed.swell.gain.disconnected).toBe(true);
        expect(listeners.get('visibilitychange').size).toBe(0);
    });

    test('init opens with a teardown, so a re-init leaves one context', () => {
        surf.initSurf(CONFIG);
        gesture();
        surf.initSurf(CONFIG);
        gesture();
        expect(built.closed).toBe(1);
        expect(built.contexts).toBe(2);
    });
});

// ---- Sea state --------------------------------------------------------------

describe('sea state', () => {
    test('is clamped, so the weather cycle cannot drive it off the ends', () => {
        surf.setIntensity(5);
        expect(surf.getIntensity()).toBe(1);
        surf.setIntensity(-5);
        expect(surf.getIntensity()).toBe(0);
        surf.setIntensity('stormy');
        expect(surf.getIntensity()).toBe(0.5);
    });
});
