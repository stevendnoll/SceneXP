// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-clip.test.mjs - the clip of a play (specs/xo-photos-plan, Step 6):
 * which seconds of the recording it is, the director's shot opened on its
 * first frame and turned to the chosen quarter, the words and the names, one
 * frame drawn for the recorder, the renderer held and given back, and the
 * recorder started before the first frame and stopped after the last.
 *
 * The frame is drawn on a real three (the camera is a real PerspectiveCamera)
 * with a renderer and a context that write down what they are asked. The take
 * itself, frame by frame in the page's loop, is tests/xo-init.test.mjs's.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';
import { wordmarkFont } from '../www/shared/js/wordmark-1.0.0.js';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

let THREE;
let C;
let Cam;
let R;
let CFG;
let FIELD;

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    C = await import(join(scene, 'clip.js'));
    Cam = await import(join(scene, 'camera.js'));
    R = await import(join(scene, 'replay.js'));
    ({ XO_CONFIG: CFG, FIELD } = await import(join(scene, 'config.js')));
});

const SPEED = { seconds: 8, speed: 0.85, simHz: 80 };   // 544 frames of clip

describe('which seconds of the play', () => {
    test('the last eight seconds of clip before the whistle, or the whole play when it was shorter', () => {
        expect(C.clipStart(1200, SPEED)).toBe(1200 - 544);
        expect(C.clipStart(545, SPEED)).toBe(1);
        expect(C.clipStart(544, SPEED)).toBe(0);
        expect(C.clipStart(300, SPEED)).toBe(0);
        expect(C.clipStart(0, SPEED)).toBe(0);
        expect(C.clipStart('nonsense', SPEED)).toBe(0);
        // The defaults are the config's: the replay's own speed, the simulation's rate.
        const span = Math.round(CFG.clip.seconds * CFG.camera.replay.speed * CFG.simHz);
        expect(C.clipStart(1200)).toBe(1200 - span);
    });

    test('the plan: the play part in clip seconds, then the ending, then the hold', () => {
        const long = C.clipPlan({ ticks: 1200, ending: 1.2, hold: 1, ...SPEED });
        expect(long.start).toBe(656);
        expect(long.ticks).toBe(1200);
        expect(long.play).toBeCloseTo(8, 9);
        expect(long.ending).toBe(1.2);
        expect(long.hold).toBe(1);
        expect(long.total).toBeCloseTo(10.2, 9);

        const short = C.clipPlan({ ticks: 300, ending: 0, hold: 1, ...SPEED });
        expect(short.start).toBe(0);
        expect(short.play).toBeCloseTo(300 / 68, 9);
        expect(short.total).toBeCloseTo(300 / 68 + 1, 9);

        // Nothing negative gets in.
        expect(C.clipPlan({ ticks: 100, ending: -2, hold: -1, ...SPEED })).toMatchObject({ ending: 0, hold: 0 });
        expect(C.clipPlan({ ticks: 1200 }).hold).toBe(CFG.clip.hold);
    });

    test('progress runs 0 to 1 over the play part and stays at 1 through the ending', () => {
        const plan = C.clipPlan({ ticks: 1200, ending: 1.2, ...SPEED });
        expect(C.clipProgress(656, plan)).toBe(0);
        expect(C.clipProgress(928, plan)).toBeCloseTo(0.5, 9);
        expect(C.clipProgress(1200, plan)).toBe(1);
        expect(C.clipProgress(10, plan)).toBe(0);
        expect(C.clipProgress(5000, plan)).toBe(1);
        // A plan with nothing to play is all ending.
        expect(C.clipProgress(0, { start: 0, ticks: 0 })).toBe(1);
    });
});

