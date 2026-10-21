// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared file-sharing part (shared/js/sharefile-1.0.0.js), from SOURCE,
 * against a fake share sheet and the DOM stub. Moved here from
 * derby-share.test.mjs when the part was promoted from Derby Day's
 * recorder.js (2026-10-21) for Corner Office's week card.
 *
 * What is held here, and why:
 * - A DISMISSED SHARE SHEET IS NOT A FAILURE: 'cancelled', so the caller
 *   saves nothing behind the visitor's back.
 * - THE PROBE NAMES THE FILE BY ITS TYPE. A browser may judge a share by
 *   the file's extension, so a picture is probed as a picture, not as a clip.
 */
import { installThree } from './helpers/three-stub.mjs';
import { installDom } from './helpers/dom-stub.mjs';
import { shareFile, canShareFiles, saveFile } from '../www/shared/js/sharefile-1.0.0.js';

const nav = (share, canShare = () => true) => ({ share, canShare });

test('sharing a file: shared, cancelled (not saved behind the visitor\'s back), or unavailable', async () => {
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const win = { File };
    expect(await shareFile(blob, 'a.mp4', { nav: null, win })).toBe('unavailable');
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => {}), win: {} })).toBe('unavailable');
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => {}, () => false), win })).toBe('unavailable');
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => {}, () => { throw new Error('?'); }), win })).toBe('unavailable');
    let sent = null;
    expect(await shareFile(blob, 'a.mp4', { title: 'T', text: 'X', nav: nav(async (d) => { sent = d; }), win })).toBe('shared');
    expect(sent.files[0].name).toBe('a.mp4');
    expect(sent.files[0].type).toBe('video/mp4');
    expect(sent.title).toBe('T');
    expect(sent.text).toBe('X');
    const abort = Object.assign(new Error('no'), { name: 'AbortError' });
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => { throw abort; }), win })).toBe('cancelled');
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => { throw new Error('denied'); }), win })).toBe('unavailable');
    expect(await shareFile(blob, 'a.mp4', { nav: nav(async () => {}), win: { File: function () { throw new Error('?'); } } })).toBe('unavailable');
});

test('whether a file can be shared is asked before the button is named', () => {
    const win = { File };
    expect(canShareFiles('video/mp4', { nav: nav(null), win })).toBe(true);
    expect(canShareFiles('video/mp4', { nav: nav(null, () => false), win })).toBe(false);
    expect(canShareFiles('video/mp4', { nav: nav(null, () => { throw new Error('?'); }), win })).toBe(false);
    expect(canShareFiles('video/mp4', { nav: null, win })).toBe(false);
    expect(canShareFiles('video/mp4', { nav: nav(null), win: {} })).toBe(false);
});

test('the probe file is named for its type: a clip as a clip, a picture as a picture', () => {
    const win = { File };
    const names = [];
    const asked = nav(null, (d) => { names.push(d.files[0].name); return true; });
    canShareFiles('video/mp4;codecs=avc1', { nav: asked, win });
    canShareFiles('video/webm', { nav: asked, win });
    canShareFiles('image/jpeg', { nav: asked, win });
    canShareFiles('', { nav: asked, win });
    expect(names).toEqual(['probe.mp4', 'probe.webm', 'probe.jpeg', 'probe.bin']);
});

test('saving a file offers it through a download link, then tidies the link away', () => {
    // The DOM stub wraps the THREE stub, so it goes in first.
    installThree();
    const dom = installDom();
    try {
        let clicked = null;
        const realCreate = dom.documentStub.createElement;
        dom.documentStub.createElement = (tag) => {
            const e = realCreate(tag);
            if (tag === 'a') e.click = () => { clicked = { href: e.href, download: e.download }; };
            return e;
        };
        expect(saveFile('blob:x', 'derby-day.mp4', { doc: dom.documentStub })).toBe(true);
        expect(clicked).toEqual({ href: 'blob:x', download: 'derby-day.mp4' });
        expect(dom.documentStub.body.children).toHaveLength(0);
        expect(saveFile('', 'x', { doc: dom.documentStub })).toBe(false);
        expect(saveFile('blob:x', 'x', { doc: null })).toBe(false);
    } finally {
        dom.uninstall();
    }
});
