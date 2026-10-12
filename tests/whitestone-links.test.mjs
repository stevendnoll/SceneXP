// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The share and edit links (www/whitestone/js/links.js). They arrive from a
 * message, so they are untrusted text: the parsers take exactly the shape
 * PLANNING 7.3 names and nothing else, and they are fed hostile input here.
 */
import { CONFIG } from '../www/whitestone/js/config.js';
import { buildShare, buildEdit, parseShare, parseEdit, withoutFragment, ID, SECRET } from '../www/whitestone/js/links.js';

const ORIGIN = 'https://www.scenexp.com';
const id = 'AbCdEfGhIjKlMnOpQrStUv';                                    // 22
const key = 'k'.repeat(21) + '-_' + 'K'.repeat(20);                     // 43
const owner = 'o'.repeat(43);

describe('building', () => {
    test('the two links have the shapes the plan names', () => {
        expect(buildShare(ORIGIN, CONFIG, id, key)).toBe(`${ORIGIN}/whitestone/tasks/?c=${id}#k=${key}`);
        expect(buildEdit(ORIGIN, CONFIG, id, key, owner)).toBe(`${ORIGIN}/whitestone/?edit=${id}#k=${key}&o=${owner}`);
        expect(buildShare('http://127.0.0.1:8080', CONFIG, id, key)).toMatch(/^http:\/\/127\.0\.0\.1:8080\/whitestone\/tasks\//);
    });

    test('a link is never built from parts that would not parse', () => {
        expect(() => buildShare('javascript:alert(1)', CONFIG, id, key)).toThrow();
        expect(() => buildShare(`${ORIGIN}/`, CONFIG, id, key)).toThrow();
        expect(() => buildShare(ORIGIN, CONFIG, `${id}x`, key)).toThrow();
        expect(() => buildShare(ORIGIN, CONFIG, id, 'short')).toThrow();
        expect(() => buildEdit(ORIGIN, CONFIG, id, key, null)).toThrow();
    });

    test('what is built parses back', () => {
        expect(parseShare(buildShare(ORIGIN, CONFIG, id, key), CONFIG)).toEqual({ id, key });
        expect(parseEdit(buildEdit(ORIGIN, CONFIG, id, key, owner), CONFIG)).toEqual({ id, key, ownerToken: owner });
        expect(ID.test(id) && SECRET.test(key)).toBe(true);
    });
});

describe('parsing', () => {
    test('a location object works as well as an address, and index.html is the same page', () => {
        expect(parseShare({ pathname: '/whitestone/tasks/', search: `?c=${id}`, hash: `#k=${key}` }, CONFIG)).toEqual({ id, key });
        expect(parseShare(`${ORIGIN}/whitestone/tasks/index.html?c=${id}#k=${key}`, CONFIG)).toEqual({ id, key });
        expect(parseEdit({ pathname: '/whitestone/', search: `?edit=${id}`, hash: `#o=${owner}&k=${key}` }, CONFIG))
            .toEqual({ id, key, ownerToken: owner });
    });

    test.each([
        ['no key', `${ORIGIN}/whitestone/tasks/?c=${id}`],
        ['no id', `${ORIGIN}/whitestone/tasks/#k=${key}`],
        ['a key in the query, where the server would see it', `${ORIGIN}/whitestone/tasks/?c=${id}&k=${key}`],
        ['the id given twice', `${ORIGIN}/whitestone/tasks/?c=${id}&c=${id}#k=${key}`],
        ['an extra parameter', `${ORIGIN}/whitestone/tasks/?c=${id}&x=1#k=${key}`],
        ['an extra fragment value', `${ORIGIN}/whitestone/tasks/?c=${id}#k=${key}&script=1`],
        ['a short key', `${ORIGIN}/whitestone/tasks/?c=${id}#k=${key.slice(1)}`],
        ['a long id', `${ORIGIN}/whitestone/tasks/?c=${id}A#k=${key}`],
        ['an encoded character', `${ORIGIN}/whitestone/tasks/?c=${id.slice(0, 20)}%41A#k=${key}`],
        ['a base64 slash', `${ORIGIN}/whitestone/tasks/?c=${id.slice(0, 21)}/#k=${key}`],
        ['the edit page', `${ORIGIN}/whitestone/?c=${id}#k=${key}`],
        ['another page', `${ORIGIN}/whitestone/tasks/print/?c=${id}#k=${key}`],
        ['a path escape', `${ORIGIN}/whitestone/tasks/../?c=${id}#k=${key}`],
        ['a script address', `javascript:alert(1)//whitestone/tasks/?c=${id}#k=${key}`],
        ['a data address', `data:text/html,<p>?c=${id}#k=${key}`],
        ['a user in the address', `https://user:pass@www.scenexp.com/whitestone/tasks/?c=${id}#k=${key}`],
        ['an empty parameter name', `${ORIGIN}/whitestone/tasks/?=${id}#k=${key}`],
        ['a prototype name', `${ORIGIN}/whitestone/tasks/?constructor=${id}#k=${key}`],
        ['a prototype name in the fragment', `${ORIGIN}/whitestone/tasks/?c=${id}#__proto__=${key}`],
        ['not an address', 'my checklist'],
        ['far too long', `${ORIGIN}/whitestone/tasks/?c=${id}#k=${key}${'&'.repeat(600)}`],
        ['not text', 42],
        ['nothing', null]
    ])('a share link with %s is refused', (_name, link) => {
        expect(parseShare(link, CONFIG)).toBeNull();
    });

    test.each([
        ['no owner token', `${ORIGIN}/whitestone/?edit=${id}#k=${key}`],
        ['the owner token twice', `${ORIGIN}/whitestone/?edit=${id}#k=${key}&o=${owner}&o=${owner}`],
        ['the share page', `${ORIGIN}/whitestone/tasks/?edit=${id}#k=${key}&o=${owner}`],
        ['a location with a missing part', { pathname: '/whitestone/', search: `?edit=${id}` }]
    ])('an edit link with %s is refused', (_name, link) => {
        expect(parseEdit(link, CONFIG)).toBeNull();
    });
});

test('taking the fragment off leaves the page and its query, so the key leaves the address bar', () => {
    expect(withoutFragment({ pathname: '/whitestone/tasks/', search: `?c=${id}`, hash: `#k=${key}` })).toBe(`/whitestone/tasks/?c=${id}`);
});