describe('the director\'s shot, for the clip', () => {
    const focus = { x: 25, y: 0.9, z: 2 };

    test('the director\'s own, exactly, from the first vantage point with the default opening', () => {
        for (const t of [0, 0.2, 0.5, 0.9, 1]) {
            const own = Cam.replayDriver(t, focus, Cam.shoulderFor(focus.z, 0, Cam.newShoulder()));
            expect(C.clipShot(t, focus, { quarter: 0, shoulder: Cam.newShoulder() })).toEqual(own);
        }
    });

    test('the live replay is unchanged: no opening given is the line of scrimmage', () => {
        for (const t of [0, 0.1, 0.25]) {
            const three = Cam.replayDriver(t, focus, 1);
            expect(Cam.replayDriver(t, focus, 1, null)).toEqual(three);
            expect(Cam.replayDriver(t, focus, 1, { x: FIELD.lineInterval, z: 0 })).toEqual(three);
            expect(Cam.replayDriver(t, focus, 1, { x: NaN, z: undefined })).toEqual(three);
        }
    });

    test('it opens on the given point and arrives on the carrier all the same', () => {
        const a = { x: 15, z: 0 };
        const b = { x: 20, z: 0 };
        const atA = Cam.replayDriver(0, focus, 1, a);
        const atB = Cam.replayDriver(0, focus, 1, b);
        // Mid-field, away from every clamp, moving the opening moves the shot with it.
        expect(atB.position.x - atA.position.x).toBeCloseTo(5, 9);
        expect(atB.position.z).toBeCloseTo(atA.position.z, 9);
        expect(atA.position.x).not.toBeCloseTo(Cam.replayDriver(0, focus, 1).position.x, 3);
        // Arrived, the opening is forgotten.
        expect(Cam.replayDriver(1, focus, 1, a)).toEqual(Cam.replayDriver(1, focus, 1));
        // Opened off the middle, the swing starts from there too.
        const side = Cam.replayDriver(0, focus, 1, { x: 15, z: 6 });
        expect(side.position.z - atA.position.z).toBeCloseTo(6, 9);
        // And the clip's shot hands its opening through, which is the point.
        const fresh = () => Cam.newShoulder();
        const opened = C.clipShot(0, focus, { anchor: a, shoulder: fresh() });
        expect(opened).toEqual(Cam.replayDriver(0, focus, Cam.shoulderFor(focus.z, 0, fresh()), a));
        expect(opened.position.x).not.toBeCloseTo(C.clipShot(0, focus, { shoulder: fresh() }).position.x, 3);
    });

    test('each quarter is the same shot turned about its target: same distance, same height, a quarter turn apart', () => {
        const base = C.clipShot(0.6, focus, { quarter: 0, shoulder: Cam.newShoulder() });
        const t = base.target;
        const radius = Math.hypot(base.position.x - t.x, base.position.y - t.y, base.position.z - t.z);
        const azimuth = (s) => Math.atan2(s.position.z - t.z, s.position.x - t.x);
        for (const q of [1, 2, 3]) {
            const turned = C.clipShot(0.6, focus, { quarter: q, shoulder: Cam.newShoulder() });
            expect(turned.target).toEqual(t);
            expect(turned.fov).toBe(base.fov);
            expect(Math.hypot(turned.position.x - t.x, turned.position.y - t.y, turned.position.z - t.z)).toBeCloseTo(radius, 6);
            expect(turned.position.y).toBeCloseTo(base.position.y, 6);
            let diff = azimuth(turned) - azimuth(base) - Cam.QUARTERS[q];
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            expect(Math.abs(diff)).toBeLessThan(1e-6);
        }
        // Any whole number goes round the four.
        expect(C.clipShot(0.6, focus, { quarter: 4, shoulder: Cam.newShoulder() })).toEqual(base);
        expect(C.clipShot(0.6, focus, { quarter: -1, shoulder: Cam.newShoulder() }))
            .toEqual(C.clipShot(0.6, focus, { quarter: 3, shoulder: Cam.newShoulder() }));
    });

    test('viewOffset names the four without touching the view on screen', () => {
        expect(Cam.viewOffset(0)).toEqual({ yaw: 0, lift: 0, zoom: 1, quarter: 0 });
        expect(Cam.viewOffset(1).yaw).toBe(Math.PI);
        expect(Cam.viewOffset(2).yaw).toBe(Math.PI / 2);
        expect(Cam.viewOffset(3).yaw).toBe(-Math.PI / 2);
        expect(Cam.viewOffset(4)).toEqual(Cam.viewOffset(0));
        expect(Cam.viewOffset(-1)).toEqual(Cam.viewOffset(3));
        expect(Cam.viewOffset('x').quarter).toBe(0);
        Cam.resetView();
        Cam.viewOffset(2);
        expect(Cam.viewQuarter()).toBe(0);
        expect(Cam.getView().yaw).toBe(0);
    });

    test('the clip\'s shoulder memory is its own: a take never moves the replay\'s', () => {
        const R2 = CFG.camera.replay;
        // The replay on screen rounds the near shoulder for a carrier on the far side.
        Cam.resetShoulder();
        expect(Cam.shoulderFor(5, 0)).toBe(-1);
        // A take's carrier is on the other side, and its memory swings across.
        const own = Cam.newShoulder();
        expect(own).toEqual({ side: 1, want: 1, held: 0, seeded: false });
        expect(Cam.shoulderFor(-5, 0, own)).toBe(1);
        for (let i = 0; i < 20; i += 1) Cam.shoulderFor(5, R2.shoulderHold + 1, own);
        expect(own.side).toBeCloseTo(-1, 3);
        // The replay's has not moved: still the side it was seeded with.
        expect(Cam.shoulderFor(5, 0)).toBe(-1);
        // And through the clip's shot, the same memory is advanced and kept.
        const kept = Cam.newShoulder();
        C.clipShot(0.5, { x: 10, y: 0.9, z: -5 }, { shoulder: kept, delta: 0.5 });
        expect(kept.seeded).toBe(true);
        C.clipShot(0.5, { x: 10, y: 0.9, z: -5 }, { shoulder: kept, delta: 0.5 });
        expect(kept.held).toBeCloseTo(0.5, 9);
        // No memory given: a fresh one each time, and nothing thrown.
        expect(C.clipShot(0.5, null)).toMatchObject({ position: expect.any(Object), target: expect.any(Object) });
    });
});

