// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The privacy policy is a promise, and nothing was checking it.
 *
 * ---- IT SAID THE OPPOSITE OF WHAT THE SITE DOES ----
 *
 * Until 2026-09-01 the policy told visitors that their "progress and settings
 * inside the experiences" all lived in session storage and were "cleared when
 * the tab closes". Three things were not:
 *
 *   www/garden/js/main.js          a whole saved garden, by design
 *   www/earthdefense/js/main.js    sound and control settings
 *   www/shared/js/gamestate-1.0.0  a best score
 *
 * The bullet even named "your movement and look settings", which is exactly
 * one of the things that persists. A privacy policy claiming data is discarded
 * when it is kept is a different kind of wrong from an out-of-date sentence,
 * and no test in the suite could tell: the policy is a static page nobody
 * asserts and the storage calls are spread across four files nobody reads
 * together.
 *
 * ---- SO THE GUARD IS A TRIPWIRE ON THE CALL SITES, NOT ON THE PROSE ----
 *
 * Asserting the wording would only pin today's sentence. What has to be true is
 * that the SET of code that can outlive a visit is the set the policy
 * describes, so this walks the source for writers of `localStorage` and fails
 * on any file not on the list below. Adding one is a two line change: put the
 * file here, and say what it keeps in privacy.html. Failing this test is the
 * reminder that the second half exists.
 *
 * Same shape as tests/directory.test.mjs, which exists because adding a scene
 * touches five files and only four of them are obvious.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WWW = join(process.cwd(), 'www');

/**
 * Every source file allowed to write something that survives the tab closing,
 * and the sentence in privacy.html that covers it.
 *
 * `www/lib` is skipped: it is vendored Three.js, not ours.
 */
const PERSISTENT = {
    'www/js/theme.js': 'the light or dark theme choice',
    'www/garden/js/main.js': 'the visitor’s saved garden',
    'www/earthdefense/js/main.js': 'sound and control settings',
    'www/shared/js/gamestate-1.0.0.js': 'a best score'
};

/** Source files only. The built .min copies are the same code twice. */
function sourceFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'lib' || name === 'node_modules') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sourceFiles(full, out);
        else if (name.endsWith('.js') && !name.endsWith('.min.js')) out.push(full);
    }
    return out;
}

function writersOf(api) {
    const found = [];
    for (const full of sourceFiles(WWW)) {
        const src = readFileSync(full, 'utf8');
        if (new RegExp(`\\b${api}\\.(?:set|remove)Item`).test(src)) {
            found.push(full.slice(process.cwd().length + 1));
        }
    }
    return found.sort();
}

test('NOTHING OUTLIVES THE VISIT THAT THE PRIVACY POLICY DOES NOT KNOW ABOUT', () => {
    const writers = writersOf('localStorage');
    // Both directions. An unexpected writer is an undisclosed store; a missing
    // one means the list has rotted and is no longer guarding anything, which
    // is the failure mode of every allowlist ever written.
    expect(writers).toEqual(Object.keys(PERSISTENT).sort());
});

test('and the policy actually describes them, in words a visitor would use', () => {
    const html = readFileSync(join(WWW, 'privacy.html'), 'utf8');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // The distinction the old wording got wrong: two kinds of storage, and the
    // page has to tell them apart rather than calling all of it session.
    expect(text).toMatch(/session storage/i);
    expect(text).toMatch(/local storage/i);
    expect(text).toMatch(/cleared when the tab closes/i);

    // Named, because "some data may be stored" is not a disclosure. These are
    // the two experiences whose stores a visitor would actually care about.
    expect(text).toMatch(/Fractal Garden saves your garden/i);
    expect(text).toMatch(/Earth Defense saves your best score/i);

    // AND HOW TO GET RID OF IT, which is the part that makes the disclosure
    // useful rather than merely honest.
    expect(text).toMatch(/Start a new garden button/i);
    expect(text).toMatch(/clearing this site.s data/i);

    // It must not still promise that everything is discarded. This is the exact
    // sentence that was wrong, and the one somebody would reintroduce while
    // tidying the two bullets back into one.
    expect(text).not.toMatch(/All of it lives in your browser.s session storage/i);
});

test('the policy keeps house style, like every other page of copy', () => {
    const html = readFileSync(join(WWW, 'privacy.html'), 'utf8');
    // Strip markup and entities first, so `&times;` and any inline SVG path
    // data are not read as prose. Same treatment the garden's copy sweep uses.
    const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ');
    // THE SWEEP HAS TO HAVE SWEPT SOMETHING. A strip that returns whitespace
    // passes both assertions below against anything, which is the failure mode
    // of every text guard in this suite.
    expect(text.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(1500);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/;/);
});
