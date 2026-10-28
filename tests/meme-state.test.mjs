// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The meme being made (www/meme/js/state.js, specs/meme PLANNING 4.2):
 * anything becomes a valid meme, and the store keeps the last one in this
 * browser, politely giving up where the browser refuses.
 */
import * as S from '../www/meme/js/state.js';
import { TEMPLATES, byOrder, slotsOf } from '../www/meme/js/templates.js';
import { EXPRESSIONS } from '../www/shared/js/avatar-expressions-1.0.0.js';

const RULES = { templates: TEMPLATES, byOrder, slotsOf, expressions: EXPRESSIONS.map((e) => e.id), maxChars: 60 };

describe('normalizeMeme', () => {
    test('nothing becomes the first meme with empty captions and the templates\' own faces', () => {
        for (const raw of [undefined, null, 3, 'x', {}, []]) {
            expect(S.normalizeMeme(raw, RULES)).toEqual({ v: 1, template: 'surprised', captions: [''], expressions: [null] });
        }
    });

    test('a valid meme comes back as it is, padded to its template\'s slots', () => {
        const meme = { v: 1, template: 'panic', captions: ['a', 'b'], expressions: [null, 'rage', null, null, null, null] };
        expect(S.normalizeMeme(meme, RULES)).toEqual({ v: 1, template: 'panic', captions: ['a', 'b', ''], expressions: [null, 'rage', null, null, null, null] });
    });

    test('an unknown template, over-long captions, extra captions, and unknown or misplaced faces are made right', () => {
        const long = 'x'.repeat(100);
        const meme = S.normalizeMeme({ template: 'castle', captions: [long, 'extra', 'more'], expressions: ['bored'] }, RULES);
        expect(meme.template).toBe('surprised');
        expect(meme.captions).toEqual([long.slice(0, 60)]);
        expect(meme.expressions).toEqual([null]);
        // A face on a cell with no figure is dropped; a known one on a face stays.
        const panic = S.normalizeMeme({ template: 'panic', captions: 'nope', expressions: ['smug', 'smug', 7, null, 'crying'] }, RULES);
        expect(panic.captions).toEqual(['', '', '']);
        expect(panic.expressions).toEqual([null, 'smug', null, null, null, null]);
        // Captions that are not strings become strings or nothing.
        expect(S.normalizeMeme({ template: 'surprised', captions: [42] }, RULES).captions).toEqual(['42']);
        expect(S.normalizeMeme({ template: 'surprised', captions: [null] }, RULES).captions).toEqual(['']);
    });

    test('sameMeme compares the whole meme', () => {
        const a = S.normalizeMeme({ template: 'panic', captions: ['a'] }, RULES);
        expect(S.sameMeme(a, S.normalizeMeme({ template: 'panic', captions: ['a'] }, RULES))).toBe(true);
        expect(S.sameMeme(a, S.normalizeMeme({ template: 'panic', captions: ['b'] }, RULES))).toBe(false);
    });
});

describe('the store', () => {
    function storage() {
        const map = new Map();
        return {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, String(v)),
            removeItem: (k) => map.delete(k),
            map
        };
    }

    test('keeps, loads and clears the last meme under its key', () => {
        const win = { localStorage: storage() };
        const store = S.createMemeStore({ key: 'test-meme', win });
        expect(store.available).toBe(true);
        expect(store.load()).toBeNull();
        expect(store.save({ v: 1, template: 'panic', captions: ['a'] })).toBe(true);
        expect(win.localStorage.map.get('test-meme')).toBe('{"v":1,"template":"panic","captions":["a"]}');
        expect(store.load()).toEqual({ v: 1, template: 'panic', captions: ['a'] });
        expect(store.clear()).toBe(true);
        expect(store.load()).toBeNull();
        expect(win.localStorage.map.has('test-meme-probe')).toBe(false);
    });

    test('a browser that refuses storage, or holds rubbish, is not an error', () => {
        const none = S.createMemeStore({ win: {} });
        expect(none.available).toBe(false);
        expect(none.load()).toBeNull();
        expect(none.save({})).toBe(false);
        expect(none.clear()).toBe(false);
        const throwing = S.createMemeStore({ win: { get localStorage() { throw new Error('denied'); } } });
        expect(throwing.available).toBe(false);
        expect(throwing.save({})).toBe(false);
        const full = { localStorage: { ...storage(), setItem: () => { throw new Error('quota'); } } };
        const quota = S.createMemeStore({ win: full });
        expect(quota.available).toBe(false);
        expect(quota.save({})).toBe(false);
        const junk = { localStorage: storage() };
        junk.localStorage.setItem('scenexp-meme', '{not json');
        expect(S.createMemeStore({ win: junk }).load()).toBeNull();
        junk.localStorage.setItem('scenexp-meme', '"a string"');
        expect(S.createMemeStore({ win: junk }).load()).toBeNull();
        junk.localStorage.setItem('scenexp-meme', `{"a":"${'x'.repeat(9000)}"}`);
        expect(S.createMemeStore({ win: junk }).load()).toBeNull();
        const breaking = { localStorage: { ...storage(), removeItem: () => { throw new Error('no'); } } };
        expect(S.createMemeStore({ win: breaking }).clear()).toBe(false);
        expect(S.createMemeStore({ win: null }).available).toBe(false);
    });
});
