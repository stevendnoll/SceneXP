// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The remix link (www/meme/js/remix.js, specs/meme PLANNING 4.3), pure:
 * every template round-trips with every kind of caption, the longest legal
 * link stays under the ceiling, a long one is trimmed rather than refused,
 * everything malformed is turned away or degraded to the template alone,
 * hostile captions survive as text, and the avatar rides along in the
 * avatar part's own link. The telemetry part never reads the fragment.
 */
import { readFileSync } from 'node:fs';
import * as R from '../www/meme/js/remix.js';
import { normalizeMeme } from '../www/meme/js/state.js';
import { TEMPLATES, byOrder, slotsOf } from '../www/meme/js/templates.js';
import { EXPRESSIONS } from '../www/shared/js/avatar-expressions-1.0.0.js';
import { MEME_PAGE as CONFIG } from '../www/meme/js/config.js';
import { DEFAULT_AVATAR, normalizeAvatar, encodeLink } from '../www/shared/js/avatar-1.0.0.js';

const RULES = { templates: TEMPLATES, byOrder, slotsOf, expressions: EXPRESSIONS.map((e) => e.id), maxChars: CONFIG.caption.maxChars };
const MAX = CONFIG.remix.maxLength;
const decode = (hash) => R.decodeRemix(hash, RULES, { max: MAX, normalize: normalizeMeme });
const meme = (raw) => normalizeMeme(raw, RULES);

