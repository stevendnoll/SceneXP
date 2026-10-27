// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * www/js/avatar-chip.js and the home page's chip markup (specs/avatar PRD
 * section 7, M4).
 *
 * The rules themselves (which picture, when the label shows, the fold) are
 * shared/js/avatar-1.0.0's and are proved in tests/shared-avatar.test.mjs.
 * What is proved here is the wiring: the module finds the chip's parts by
 * the ids the markup gives them and hands them over with the default
 * picture's path, boots itself on the page, and the markup ships the way
 * the module expects (the ids, the label and its button hidden, the picture
 * named, the nav and footer links, the sheet and the script in the head).
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { CHIP_IDS, DEFAULT_PORTRAIT, bootChip } from '../www/js/avatar-chip.js';
import { createAvatarStore, CHIP_LABEL_VISITS, CHIP_TITLES } from '../www/shared/js/avatar-1.0.0.js';
import { AVATAR_PAGE } from '../www/avatar/js/config.js';

const HOME = readFileSync('www/index.html', 'utf8');
const PNG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(10)}AAA=`;

function installStorage() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); }
    };
    return map;
}

/** The chip's parts, as index.html writes them, found by id. */
function makeDoc({ chip = true, readyState = 'complete' } = {}) {
    const el = (extra = {}) => ({ hidden: true, alt: '', src: '', listeners: {}, ...extra });
    const parts = {
        [CHIP_IDS.root]: el({ hidden: false }),
        [CHIP_IDS.link]: el({ hidden: false, focused: false, focus() { parts[CHIP_IDS.link].focused = true; } }),
        [CHIP_IDS.img]: el({ hidden: false, alt: 'Make your avatar', src: '/assets/avatar/default.png' }),
        [CHIP_IDS.label]: el(),
        [CHIP_IDS.hide]: el({
            addEventListener(type, fn) { parts[CHIP_IDS.hide].listeners[type] = fn; },
            removeEventListener(type) { delete parts[CHIP_IDS.hide].listeners[type]; },
            click() { parts[CHIP_IDS.hide].listeners.click(); }
        })
    };
    const doc = {
        readyState,
        listeners: {},
        getElementById: (id) => (chip ? parts[id] || null : null),
        addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
        fire(type) { (doc.listeners[type] || []).forEach((fn) => fn({ type })); }
    };
    return { doc, parts };
}

afterEach(() => {
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.window;
});

describe('the chip on the home page', () => {
    test('a first visit: the default picture, the label and its button revealed, the picture silent beside the words', () => {
        installStorage();
        const { doc, parts } = makeDoc();
        const chip = bootChip(doc, { store: createAvatarStore({ win: null }) });
        expect(chip.saved).toBe(false);
        expect(chip.labelShown).toBe(true);
        expect(parts[CHIP_IDS.img].src).toBe(DEFAULT_PORTRAIT);
        expect(parts[CHIP_IDS.img].alt).toBe('');
        expect(parts[CHIP_IDS.link].title).toBe(CHIP_TITLES.unsaved);
        expect(parts[CHIP_IDS.label].hidden).toBe(false);
        expect(parts[CHIP_IDS.hide].hidden).toBe(false);
        // Folded away: the picture names the link again, and focus lands on it.
        parts[CHIP_IDS.hide].click();
        expect(parts[CHIP_IDS.label].hidden).toBe(true);
        expect(parts[CHIP_IDS.hide].hidden).toBe(true);
        expect(parts[CHIP_IDS.img].alt).toBe('Make your avatar');
        expect(parts[CHIP_IDS.link].focused).toBe(true);
    });

    test('a saved avatar shows its own portrait, named as such, with no label', () => {
        installStorage();
        const store = createAvatarStore({ win: null });
        store.save({ skin: 'deep' });
        store.savePortrait(PNG, 1);
        const { doc, parts } = makeDoc();
        const chip = bootChip(doc, { store });
        expect(chip.saved).toBe(true);
        expect(parts[CHIP_IDS.img].src).toBe(PNG);
        expect(parts[CHIP_IDS.img].alt).toBe('Your avatar');
        expect(parts[CHIP_IDS.link].title).toBe(CHIP_TITLES.saved);
        expect(parts[CHIP_IDS.label].hidden).toBe(true);
    });

    test('a page with no chip gets nothing, and no visit is counted', () => {
        const map = installStorage();
        const { doc } = makeDoc({ chip: false });
        expect(bootChip(doc, { store: createAvatarStore({ win: null }) })).toBeNull();
        expect(bootChip(null)).toBeNull();
        expect(map.size).toBe(0);
    });

    test('the default picture is the one the avatar page\'s lab saves', () => {
        expect(DEFAULT_PORTRAIT).toBe(AVATAR_PAGE.defaultPortrait.path);
        expect(AVATAR_PAGE.defaultPortrait.path.endsWith(`/${AVATAR_PAGE.defaultPortrait.file}`)).toBe(true);
    });
});

describe('on the page', () => {
    async function bootWith({ readyState = 'complete' } = {}) {
        installStorage();
        const { doc, parts } = makeDoc({ readyState });
        globalThis.document = doc;
        globalThis.window = {};
        await jest.isolateModulesAsync(async () => {
            await import('../www/js/avatar-chip.js');
        });
        return { doc, parts };
    }

    test('it boots itself: the label out for a new visitor, the visit counted', async () => {
        const { parts } = await bootWith();
        expect(parts[CHIP_IDS.label].hidden).toBe(false);
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar-chip')).seen).toBe(1);
    });

    test('a page still loading boots on DOMContentLoaded', async () => {
        const { doc, parts } = await bootWith({ readyState: 'loading' });
        expect(parts[CHIP_IDS.label].hidden).toBe(true);
        doc.fire('DOMContentLoaded');
        expect(parts[CHIP_IDS.label].hidden).toBe(false);
    });

    test(`the label stays folded from the visitor's visit ${CHIP_LABEL_VISITS + 1} on`, () => {
        installStorage();
        globalThis.localStorage.setItem('scenexp-avatar-chip', JSON.stringify({ seen: CHIP_LABEL_VISITS, dismissed: false }));
        const { doc, parts } = makeDoc();
        const chip = bootChip(doc, { store: createAvatarStore({ win: null }) });
        expect(chip.labelShown).toBe(false);
        expect(parts[CHIP_IDS.label].hidden).toBe(true);
        expect(parts[CHIP_IDS.img].alt).toBe('Make your avatar');
    });
});