describe('the words and the names', () => {
    test('the stamp is the headline and the signed points, the headline alone for nothing', () => {
        expect(C.stampText({ headline: 'Caught', points: 15 })).toBe('Caught +15');
        expect(C.stampText({ headline: 'All the way', points: 50 })).toBe('All the way +50');
        expect(C.stampText({ headline: 'Intercepted', points: -10 })).toBe('Intercepted -10');
        expect(C.stampText({ headline: 'Incomplete', points: 0 })).toBe('Incomplete');
        expect(C.stampText(null)).toBe('');
        expect(C.stampText({})).toBe('');
    });

    test('the file is named for the result and the size, safe on every system', () => {
        expect(C.clipName('catch', 720, 1280, 'mp4')).toBe('scenexp-xo-catch-720x1280.mp4');
        expect(C.clipName('run-50', 1080, 1920, 'webm')).toBe('scenexp-xo-run-50-1080x1920.webm');
        expect(C.clipName('', 1080, 1920)).toBe('scenexp-xo-play-1080x1920.mp4');
        expect(C.clipName('All the Way!', 720, 1280, 'mp4')).toBe('scenexp-xo-all-the-way-720x1280.mp4');
    });

    test('the size is a phone\'s or a computer\'s', () => {
        expect(C.clipSize(false)).toEqual({ w: CFG.clip.width, h: CFG.clip.height });
        expect(C.clipSize(true)).toEqual({ w: CFG.clip.mobileWidth, h: CFG.clip.mobileHeight });
        expect(CFG.clip.width / CFG.clip.height).toBeCloseTo(9 / 16, 9);
        expect(CFG.clip.mobileWidth / CFG.clip.mobileHeight).toBeCloseTo(9 / 16, 9);
    });
});

