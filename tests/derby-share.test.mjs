// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's share clip and sound (M2), from SOURCE: sound.js against a
 * fake AudioContext, recorder.js against a fake MediaRecorder and share
 * sheet, clip.js's script and the words it burns in (into a recording 2D
 * context), and the whole share card on the page under the stubs.
 *
 * What is held here, and why:
 * - MUTING NEVER SILENCES A CLIP (PLANNING, The clip): with the speakers
 *   off, a recording with its sound on still makes every sound.
 * - MP4 FIRST, since Instagram does not take WebM well.
 * - A DISMISSED SHARE SHEET IS NOT A FAILURE: no file is saved behind it.
 * - THE CLIP IS A REPLAY: its heat is the visitor's best, and the time it
 *   stamps is the board's.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

installThree();
const { DERBY_CONFIG: C } = await import('../www/derby/js/config.js');
const Car = await import('../www/derby/js/car.js');
const Sim = await import('../www/derby/js/sim.js');
const Sound = await import('../www/derby/js/sound.js');
const Rec = await import('../www/derby/js/recorder.js');
const Clip = await import('../www/derby/js/clip.js');
const T = await import('../www/derby/js/track.js');
const Dir = await import('../www/derby/js/director.js');

// ---- A fake AudioContext that remembers what it made ----------------------------