describe('the markup', () => {
    test('index.html carries the chip under the ids the module looks for, last in the body', () => {
        for (const id of Object.values(CHIP_IDS)) {
            expect(HOME.split(`id="${id}"`).length - 1).toBe(1);
        }
        const aside = HOME.match(/<aside id="avatar-chip"[\s\S]*?<\/aside>/);
        expect(aside).not.toBeNull();
        expect(HOME.indexOf('<aside id="avatar-chip"')).toBeGreaterThan(HOME.indexOf('</footer>'));
        // The link goes to the avatar page, the picture is the default one,
        // sized and named for the no-script visitor.
        expect(aside[0]).toMatch(new RegExp(`<a id="avatar-chip-link" href="/avatar/" title="${CHIP_TITLES.unsaved}">`));
        expect(aside[0]).toMatch(new RegExp(`<img id="avatar-chip-img" src="${DEFAULT_PORTRAIT}" width="64" height="64"[^>]*alt="Make your avatar">`));
        // The label and its button are hints: both ship hidden for the script.
        expect(aside[0]).toMatch(/<span id="avatar-chip-label" hidden>Make your avatar<\/span>/);
        expect(aside[0]).toMatch(/<button id="avatar-chip-hide" type="button" hidden aria-label="[^"]+">/);
    });

    test('the head loads the chip\'s sheet and module, preloading its one import, and no three.js', () => {
        expect(HOME).toContain('<link rel="stylesheet" href="/shared/css/avatar-1.0.0.min.css">');
        expect(HOME).toContain('<link rel="modulepreload" href="/shared/js/avatar-1.0.0.min.js">');
        expect(HOME).toContain('<script type="module" src="/js/avatar-chip.min.js"></script>');
        // The copy may say Three.js; nothing the page loads is it.
        for (const tag of HOME.match(/<(?:script|link)\b[^>]*>/g)) expect(tag).not.toMatch(/three/i);
        const source = readFileSync('www/js/avatar-chip.js', 'utf8');
        expect(source.match(/^import .* from '([^']+)';$/gm)).toEqual(["import { createAvatarStore, installChip } from '../shared/js/avatar-1.0.0.min.js';"]);
    });

    test('every page with the site nav links to the avatar page from the nav and the footer', () => {
        for (const page of ['index', '404', 'contact', 'contribute', 'privacy', 'terms']) {
            const html = readFileSync(`www/${page}.html`, 'utf8');
            expect(`${page}: ${html.split('<li><a href="/avatar/">Avatar</a></li>').length - 1}`).toBe(`${page}: 1`);
            expect(`${page}: ${html.split('<li><a href="/avatar/">Your avatar</a></li>').length - 1}`).toBe(`${page}: 1`);
        }
    });
});