describe('a frame of the take', () => {
    function fakeRenderer() {
        const calls = [];
        let ratio = 1.5;
        let size = { x: 390, y: 844 };
        return {
            calls,
            getPixelRatio: () => ratio,
            setPixelRatio: (r) => { calls.push(['ratio', r]); ratio = r; },
            getSize: (v) => v.set(size.x, size.y),
            setSize: (w, h, style) => { calls.push(['size', w, h, style]); size = { x: w, y: h }; },
            render: (s, cam) => { calls.push(['render', cam.fov, cam.aspect, cam.position.toArray()]); },
            now: () => ({ ratio, size }),
        };
    }

    function recordingContext() {
        const drawn = [];
        const g = new Proxy({}, {
            get: (t, k) => (k in t ? t[k] : (...args) => drawn.push([k, ...args])),
            set: (t, k, v) => { t[k] = v; return true; },
        });
        return { g, drawn };
    }

    const shot = { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 1, z: 0 }, fov: 47 };

    test('rendered through the clip camera at the clip\'s shape, copied onto the stage, the wordmark on top', () => {
        const renderer = fakeRenderer();
        const { g, drawn } = recordingContext();
        const canvas = { id: 'game-canvas' };
        expect(C.takeFrame({ renderer, scene: {}, canvas, shot, g, w: 720, h: 1280 })).toBe(true);
        expect(renderer.calls).toHaveLength(1);
        const [, fov, aspect, at] = renderer.calls[0];
        expect(fov).toBe(47);
        expect(aspect).toBeCloseTo(720 / 1280, 9);
        expect(at).toEqual([1, 2, 3]);
        const draw = drawn.findIndex((c) => c[0] === 'drawImage');
        expect(drawn[draw]).toEqual(['drawImage', canvas, 0, 0, 720, 1280, 0, 0, 720, 1280]);
        const words = drawn.filter((c) => c[0] === 'fillText');
        expect(words.map((c) => c[1])).toEqual([CFG.clip.wordmark]);
        expect(drawn.indexOf(words[0])).toBeGreaterThan(draw);
        // No stamp was asked for, so none was drawn.
        expect(drawn.filter((c) => c[0] === 'strokeText')).toHaveLength(1);
    });

    test('the stamp, when given, is centered in the wordmark\'s face at the configured height and drawn last', () => {
        const renderer = fakeRenderer();
        const { g, drawn } = recordingContext();
        C.takeFrame({ renderer, scene: {}, canvas: {}, shot, g, w: 720, h: 1280, stamp: 'Caught +15' });
        const words = drawn.filter((c) => c[0] === 'fillText');
        expect(words.map((c) => c[1])).toEqual([CFG.clip.wordmark, 'Caught +15']);
        const [, , x, y] = words[1];
        expect(x).toBe(360);
        expect(y).toBe(Math.round(1280 * CFG.clip.stampAt));
        expect(g.textAlign).toBe('center');
        expect(g.font).toBe(wordmarkFont(Math.round(1280 * CFG.clip.stampHeight)));
        // Outlined first, then filled, as the wordmark is.
        const stroke = drawn.findIndex((c) => c[0] === 'strokeText' && c[1] === 'Caught +15');
        expect(stroke).toBeGreaterThan(-1);
        expect(stroke).toBeLessThan(drawn.indexOf(words[1]));
        // On its own, drawStamp says where it went.
        const { g: g2 } = recordingContext();
        expect(C.drawStamp(g2, 1080, 1920, 'Sacked -5')).toEqual({ x: 540, y: Math.round(1920 * CFG.clip.stampAt), px: Math.round(1920 * CFG.clip.stampHeight) });
        expect(C.drawStamp(g2, 1080, 1920, '')).toBeNull();
    });

    test('nothing to draw with draws nothing', () => {
        const renderer = fakeRenderer();
        const { g } = recordingContext();
        expect(C.takeFrame({ renderer, scene: {}, canvas: {}, shot: null, g, w: 720, h: 1280 })).toBe(false);
        expect(C.takeFrame({ renderer, scene: {}, canvas: {}, shot, g: null, w: 720, h: 1280 })).toBe(false);
        expect(C.takeFrame({ renderer: null, scene: {}, canvas: {}, shot, g, w: 720, h: 1280 })).toBe(false);
        expect(C.takeFrame({ renderer, scene: {}, canvas: {}, shot, g, w: 0, h: 1280 })).toBe(false);
        expect(renderer.calls).toEqual([]);
    });

    test('the renderer is held at the clip\'s size at a ratio of 1, the CSS size untouched, and given back once', () => {
        const renderer = fakeRenderer();
        const release = C.holdSize(renderer, 720, 1280);
        expect(renderer.calls).toEqual([['ratio', 1], ['size', 720, 1280, false]]);
        expect(renderer.now()).toEqual({ ratio: 1, size: { x: 720, y: 1280 } });
        expect(release()).toBe(true);
        expect(renderer.calls.slice(2)).toEqual([['ratio', 1.5], ['size', 390, 844, false]]);
        expect(renderer.now()).toEqual({ ratio: 1.5, size: { x: 390, y: 844 } });
        expect(release()).toBe(false);
        expect(renderer.calls).toHaveLength(4);
    });
});