describe('round trips', () => {
    const HOSTILE = ['<script>alert(1)</script>', 'fish & chips | peas', 'a/b#c?d=e&f=g', '50% off + tax', '🙂🙃 emoji', 'مرحبا بالعالم', "it's \"quoted\"", '   spaced   out   '];

    test('every template, with every kind of caption and a face a cell, comes back exactly', () => {
        for (const t of TEMPLATES) {
            const slots = slotsOf(t);
            const captions = slots.map((_, k) => HOSTILE[k % HOSTILE.length]);
            const expressions = t.cells.map((cell, i) => (cell.figures.length && i % 2 ? 'rage' : null));
            const before = meme({ template: t.id, captions, expressions });
            const hash = R.encodeRemix(before, null, { max: MAX });
            expect(hash.startsWith(`m=1/${t.id}/`)).toBe(true);
            expect(hash).not.toMatch(/[#&<>"]/);
            const back = decode(`#${hash}`);
            expect({ [t.id]: back.meme }).toEqual({ [t.id]: before });
            expect(back.avatar).toBeNull();
            // Among other parts, with or without the hash sign.
            expect(decode(`x=1&${hash}&y=2`).meme).toEqual(before);
        }
    });

    test('a background color travels as six hex digits after the faces, only when one was picked (M8)', () => {
        const picked = meme({ template: 'galaxyBrain', captions: ['a', 'b', 'c', 'd'], tint: '#1B2A55' });
        const hash = R.encodeRemix(picked);
        expect(hash).toBe('m=1/galaxyBrain/a|b|c|d/-,-,-,-,-,-,-,-/1b2a55');
        expect(decode(hash).meme).toEqual(picked);
        expect(decode(hash).meme.tint).toBe('#1b2a55');
        // The meme's own sends nothing extra, so a link reads as it did
        // before there were colors, and an older link is the meme's own.
        const own = meme({ template: 'galaxyBrain', captions: ['a'] });
        expect(R.encodeRemix(own)).toBe('m=1/galaxyBrain/a|||/-,-,-,-,-,-,-,-');
        expect(decode('m=1/galaxyBrain/a|||/-,-,-,-,-,-,-,-').meme.tint).toBeNull();
        // Anything else in that place is the meme's own, never an error.
        for (const bad of ['1b2a5', 'zzzzzz', '1b2a55ff', '%23ffffff', '<b>']) {
            const back = decode(`m=1/galaxyBrain/a|||/-,-,-,-,-,-,-,-/${bad}`);
            expect(back.meme.template).toBe('galaxyBrain');
            expect(back.meme.tint).toBeNull();
        }
        // A template that offers no color drops one sent with it.
        expect(decode('m=1/panic/a||/-,-,-,-,-,-/1b2a55').meme.tint).toBeNull();
    });

    test('the people the maker chose travel under their roles\' ids, and nobody from the crowd does (M8)', () => {
        const friend = normalizeAvatar({ skin: 'deep', shirt: 'teal' });
        const other = normalizeAvatar({ skin: 'light', hat: 'beret', shirt: 'xabcdef' });
        const lead = normalizeAvatar({ skin: 'medium' });
        const made = meme({ template: 'headTurn', captions: ['me', 'them', 'you'], friend, cast: { other } });
        const hash = R.encodeRemix(made, lead);
        expect(hash).toContain(`&${encodeLink(lead)}`);
        expect(hash).toContain(`&friend=${encodeLink(friend).slice(2)}`);
        expect(hash).toContain(`&other=${encodeLink(other).slice(2)}`);
        // The friend first, then the cast.
        expect(hash.indexOf('&friend=')).toBeLessThan(hash.indexOf('&other='));
        const back = decode(hash);
        expect(back.meme).toEqual(made);
        expect(back.avatar).toEqual(lead);
        // Nobody chosen, nothing sent: the friend who opens it gets their
        // own crowd.
        const plain = R.encodeRemix(meme({ template: 'headTurn', captions: ['a'] }), lead);
        expect(plain).not.toMatch(/&(friend|other)=/);
        expect(decode(plain).meme.friend).toBeNull();
        expect(decode(plain).meme.cast).toEqual({});
        expect(R.encodePeople(meme({ template: 'headTurn' }))).toBe('');
    });

    test('a person is read only for a crowd role of the link\'s own template, and a broken one is nobody', () => {
        const someone = encodeLink(normalizeAvatar({ skin: 'deep' })).slice(2);
        // The Handshake has no Someone: an `other=` part is ignored.
        const handshake = decode(`m=1/handshake/a|b|c/-&friend=${someone}&other=${someone}`);
        expect(handshake.meme.friend.skin).toBe('deep');
        expect(handshake.meme.cast).toEqual({});
        // The lead is never read from a role part, nor from a made-up one.
        expect(decode(`m=1/headTurn/a||/-&you=${someone}&stranger=${someone}`).meme.cast).toEqual({});
        expect(decode(`m=1/headTurn/a||/-&you=${someone}`).avatar).toBeNull();
        // A broken part is nobody, and the meme still opens.
        for (const bad of ['9.deep', 'x', '', '1.' + 'q'.repeat(900)]) {
            const back = decode(`m=1/headTurn/a||/-&other=${bad}&friend=${bad}`);
            expect(back.meme.template).toBe('headTurn');
            expect(back.meme.cast).toEqual({});
            expect(back.meme.friend).toBeNull();
        }
    });

    test('three people in their heaviest clothes and every caption full still fit under the ceiling', () => {
        // Every color field a custom color: the longest an avatar's link gets.
        const heavy = (skin) => normalizeAvatar({ skin, eyes: 'x111111', hair: 'x222222', shirt: 'x333333', bottomColor: 'x444444', shoeColor: 'x555555', hatColor: 'x666666', hat: 'beret', lips: 'x777777', facial: 'beard', facialColor: 'x888888', glasses: 'round', frameColor: 'x999999', lensColor: 'xaaaaaa', sleeves: 'jersey', jerseyNumber: 'n00', numberColor: 'xbbbbbb', legwear: 'fishnets', legwearColor: 'xcccccc', armwear: 'fishnets', armwearColor: 'xdddddd' });
        const t = TEMPLATES.find((x) => x.id === 'headTurn');
        const full = meme({ template: t.id, captions: slotsOf(t).map(() => 'W'.repeat(CONFIG.caption.maxChars)), friend: heavy('deep'), cast: { other: heavy('light') } });
        const hash = R.encodeRemix(full, heavy('medium'), { max: MAX });
        expect(hash.length).toBeLessThan(MAX);
        expect(decode(hash).meme).toEqual(full);
        // Emoji in every caption: trimmed to fit, the people all still there.
        const emoji = meme({ ...full, captions: slotsOf(t).map(() => '🙂'.repeat(CONFIG.caption.maxChars / 2)) });
        const trimmed = R.encodeRemix(emoji, heavy('medium'), { max: MAX });
        expect(trimmed.length).toBeLessThanOrEqual(MAX);
        expect(decode(trimmed).meme.cast.other).toEqual(heavy('light'));
        expect(decode(trimmed).meme.friend).toEqual(heavy('deep'));
    });

    test('a space travels as a plus and the words stay readable', () => {
        const hash = R.encodeRemix(meme({ template: 'surprised', captions: ['when the build passes'] }));
        expect(hash).toBe('m=1/surprised/when+the+build+passes/-');
        expect(R.encodeCaption('a+b c')).toBe('a%2Bb+c');
        expect(R.decodeCaption('a%2Bb+c')).toBe('a+b c');
        expect(R.decodeCaption('%E0%A4%A')).toBeNull();
    });

    test('the maker\'s avatar rides along in the avatar part\'s own link, and comes back valid', () => {
        const avatar = normalizeAvatar({ skin: 'deep', shirt: 'teal', hat: 'beret' });
        const hash = R.encodeRemix(meme({ template: 'plan', captions: ['step one'] }), avatar);
        expect(hash).toContain(`&${encodeLink(avatar)}`);
        const back = decode(hash);
        expect(back.avatar).toEqual(avatar);
        expect(back.meme.template).toBe('plan');
        // A broken avatar part is no avatar, and still the meme.
        const broken = hash.replace(/&a=1\./, '&a=9.');
        expect(decode(broken).avatar).toBeNull();
        expect(decode(broken).meme.captions[0]).toBe('step one');
    });

    test('the longest legal link in plain text stays under the ceiling, and an emoji-heavy one is trimmed to fit', () => {
        const longest = TEMPLATES.reduce((a, b) => (slotsOf(b).length > slotsOf(a).length ? b : a));
        const full = meme({ template: longest.id, captions: slotsOf(longest).map(() => 'W'.repeat(CONFIG.caption.maxChars)) });
        const avatar = normalizeAvatar({ shirt: 'xabcdef', bottomColor: 'x123456', hatColor: 'xfedcba', hat: 'beret' });
        const hash = R.encodeRemix(full, avatar, { max: MAX });
        expect(hash.length).toBeLessThan(MAX);
        expect(decode(hash).meme).toEqual(full);
        const spaced = meme({ template: longest.id, captions: slotsOf(longest).map(() => 'a '.repeat(CONFIG.caption.maxChars / 2).trim()) });
        expect(R.encodeRemix(spaced, avatar, { max: MAX }).length).toBeLessThan(MAX);
        // Emoji: four bytes a character, twelve in a link. Trimmed, never refused.
        const emoji = meme({ template: longest.id, captions: slotsOf(longest).map(() => '🙂'.repeat(CONFIG.caption.maxChars / 2)) });
        const trimmed = R.encodeRemix(emoji, avatar, { max: MAX });
        expect(trimmed.length).toBeLessThanOrEqual(MAX);
        const back = decode(trimmed);
        expect(back.meme.template).toBe(longest.id);
        expect(back.meme.captions.some((c) => c.length > 0)).toBe(true);
        expect(back.avatar).toEqual(avatar);
        // Nothing left to trim: the link stands as it is.
        const bare = meme({ template: 'surprised', captions: [''] });
        expect(R.encodeRemix(bare, null, { max: 5 })).toBe('m=1/surprised//-');
    });
});

describe('what is turned away or degraded', () => {
    test('no meme part, a bad version, an unknown template, over the ceiling, or not a string', () => {
        expect(decode('')).toBeNull();
        expect(decode('#a=1.fair')).toBeNull();
        expect(decode('m=2/surprised//')).toBeNull();
        expect(decode('m=1/castle/a/')).toBeNull();
        expect(decode('m=1')).toBeNull();
        expect(decode(`m=1/surprised/${'a'.repeat(MAX)}/`)).toBeNull();
        expect(decode(null)).toBeNull();
        expect(decode(42)).toBeNull();
    });

    test('a known template with broken captions is that template with empty captions', () => {
        const back = decode('m=1/panic/%E0%A4%A|fine/-,rage');
        expect(back.meme).toEqual({ v: 1, template: 'panic', captions: ['', '', ''], expressions: [null, 'rage', null, null, null, null], tint: null, friend: null, cast: {} });
        expect(decode('m=1/panic').meme).toEqual(meme({ template: 'panic' }));
        expect(decode('m=1/panic/one/bored,smug').meme.expressions).toEqual([null, 'smug', null, null, null, null]);
    });

    test('captions come back as text, never as anything else', () => {
        const back = decode(R.encodeRemix(meme({ template: 'surprised', captions: ['<img src=x onerror=alert(1)>'] })));
        expect(back.meme.captions[0]).toBe('<img src=x onerror=alert(1)>');
        expect(typeof back.meme.captions[0]).toBe('string');
    });
});

describe('the address', () => {
    test('is the page\'s own directory with the fragment, an explicit index.html resolved away', () => {
        const m = meme({ template: 'surprised', captions: ['hi'] });
        expect(R.remixUrl(m, null, 'https://www.scenexp.com/meme/index.html?x=1#old')).toBe('https://www.scenexp.com/meme/#m=1/surprised/hi/-');
        expect(R.remixUrl(m, null, 'http://localhost:8000/meme/')).toBe('http://localhost:8000/meme/#m=1/surprised/hi/-');
        expect(R.remixUrl(m, DEFAULT_AVATAR, 'http://localhost:8000/meme/')).toContain('&a=1.');
        expect(R.remixUrl(m, null, 'not a url')).toBe('not a url#m=1/surprised/hi/-');
    });

    test('the telemetry part reads the path alone, never the fragment, so a link never reaches a log', () => {
        const source = readFileSync('www/shared/js/telemetry-1.0.0.js', 'utf8');
        expect(source).not.toMatch(/location\.(hash|href|search)/);
        expect(source).toMatch(/location\.pathname/);
    });
});
