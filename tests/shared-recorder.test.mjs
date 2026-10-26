// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Recording a canvas (shared/js/recorder-1.0.0.js), promoted from Derby Day's
 * recorder on 2026-10-26 for the avatar's clip. Derby Day's own suite still
 * runs these through its re-export (tests/derby-share.test.mjs).
 *
 * What is held here, and why:
 * - MP4 FIRST, WebM last: Instagram does not take WebM well.
 * - A browser can record only with MediaRecorder AND canvas capture.
 * - The slices are gathered into one file of the recorder's own type, and
 *   a failure rejects with the recorder's error.
 */
import * as Rec from '../www/shared/js/recorder-1.0.0.js';

test('MP4 first, WebM last, nothing when nothing is supported, and a type check that throws is skipped', () => {
    expect(Rec.pickMime(() => true)).toBe(Rec.MIME_PREFERENCE[0]);
    expect(Rec.pickMime((t) => t === 'video/webm')).toBe('video/webm');
    expect(Rec.pickMime((t) => { if (t.includes('mp4')) throw new Error('?'); return t === 'video/webm;codecs=vp9,opus'; })).toBe('video/webm;codecs=vp9,opus');
    expect(Rec.pickMime(() => false)).toBe('');
    expect(Rec.pickMime(null)).toBe('');
    expect(Rec.MIME_PREFERENCE[0]).toMatch(/^video\/mp4/);
    expect(Rec.MIME_PREFERENCE[Rec.MIME_PREFERENCE.length - 1]).toBe('video/webm');
    expect(Rec.extensionOf('video/mp4;codecs=avc1')).toBe('mp4');
    expect(Rec.extensionOf('video/webm')).toBe('webm');
    expect(Rec.extensionOf('')).toBe('webm');
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

test('Derby Day\'s recorder hands on this part, not a copy of it', async () => {
    const Derby = await import('../www/derby/js/recorder.js');
    const Min = await import('../www/shared/js/recorder-1.0.0.min.js');
    for (const key of ['MIME_PREFERENCE', 'canRecord', 'pickMime', 'extensionOf', 'startRecording']) {
        expect(Derby[key]).toBe(Min[key]);
    }
    expect(Derby.fileName('Blue Comet', 'mp4')).toBe('derby-day-blue-comet.mp4');
});
