// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-audio.test.mjs - X's and O's sound: off by default, and fast on a phone.
 *
 * Both halves came from one QA pass on a real iPhone (2026-09-14): the game
 * made noise before anybody asked it to, and the tap sounds lagged behind the
 * finger. The lag was HTMLAudioElement playback, which iOS Safari starts a
 * hundred milliseconds or more late, so samples are now decoded once and
 * played through Web Audio, with the element kept only as a fallback.
 *
 * Nothing here can hear anything. What it can check is which path a sound
 * takes, that nothing is downloaded for a visitor who never turns sound on,
 * and that the choice is remembered, with a fake AudioContext standing in for
 * the browser's.
 */
import { jest } from '@jest/globals';

const STORE_KEY = 'exes-n-ohs-audio-settings';
let store;
let contexts;
let elements;
let fetched;

class FakeContext {
    constructor() {
        this.state = 'suspended';
        this.currentTime = 5;
        this.destination = {};
        this.started = [];
        this.resumed = 0;
        contexts.push(this);
    }
    resume() { this.resumed += 1; this.state = 'running'; return Promise.resolve(); }
    createBuffer() { return { silent: true }; }
    createBufferSource() {
        const ctx = this;
        return { buffer: null, connect() {}, start(at) { ctx.started.push({ buffer: this.buffer, at }); } };
    }
    decodeAudioData(data) { return Promise.resolve({ decoded: data.url }); }
}

class FakeAudio {
    constructor(src) { this.src = src; this.played = 0; elements.push(this); }
    play() { this.played += 1; return Promise.resolve(); }
    pause() {}
    load() {}
}

/** Long enough for fetch, arrayBuffer and decode to all settle. */
const settle = async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

async function loadAudio(saved) {
    jest.resetModules();
    store = new Map(saved === undefined ? [] : [[STORE_KEY, saved]]);
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    contexts = [];
    elements = [];
    fetched = [];
    globalThis.window = globalThis;
    globalThis.AudioContext = FakeContext;
    globalThis.Audio = FakeAudio;
    globalThis.fetch = async (url) => {
        fetched.push(url);
        return { ok: true, arrayBuffer: async () => ({ url }) };
    };
    const audio = await import('../www/xo/js/audio.js');
    audio.initAudio();
    return audio;
}

afterEach(() => {
    for (const key of ['localStorage', 'AudioContext', 'Audio', 'fetch', 'window']) delete globalThis[key];
});

/** Sample elements, leaving out the silent keep-alive loop. */
const samples = () => elements.filter((e) => !e.src.includes('silence'));

describe('sound starts off', () => {
    test('with nothing saved, the game is muted and plays nothing', async () => {
        const audio = await loadAudio();
        expect(audio.isMuted()).toBe(true);
        audio.unlock();
        await settle();
        expect(audio.play('snap')).toBe(false);
        // And nothing was downloaded for a visitor who never asked for sound.
        expect(fetched).toEqual([]);
        expect(elements).toEqual([]);
        expect(contexts).toEqual([]);
    });

    test('an unreadable saved setting is muted too', async () => {
        const audio = await loadAudio('not json');
        expect(audio.isMuted()).toBe(true);
    });

    test('a visitor who turned it on gets it on, and the choice is written down', async () => {
        const audio = await loadAudio(JSON.stringify({ muted: false }));
        expect(audio.isMuted()).toBe(false);
        audio.setMuted(true);
        expect(JSON.parse(store.get(STORE_KEY))).toEqual({ muted: true });
        audio.setMuted(false);
        expect(JSON.parse(store.get(STORE_KEY))).toEqual({ muted: false });
    });
});

describe('a sound on a phone is not late', () => {
    test('turning sound on wakes the context inside the press and fetches the library', async () => {
        const audio = await loadAudio();
        audio.setMuted(false);
        expect(contexts).toHaveLength(1);
        expect(contexts[0].resumed).toBe(1);
        await settle();
        expect(fetched.length).toBe(23);
        expect(fetched.every((u) => /^assets\/audio\/[a-z0-9-]+\.mp3$/.test(u))).toBe(true);
    });

    test('once decoded, a sample plays through Web Audio and never touches an element', async () => {
        const audio = await loadAudio(JSON.stringify({ muted: false }));
        audio.unlock();
        await settle();
        const before = contexts[0].started.length;
        expect(audio.play('snap')).toBe(true);
        const played = contexts[0].started.slice(before);
        expect(played).toHaveLength(1);
        expect(played[0].buffer.decoded).toMatch(/snap-(8|6s)\.mp3$/);
        expect(played[0].at).toBe(5);
        expect(samples()).toEqual([]);
    });

    test('a delay is scheduled on the audio clock, not left to a timer', async () => {
        const audio = await loadAudio(JSON.stringify({ muted: false }));
        audio.unlock();
        await settle();
        audio.play('whistle', 120);
        const last = contexts[0].started[contexts[0].started.length - 1];
        expect(last.at).toBeCloseTo(5.12, 5);
    });

    test('a sample still decoding falls back to an element rather than staying silent', async () => {
        const audio = await loadAudio(JSON.stringify({ muted: false }));
        audio.unlock();
        // No settle: nothing has decoded yet.
        expect(audio.play('catch')).toBe(true);
        expect(samples().some((e) => e.played === 1 && /catch-\d\.mp3$/.test(e.src))).toBe(true);
    });

    test('with no Web Audio at all, the element path still plays', async () => {
        const audio = await loadAudio(JSON.stringify({ muted: false }));
        delete globalThis.AudioContext;
        audio.unlock();
        await settle();
        expect(audio.play('hike')).toBe(true);
        expect(fetched).toEqual([]);
        expect(samples().some((e) => e.played === 1)).toBe(true);
    });
});