function fakeAudio() {
    const made = [];
    const param = (value = 0) => ({
        value,
        setTargetAtTime(v) { this.value = v; },
        setValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; }
    });
    const node = (kind, extra = {}) => {
        const n = { kind, connected: [], connect(to) { this.connected.push(to); return to; }, disconnect() { this.connected = []; }, ...extra };
        made.push(n);
        return n;
    };
    let closed = false;
    class Ctx {
        constructor() {
            this.currentTime = 0;
            this.sampleRate = 4000;
            this.destination = { kind: 'destination' };
            this.state = 'suspended';
        }
        createGain() { return node('gain', { gain: param(1) }); }
        createBiquadFilter() { return node('filter', { frequency: param(), Q: param() }); }
        createBufferSource() { return node('source', { start() {}, stop() {} }); }
        createOscillator() { return node('osc', { frequency: param(), start() {}, stop() {} }); }
        createDynamicsCompressor() { return node('limiter', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
        createBuffer(ch, frames) { return { getChannelData: () => new Float32Array(frames) }; }
        createMediaStreamDestination() { return node('record', { stream: { getAudioTracks: () => ['audio-track'] } }); }
        resume() { this.state = 'running'; return Promise.resolve(); }
        close() { closed = true; return Promise.resolve(); }
    }
    return { win: { AudioContext: Ctx }, made, count: (kind) => made.filter((n) => n.kind === kind).length, closed: () => closed };
}

describe('the sound', () => {
    test('a browser with no Web Audio stays quiet, and every call is safe', () => {
        const s = Sound.createSound(C.sound, { win: {} });
        expect(s.isOn()).toBe(false);
        expect(s.toggle()).toBe(true);
        expect(s.ensure()).toBe(false);
        for (const call of [() => s.roll(1), () => s.gate(), () => s.beep(), () => s.puff(), () => s.setRecording(true), () => s.setLevel(0.2), () => s.dispose()]) {
            expect(call).not.toThrow();
        }
        expect(s.recordStream()).toBeNull();
        expect(Sound.createSound(C.sound, { win: null }).ensure()).toBe(false);
    });

    test('nothing is made until it is asked for, and the speakers follow the mute', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        expect(a.made).toHaveLength(0);
        s.gate();
        expect(a.made).toHaveLength(0);
        s.setOn(true);
        // The bus, the speakers, the limiter, the record gain, and the wheels.
        expect(a.count('limiter')).toBe(1);
        const speakers = a.made.filter((n) => n.kind === 'gain')[1];
        expect(speakers.gain.value).toBeCloseTo(C.sound.master, 9);
        s.setLevel(0.3);
        expect(speakers.gain.value).toBeCloseTo(0.3, 9);
        s.setOn(false);
        expect(speakers.gain.value).toBe(0);
        s.dispose();
        expect(a.closed()).toBe(true);
    });

    test('muted, nothing plays. Muted but recording with sound, every sound still plays for the clip', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.ensure();
        const before = a.made.length;
        s.gate();
        s.beep();
        s.puff();
        expect(a.made.length).toBe(before);
        s.setRecording(true, true);
        s.gate();
        s.beep();
        s.puff();
        expect(a.made.length).toBeGreaterThan(before + 6);
        // A recording without its sound is silent again.
        const after = a.made.length;
        s.setRecording(true, false);
        s.beep();
        expect(a.made.length).toBe(after);
    });

    test('the clip\'s audio track: one recording output, its gain on only while recording with sound', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.ensure();
        const stream = s.recordStream();
        expect(stream.getAudioTracks()).toEqual(['audio-track']);
        expect(s.recordStream()).toBe(stream);
        expect(a.count('record')).toBe(1);
        const recordGain = a.made.find((n) => n.kind === 'gain' && n.connected.some((c) => c.kind === 'record'));
        s.setRecording(true, true);
        expect(recordGain.gain.value).toBeCloseTo(C.sound.record, 9);
        s.setRecording(false);
        expect(recordGain.gain.value).toBe(0);
    });

    test('the wheels follow the field\'s speed, clamped, and fall silent when nobody would hear', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.setOn(true);
        const roll = a.made.find((n) => n.kind === 'gain' && n.connected.length && a.made.some((f) => f.kind === 'filter' && f.connected.includes(n)));
        s.roll(0.5);
        expect(roll.gain.value).toBeCloseTo(0.5 * C.sound.roll.gain, 9);
        s.roll(7);
        expect(roll.gain.value).toBeCloseTo(C.sound.roll.gain, 9);
        s.roll(-1);
        expect(roll.gain.value).toBe(0);
        s.setOn(false);
        s.roll(1);
        expect(roll.gain.value).toBe(0);
    });

    test('the countdown beeps (Steve\'s QA, 2026-10-20): a bright beep a count, a higher one held longer for Go, neither shrill', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.setOn(true);
        s.count();
        const beep = a.made.filter((n) => n.kind === 'osc').pop();
        expect(beep.type).toBe('triangle');
        expect(beep.frequency.value).toBe(C.sound.count.hz);
        s.count(true);
        const go = a.made.filter((n) => n.kind === 'osc').pop();
        expect(go.frequency.value).toBe(C.sound.count.goHz);
        // Higher for Go, but not shrill (the same QA: 880 and 1760 Hz were
        // a little high): both under 700 Hz.
        expect(C.sound.count.goHz).toBeGreaterThan(C.sound.count.hz);
        expect(C.sound.count.goHz).toBeLessThan(700);
        expect(C.sound.count.goSeconds).toBeGreaterThan(C.sound.count.seconds);
        // Louder than a car crossing the line, so it is heard over the wheels.
        expect(C.sound.count.gain).toBeGreaterThan(C.sound.beep.gain);
        // Muted, nothing.
        s.setOn(false);
        const before = a.made.length;
        s.count();
        expect(a.made.length).toBe(before);
    });

    test('no crowd noise at all (Steve\'s QA, 2026-10-20: the murmur sounded like static)', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.setOn(true);
        expect(s.murmur).toBeUndefined();
        expect(C.sound.murmur).toBeUndefined();
        // The only noise that loops is the wheels'.
        expect(a.count('source')).toBe(1);
    });

    test('a one-shot lets go of its nodes when it ends', () => {
        const a = fakeAudio();
        const s = Sound.createSound(C.sound, { win: a.win });
        s.setOn(true);
        s.beep();
        const osc = a.made.filter((n) => n.kind === 'osc').pop();
        const gain = osc.connected[0];
        expect(gain.connected.length).toBe(1);
        osc.onended();
        expect(osc.connected).toHaveLength(0);
        expect(gain.connected).toHaveLength(0);
    });

    test('a context that cannot be made leaves the sound quiet for good', () => {
        const s = Sound.createSound(C.sound, { win: { AudioContext: class { constructor() { throw new Error('no'); } } } });
        expect(s.ensure()).toBe(false);
        expect(s.setOn(true)).toBe(true);
        expect(() => s.puff()).not.toThrow();
    });
});

