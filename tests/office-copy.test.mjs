// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's copy, the whole of it (the M7 copy pass, 2026-09-28): the
 * page's visible text and the attributes a visitor meets, and every string
 * of words in the office's scripts (announcements, toasts, cards, forms).
 * House style: no em or en dashes and no semicolons, and American spelling
 * AND vocabulary (the "a spelling check misses vocabulary" note: two lists,
 * not one). The other office suites guard a surface each; this is the sweep.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'www', 'office');

/** British spellings, and the British words for things an American says
 *  differently, as they could turn up in a job search or an office. */
const SPELLING = /\b(colour\w*|favour\w*|behaviour\w*|centre\w*|metre\w*|organis\w*|realis\w*|recognis\w*|prioritis\w*|summaris\w*|apologis\w*|customis\w*|analys(e|ed|es|ing)\b|licence|cheque|travell\w*|cancell(ed|ing)|labell\w*|modell\w*|grey|towards|whilst|amongst|learnt|programme|catalogue|practise|defence|judgement|enrol|fulfil)\b/i;
const VOCABULARY = /\b(CV|curriculum vitae|fortnight|diary|mobile phone|timetable|holiday|at the weekend|full stop|maths|rubbish|queue|flat\b|post code|postcode|autumn)\b/i;

/** Strings of words in a script, a line at a time (never across lines: a
 *  quote class that can cross a line reads code as copy). */
function scriptStrings() {
    const out = [];
    for (const name of readdirSync(join(DIR, 'js')).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))) {
        readFileSync(join(DIR, 'js', name), 'utf8').split('\n').forEach((line, i) => {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
            const code = line.replace(/\/\/.*$/, '');
            for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\\n]|\\.)*)`/g)) {
                const s = m[1] ?? m[2] ?? m[3];
                // Words, not identifiers, selectors or paths.
                if (s && /[A-Za-z]+ [A-Za-z]+ [A-Za-z]+/.test(s)) out.push({ where: `${name}:${i + 1}`, s });
            }
        });
    }
    return out;
}

/** The page's visible text and the attributes a visitor meets. */
function pageStrings() {
    const html = readFileSync(join(DIR, 'index.html'), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
    const out = [];
    for (const m of html.matchAll(/(?:aria-label|title|placeholder|alt|content)="([^"]*)"/g)) out.push({ where: 'index.html', s: m[1] });
    for (const s of html.replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim())) {
        if (/[A-Za-z]+ [A-Za-z]+/.test(s)) out.push({ where: 'index.html', s });
    }
    return out;
}

/** What is wrong with a line of copy, or null. */
function fault(s) {
    if (/[—–]/.test(s)) return 'a dash';
    if (/[a-z)]; [A-Za-z]/.test(s)) return 'a semicolon';
    const spell = s.match(SPELLING);
    if (spell) return `British spelling: ${spell[0]}`;
    const word = s.match(VOCABULARY);
    if (word) return `British vocabulary: ${word[0]}`;
    return null;
}

describe('Corner Office\'s copy', () => {
    test('the check catches what it is for (a check that cannot fail guards nothing)', () => {
        expect(fault('Your CV is in the diary — see you after the weekend; cheers')).not.toBeNull();
        expect(fault('The colour of the centre')).toMatch(/spelling/);
        expect(fault('Update your CV before Monday')).toMatch(/vocabulary/);
        expect(fault('Application sent. That\'s 3 this week, 2 to go.')).toBeNull();
    });

    test('the page: no dashes, no semicolons, American spelling and words', () => {
        const lines = pageStrings();
        expect(lines.length).toBeGreaterThan(60);
        for (const { where, s } of lines) expect({ where, s, fault: fault(s) }).toEqual({ where, s, fault: null });
    });

    test('the scripts\' words: announcements, toasts, cards and forms alike', () => {
        const lines = scriptStrings();
        expect(lines.length).toBeGreaterThan(150);
        for (const { where, s } of lines) expect({ where, s, fault: fault(s) }).toEqual({ where, s, fault: null });
    });

    test('the scene description names things as the toolbar and Places do', () => {
        const html = readFileSync(join(DIR, 'index.html'), 'utf8');
        const label = html.match(/<canvas id="game-canvas"[^>]*aria-label="([^"]+)"/)[1];
        for (const thing of ['computer', 'lamp', 'wastebasket', 'filing cabinet', 'printer', 'pinboard', 'whiteboard', 'binoculars']) {
            expect(label).toContain(thing);
        }
        expect(label).not.toMatch(/credenza|corkboard|tray/i);
    });
});
