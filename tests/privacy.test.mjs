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
    'www/shared/js/gamestate-1.0.0.js': 'a best score',
    'www/xo/js/audio.js': 'whether sound is muted',
    'www/xo/js/playbook-ui.js': 'the last play called and the chosen defense',
    'www/xo/js/summary.js': 'the best score in X’s and O’s',
    'www/xo/js/progress.js': 'a game of X’s and O’s that has not finished yet',
    'www/xo/js/colors.js': 'the team and field colors chosen in X’s and O’s'
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

/**
 * ---- WHAT LEAVES THE DEVICE, AND WHAT THE SERVER WRITES DOWN ----
 *
 * Until 2026-09-18 the page listed the proof-of-work token under "What stays on
 * your device" and closed that list with "Everything above stays on your device
 * and is never sent to us". The token is attached to every usage ping as
 * `hash=`: it is the key the collector groups a visit by. So the page was
 * stating something backwards, in exactly the way the storage bullet above once
 * did, and nothing could tell.
 *
 * The same pass disclosed the ordinary access log, which records IP addresses
 * and user agents. That fact lives in the production nginx config, which is
 * git-ignored and invisible to CI, so this suite can only hold the prose in
 * place. Change the log format and this section needs rereading by hand.
 */
test('the token that travels is not listed as one that stays put', () => {
    const html = readFileSync(join(WWW, 'privacy.html'), 'utf8');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const telemetry = readFileSync(join(WWW, 'shared/js/telemetry-1.0.0.js'), 'utf8');

    // THE CODE FACT THE PAGE NOW DEPENDS ON. If the pings ever stop carrying the
    // token, this fails first, which is the prompt to go back and restore the
    // stronger promise rather than leave a caveat that is no longer needed.
    expect(telemetry).toMatch(/hash:\s*_proofHash/);

    // So the page says the token travels, and never claims UNQUALIFIED that
    // everything on the list stays put. The lookbehind is what allows the
    // corrected sentence ("Apart from that puzzle token, everything above
    // stays...") while still catching the original.
    expect(text).toMatch(/puzzle token that groups one visit.s pings together/i);
    expect(text).not.toMatch(/(?<!puzzle token, )everything above stays on your device/i);
});

test('the ordinary server log is disclosed, with how long it is kept', () => {
    const html = readFileSync(join(WWW, 'privacy.html'), 'utf8');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    expect(text).toMatch(/What the web server keeps/i);
    expect(text).toMatch(/your IP address/i);
    // A disclosure without a retention period is half of one.
    expect(text).toMatch(/deleted automatically within a year/i);

    // The sentence that invited the wrong reading: pings landing in "the web
    // server's own logs", two sentences before "no IP addresses", read as though
    // the server kept no IPs at all. They land in a separate log that does not.
    expect(text).not.toMatch(/land in the web server.s own logs/i);
    expect(text).toMatch(/separate log of their own/i);
});

test('the summaries that search and social cards show agree with the page', () => {
    // "only anonymized usage counts" was true of the pings and false of the site
    // once the access log is admitted to. Three copies of it, in three tags.
    const html = readFileSync(join(WWW, 'privacy.html'), 'utf8');
    const metas = [...html.matchAll(/<meta[^>]+(?:name|property)="(?:description|og:description|twitter:description)"[^>]*>/g)]
        .map((m) => m[0]);
    expect(metas).toHaveLength(3);
    metas.forEach((tag) => {
        expect(tag).not.toMatch(/only anonymized/i);
        expect(tag).toMatch(/server logs/i);
    });
});