// ---- The recorder ----------------------------------------------------------------

describe('the recorder', () => {
    test('MP4 first, WebM last, nothing when nothing is supported, and a type check that throws is skipped', () => {
        expect(Rec.pickMime(() => true)).toBe(Rec.MIME_PREFERENCE[0]);
        expect(Rec.pickMime((t) => t === 'video/webm')).toBe('video/webm');
        expect(Rec.pickMime((t) => { if (t.includes('mp4')) throw new Error('?'); return t === 'video/webm;codecs=vp9,opus'; })).toBe('video/webm;codecs=vp9,opus');
        expect(Rec.pickMime(() => false)).toBe('');
        expect(Rec.pickMime(null)).toBe('');
        expect(Rec.MIME_PREFERENCE[0]).toMatch(/^video\/mp4/);
        expect(Rec.extensionOf('video/mp4;codecs=avc1')).toBe('mp4');
        expect(Rec.extensionOf('video/webm')).toBe('webm');
    });

    test('file names from the car\'s name, safe on every system', () => {
        expect(Rec.fileName('Blue Comet', 'mp4')).toBe('derby-day-blue-comet.mp4');
        expect(Rec.fileName('Café   Racer!!', 'webm')).toBe('derby-day-cafe-racer.webm');
        expect(Rec.fileName('../../etc', 'mp4')).toBe('derby-day-etc.mp4');
        expect(Rec.fileName('', 'png')).toBe('derby-day.png');
        expect(Rec.fileName(null, 'png')).toBe('derby-day.png');
    });

    test('a browser can record only with MediaRecorder and canvas capture', () => {
        expect(Rec.canRecord(null)).toBe(false);
        expect(Rec.canRecord({})).toBe(false);
        expect(Rec.canRecord({ MediaRecorder: function () {} })).toBe(false);
        const Canvas = function () {};
        Canvas.prototype.captureStream = () => ({});
        expect(Rec.canRecord({ MediaRecorder: function () {}, HTMLCanvasElement: Canvas })).toBe(true);
    });

    test('recording gathers the slices into one file of the recorder\'s type, and a failure rejects', async () => {
        class FakeRecorder {
            constructor(stream, options) { this.options = options; this.mimeType = options.mimeType; FakeRecorder.last = this; }
            start(slice) { this.slice = slice; }
            stop() {
                this.ondataavailable({ data: new Blob(['a']) });
                this.ondataavailable({ data: new Blob([]) });
                this.ondataavailable({ data: new Blob(['b']) });
                this.onstop();
            }
        }
        const win = { MediaRecorder: FakeRecorder, Blob };
        const { recorder, done } = Rec.startRecording({}, 'video/mp4;codecs=avc1', { bitrate: 5, win });
        expect(recorder.slice).toBe(1000);
        expect(recorder.options).toEqual({ mimeType: 'video/mp4;codecs=avc1', videoBitsPerSecond: 5 });
        recorder.stop();
        const blob = await done;
        expect(blob.type).toBe('video/mp4');
        expect(blob.size).toBe(2);
        const failing = Rec.startRecording({}, '', { bitrate: 5, win });
        expect(FakeRecorder.last.options).toEqual({ videoBitsPerSecond: 5 });
        FakeRecorder.last.onerror({ error: new Error('boom') });
        await expect(failing.done).rejects.toThrow('boom');
        const bare = Rec.startRecording({}, '', { bitrate: 5, win });
        FakeRecorder.last.onerror({});
        await expect(bare.done).rejects.toThrow('recording failed');
    });

    // Sharing and saving the file are the shared part's since 2026-10-21, and
    // tested there (shared-sharefile.test.mjs). What is Derby's is that its
    // recorder hands on that part, not a copy of it.
    test('the file is shared and saved by the shared part', async () => {
        const Shared = await import('../www/shared/js/sharefile-1.0.0.min.js');
        expect(Rec.shareFile).toBe(Shared.shareFile);
        expect(Rec.canShareFiles).toBe(Shared.canShareFiles);
        expect(Rec.saveFile).toBe(Shared.saveFile);
    });
});