describe('recording a take', () => {
    function browser(log) {
        class FakeRecorder {
            constructor(stream, options) {
                this.options = options;
                this.mimeType = options.mimeType;
                log.push('new');
            }

            start(slice) { log.push(`start:${slice}`); }

            stop() {
                log.push('stop');
                this.ondataavailable({ data: new Blob(['clip']) });
                this.onstop();
            }
        }
        return { MediaRecorder: FakeRecorder, Blob };
    }

    function stage(log) {
        return { width: 0, height: 0, captureStream: (fps) => { log.push(`capture:${fps}`); return {}; } };
    }

    test('the stage sized then captured, the recorder started before the first frame and stopped after the last', async () => {
        const log = [];
        const win = browser(log);
        const s = stage(log);
        const take = async () => { log.push(`frames:${s.width}x${s.height}`); return { cancelled: false, frames: 12, seconds: 3.5 }; };
        const made = await C.recordTake(s, take, { w: 720, h: 1280, mime: 'video/webm', fps: 30, bitrate: 5, win });
        expect(log).toEqual(['capture:30', 'new', 'start:1000', 'frames:720x1280', 'stop']);
        expect(made.blob.type).toBe('video/webm');
        expect(made.blob.size).toBe(4);
        expect(made).toMatchObject({ mime: 'video/webm', seconds: 3.5, frames: 12 });
        // The defaults are the config's.
        const log2 = [];
        await C.recordTake(stage(log2), async () => ({ frames: 1, seconds: 1 }), { mime: 'video/mp4', win: browser(log2) });
        expect(log2[0]).toBe(`capture:${CFG.clip.fps}`);
    });

    test('a cancelled or refused take is nothing, and the recorder is still stopped', async () => {
        const log = [];
        const win = browser(log);
        expect(await C.recordTake(stage(log), async () => ({ cancelled: true, frames: 3, seconds: 1 }), { mime: 'video/webm', win })).toBeNull();
        expect(log).toEqual(['capture:30', 'new', 'start:1000', 'stop']);
        const log2 = [];
        expect(await C.recordTake(stage(log2), async () => null, { mime: 'video/webm', win: browser(log2) })).toBeNull();
        expect(log2).toContain('stop');
    });

    test('a take that throws rejects, after the recorder is stopped', async () => {
        const log = [];
        const win = browser(log);
        await expect(C.recordTake(stage(log), async () => { throw new Error('lost'); }, { mime: 'video/webm', win })).rejects.toThrow('lost');
        expect(log).toContain('stop');
    });

    test('a stage that cannot be captured, or nothing to take, records nothing', async () => {
        const log = [];
        const win = browser(log);
        expect(await C.recordTake({ width: 0, height: 0 }, async () => ({}), { mime: 'video/webm', win })).toBeNull();
        expect(await C.recordTake(stage(log), null, { mime: 'video/webm', win })).toBeNull();
        expect(await C.recordTake(null, async () => ({}), { mime: 'video/webm', win })).toBeNull();
        expect(log).toEqual([]);
    });
});

describe('the recording\'s seek', () => {
    const man = (position, x) => ({ settings: { position, benched: false }, coords: { x, y: 0, z: 0 }, state: {} });

    test('the playhead goes where it is told, held inside the recording', () => {
        const objects = [man('qb', 0), man('wr1', 5)];
        R.startRecording(objects);
        for (let i = 0; i < 10; i += 1) {
            objects[0].coords.x = i;
            R.record(objects);
        }
        expect(R.frameCount()).toBe(10);
        expect(R.seek(4)).toBe(4);
        expect(R.playheadFrame()).toBe(4);
        expect(R.frameAt(R.playheadFrame())[0].coords.x).toBe(4);
        expect(R.seek(99)).toBe(9);
        expect(R.seek(-3)).toBe(0);
        expect(R.seek('x')).toBe(0);
        // From a seek, the playhead runs out where it always did.
        R.seek(8);
        expect(R.advance(1 / 60, 80, 1)).toBe(false);
        expect(R.advance(1 / 60, 80, 1)).toBe(true);
        R.discard();
        expect(R.seek(5)).toBe(0);
    });
});