// ---- The clip's script and its words ---------------------------------------------

// The builds M1's presets were (config.presets until M3 replaced them with
// the garage), kept here as fixtures so these numbers stay comparable.
const PRESETS = {
    box: { design: 'block', ballast: null, tune: { deburr: false, polish: 0, graphite: false, align: false, sand: 0 } },
    tuned: { design: 'wedge', ballast: { mass: 5, balance: 1 }, tune: { deburr: true, polish: 3, graphite: true, align: true, sand: 0.5 } },
    full: { design: 'thinWedge', ballast: { mass: 5, balance: 0.8 }, tune: { deburr: true, polish: 5, graphite: true, align: true, sand: 1 } }
};
const preset = (id) => {
    const p = PRESETS[id];
    return Car.describeCar(Car.buildFromDesign(p.design, { tune: p.tune, ballast: p.ballast }));
};
const fieldCar = (i) => Car.describeCar(Car.buildFromField(C.field[i]));

/** A 2D context that keeps every word written and every fill. */
function recording2d() {
    const words = [];
    const g = {
        font: '', fillStyle: '', textAlign: '', textBaseline: '', globalAlpha: 1,
        measureText: (t) => ({ width: String(t).length * (parseFloat(g.font.split(' ')[1]) || 10) * 0.55 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {},
        fillText(t) { words.push({ text: t, font: g.font }); }
    };
    return { g, words, said: () => words.map((w) => w.text) };
}

describe('the clip', () => {
    const race = Sim.runRace([preset('full'), ...C.divisions.hard.map(fieldCar)], C, { record: C.timing.record });

    test('its heat is the visitor\'s best, and the time it stamps is the board\'s', () => {
        const plan = Clip.planClip(race, 0);
        const best = race.best[0];
        expect(race.heats[plan.heatIndex][0]).toBe(best);
        expect(plan.time).toBe(best.time);
        expect(plan.lane).toBe(best.lane);
        expect(plan.crossing).toBe(race.runs[0][best.lane].time);
        expect(plan.segments.map((s) => s.kind)).toEqual(['car', 'staging', 'gate', 'run', 'slow', 'board', 'end']);
        for (let i = 1; i < plan.segments.length; i++) expect(plan.segments[i].from).toBeCloseTo(plan.segments[i - 1].to, 9);
        // About thirteen seconds (PRD: twelve to fifteen).
        expect(plan.total).toBeGreaterThan(12);
        expect(plan.total).toBeLessThan(16);
        expect(plan.place).toBeGreaterThanOrEqual(1);
    });

    test('a rival within 0.05 s stays in the slow finish, and the slow finish brackets both crossings', () => {
        const plan = Clip.planClip(race, 0);
        const slow = plan.segments.find((s) => s.kind === 'slow');
        expect(slow.runFrom).toBeLessThan(plan.crossing);
        expect(slow.runTo).toBeGreaterThan(plan.crossing);
        if (plan.rival !== null) {
            expect(Math.abs(plan.rival - plan.crossing)).toBeLessThanOrEqual(C.clip.rivalWithin);
            expect(slow.runFrom).toBeLessThan(plan.rival);
            expect(slow.runTo).toBeGreaterThan(plan.rival);
        }
        // A runaway winner has no rival in its slow finish.
        const alone = Sim.runRace([preset('full'), fieldCar(0)], C, { record: C.timing.record });
        expect(Clip.planClip(alone, 0).rival).toBeNull();
    });

    test('clipMoment: still at the pin, then the run, the crawl over the line, and past it for the board', () => {
        const plan = Clip.planClip(race, 0);
        const seg = (k) => plan.segments.find((s) => s.kind === k);
        expect(Clip.clipMoment(plan, 0.5)).toMatchObject({ kind: 'car', runTime: 0, done: false });
        expect(Clip.clipMoment(plan, seg('gate').from + 0.01).runTime).toBe(0);
        expect(Clip.clipMoment(plan, seg('run').from + 1).runTime).toBeCloseTo(1, 9);
        const slow = seg('slow');
        const mid = Clip.clipMoment(plan, (slow.from + slow.to) / 2);
        expect(mid.runTime).toBeCloseTo((slow.runFrom + slow.runTo) / 2, 9);
        expect(Clip.clipMoment(plan, seg('board').from + 0.1).runTime).toBeGreaterThan(plan.crossing + 1);
        expect(Clip.clipMoment(plan, plan.total + 1)).toMatchObject({ kind: 'end', progress: 1, done: true });
    });

    test('the opening shot circles the car from its lane\'s open side, and the rest are the director\'s', () => {
        const path = T.pathOf();
        const car = preset('full');
        for (const lane of [0, 3]) {
            const pose = T.carPose(path, 0, lane, car);
            const f = Clip.clipFraming({ kind: 'car', progress: 0.5 }, { path, pose, carLength: C.kit.length, leadS: 0, aspect: 9 / 16 });
            // Out past the edge of the track, on the visitor's side.
            expect(Math.sign(f.position.z - pose.z)).toBe(lane === 0 ? -1 : 1);
            expect(f.position.y).toBeGreaterThan(pose.y);
        }
        const plan = Clip.planClip(race, 0);
        for (const k of ['staging', 'run', 'slow', 'board', 'end']) {
            const m = Clip.clipMoment(plan, plan.segments.find((s) => s.kind === k).from + 0.05);
            const f = Clip.clipFraming(m, { path, pose: null, carLength: C.kit.length, leadS: 2, aspect: 9 / 16 });
            expect(Number.isFinite(f.position.x)).toBe(true);
            // The live race stands further back (D54); the clip keeps its
            // cars as large as M2 framed them.
            const shot = (pullBack) => {
                const g = Dir.framing(Dir.shotFor(k === 'slow' ? 'replay' : k === 'board' || k === 'end' ? 'times' : k, 2, {}, C), path, 2, 9 / 16, C, { pullBack });
                return Math.hypot(g.position.x - g.target.x, g.position.y - g.target.y, g.position.z - g.target.z);
            };
            expect(Math.hypot(f.position.x - f.target.x, f.position.y - f.target.y, f.position.z - f.target.z)).toBeCloseTo(shot(1), 9);
            expect(shot(C.camera.pullBack)).toBeGreaterThan(shot(1));
        }
    });

    const frame = (over) => ({
        kind: 'run', progress: 0.5, carName: 'The Full Treatment', eventLabel: 'Hard division', heatLabel: 'Heat 2 · Lane 3',
        crossed: false, time: 3.188, place: 1, url: 'scenexp.com/derby',
        rows: [{ place: 1, name: 'The Full Treatment', average: 3.19, mine: true }, { place: 2, name: 'The Phantom', average: 3.19, mine: false }],
        ...over
    });

    test('the words burned in: the car, the heat, the time once across, the photo finish, the board, the end card', () => {
        const w = 720;
        const h = 1280;
        let r = recording2d();
        Clip.drawClipFrame(r.g, w, h, frame({ kind: 'car' }));
        expect(r.said()).toEqual(['DERBY DAY', 'The Full Treatment', 'Hard division']);
        r = recording2d();
        Clip.drawClipFrame(r.g, w, h, frame());
        expect(r.said()).toEqual(['Heat 2 · Lane 3']);
        r = recording2d();
        Clip.drawClipFrame(r.g, w, h, frame({ kind: 'slow', crossed: true }));
        expect(r.said()).toEqual(['Heat 2 · Lane 3', 'PHOTO FINISH', '3.188', '1st in this heat · The Full Treatment']);
        r = recording2d();
        Clip.drawClipFrame(r.g, w, h, frame({ kind: 'board' }));
        expect(r.said()).toEqual(['HARD DIVISION', 'Final standings', '1st', 'The Full Treatment', 'You', '3.190', '2nd', 'The Phantom', '3.190',
            'Average of four heats, every car in every lane']);
        r = recording2d();
        Clip.drawClipFrame(r.g, w, h, frame({ kind: 'end', progress: 0.1 }));
        expect(r.said()).toEqual(['Can you beat it?', 'scenexp.com/derby', 'Derby Day']);
        expect(r.g.globalAlpha).toBe(1);
        for (const t of r.said()) expect(t).not.toMatch(/[—;]|pinewood/i);
    });

    test('a long name shrinks to fit the frame rather than running off it', () => {
        const r = recording2d();
        Clip.drawClipFrame(r.g, 720, 1280, frame({ kind: 'car', carName: 'The Quite Unreasonably Long Name' }));
        const name = r.words.find((x) => x.text === 'The Quite Unreasonably Long Name');
        const size = parseFloat(name.font.split(' ')[1]);
        expect(size).toBeLessThan(88);
        expect(name.text.length * size * 0.55).toBeLessThanOrEqual(720 * 0.88);
    });

    test('the still picture: the car\'s name, the event, the board, and the way to the scene', () => {
        const r = recording2d();
        Clip.drawStill(r.g, 1080, 1350, frame());
        expect(r.said()).toEqual(['DERBY DAY', 'The Full Treatment', 'Hard division', '1st', 'The Full Treatment', '3.190', '2nd', 'The Phantom', '3.190',
            'Can you beat it? scenexp.com/derby']);
    });
});

// ---- The share card on the page -------------------------------------------------

describe('the share card on the page', () => {
    let dom;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
    });

    async function boot() {
        const main = await import('../www/derby/js/main.js');
        await flushAsync(30);
        await jest.advanceTimersByTimeAsync(500);
        return main;
    }

    function frames(main, seconds, fps = 30) {
        const loop = dom.loops[dom.loops.length - 1];
        const spy = jest.spyOn(performance, 'now');
        let now = main.getState().lastTime;
        for (let i = 1; i <= Math.round(seconds * fps); i++) {
            now += 1000 / fps;
            spy.mockReturnValue(now);
            loop();
        }
        spy.mockRestore();
    }

    /** A browser that can record: MediaRecorder, canvas capture, and the
     *  canvases able to stream and to make a PNG. */
    function recordingBrowser() {
        class FakeRecorder {
            static isTypeSupported(t) { return t === 'video/webm'; }
            constructor(stream, options) { this.mimeType = options.mimeType; FakeRecorder.last = this; this.stream = stream; }
            start() {}
            stop() {
                this.ondataavailable({ data: new Blob(['clip']) });
                this.onstop();
            }
        }
        const Canvas = function () {};
        Canvas.prototype.captureStream = () => ({});
        Object.assign(dom.windowStub, { MediaRecorder: FakeRecorder, HTMLCanvasElement: Canvas, Blob, File });
        const realCreate = dom.documentStub.createElement;
        const saved = [];
        dom.documentStub.createElement = (tag) => {
            const e = realCreate(tag);
            if (tag === 'canvas') {
                e.captureStream = () => ({ tracks: [], addTrack(t) { this.tracks.push(t); } });
                e.toBlob = (cb) => cb(new Blob(['png'], { type: 'image/png' }));
            }
            if (tag === 'a') e.click = () => saved.push(e.download);
            return e;
        };
        return { FakeRecorder, saved };
    }

    async function toResults(main) {
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        main.__test__.finishRace('skip');
        expect(main.getState().phase).toBe('results');
    }

    test('the sound button and M turn the sound on and off, and say which', async () => {
        const main = await boot();
        const btn = dom.el('sound-btn');
        expect(btn.classList.contains('visible')).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        fire(btn, 'click');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.getAttribute('title')).toBe('Sound on (M)');
        fire(dom.documentStub, 'keydown', { key: 'm' });
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        // Not with a modifier held.
        fire(dom.documentStub, 'keydown', { key: 'm', metaKey: true });
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(main.__test__.sound.isOn()).toBe(false);
    });

    test('a browser that cannot record says so kindly, and the card closes with Done or Escape', async () => {
        const main = await boot();
        await toResults(main);
        fire(dom.el('results-share'), 'click');
        const modal = dom.el('clip-modal');
        expect(modal.classList.contains('hidden')).toBe(false);
        expect(dom.el('clip-progress').textContent).toMatch(/can’t make a video, but you can save a picture/);
        expect(main.getState().clip).toBeNull();
        fire(dom.el('clip-close'), 'click');
        expect(modal.classList.contains('hidden')).toBe(true);
        fire(dom.el('results-share'), 'click');
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(modal.classList.contains('hidden')).toBe(true);
        // The results are still up behind it.
        expect(main.getState().phase).toBe('results');
    });

    test('a clip is made live, plays back in the card, and is saved where it cannot be shared', async () => {
        const { FakeRecorder, saved } = recordingBrowser();
        const main = await boot();
        await toResults(main);
        fire(dom.el('results-share'), 'click');
        const state = main.getState();
        expect(state.clip.recording).toBe(true);
        expect(state.clip.mime).toBe('video/webm');
        // The live canvas is in the stage while it is made.
        expect(dom.el('clip-stage').children[0].tagName).toMatch(/canvas/i);
        frames(main, 2);
        expect(dom.el('clip-progress').textContent).toMatch(/Making your clip… \d+ seconds to go/);
        frames(main, state.clip.plan.total);
        await flushAsync(10);
        expect(FakeRecorder.last).toBeTruthy();
        const c = state.clip;
        expect(c.recording).toBe(false);
        expect(c.blob.type).toBe('video/webm');
        expect(c.name).toBe('derby-day-blue-wedge.webm');
        const video = dom.el('clip-stage').children[0];
        expect(video.tagName).toMatch(/video/i);
        expect(video.src).toBe(c.url);
        const share = dom.el('clip-share');
        expect(share.hidden).toBe(false);
        expect(share.textContent).toBe('Save video');
        expect(dom.el('clip-again').hidden).toBe(false);
        fire(share, 'click');
        await flushAsync(10);
        expect(saved).toEqual(['derby-day-blue-wedge.webm']);
        expect(dom.el('clip-status').textContent).toMatch(/saved to your downloads/);
        // The picture, made ahead, saved too.
        fire(dom.el('clip-image'), 'click');
        await flushAsync(10);
        expect(saved).toEqual(['derby-day-blue-wedge.webm', 'derby-day-blue-wedge-results.png']);
        // Make it again: a fresh clip.
        fire(dom.el('clip-again'), 'click');
        expect(state.clip.recording).toBe(true);
        // The picture waits while a clip is being made.
        fire(dom.el('clip-image'), 'click');
        await flushAsync(5);
        expect(dom.el('clip-status').textContent).toMatch(/still being made/);
        // Closing part way lets the clip go.
        fire(dom.el('clip-close'), 'click');
        expect(state.clip).toBeNull();
    });

    // The M7.1 sweep: the clip's orbit and slow finish played live, and the
    // finished video autoplayed on a loop, whatever the visitor's setting.
    test('reduced motion: the clip records unseen, and the finished clip waits for its play button', async () => {
        dom.windowStub.matchMedia = (q) => ({
            media: q, matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
        });
        recordingBrowser();
        const main = await boot();
        await toResults(main);
        fire(dom.el('results-share'), 'click');
        const state = main.getState();
        const live = dom.el('clip-stage').children[0];
        expect(live.classList.contains('is-unseen')).toBe(true);
        frames(main, state.clip.plan.total + 0.1);
        await flushAsync(10);
        const video = dom.el('clip-stage').children[0];
        expect(video.tagName).toMatch(/video/i);
        expect(video.autoplay).toBe(false);
        expect(video.controls).toBe(true);
    });

    test('the clip\'s sound box follows into the recording, even with the speakers muted', async () => {
        recordingBrowser();
        const main = await boot();
        await toResults(main);
        const calls = [];
        const s = main.__test__.sound;
        const real = s.setRecording;
        s.setRecording = (on, withSound) => { calls.push([on, withSound]); return real(on, withSound); };
        fire(dom.el('results-share'), 'click');
        expect(calls[0]).toEqual([true, true]);
        const box = dom.el('clip-sound');
        box.checked = false;
        fire(box, 'change');
        expect(calls[calls.length - 1]).toEqual([true, false]);
        expect(s.isOn()).toBe(false);
    });
});
