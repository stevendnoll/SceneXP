// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for High Water, plus the page furniture.
 *
 * TWO HALVES, AND THE SECOND ONE IS THE UNUSUAL PART. The first is the ordinary
 * init test every experience ships: build the whole scene under the chainable
 * THREE proxy so that a missing import, a renamed export, or a reference left
 * behind by a refactor throws here rather than on the live site. Nothing
 * renders, but every function a real page load would call does run.
 *
 * The second half asserts the metadata. No other suite on the site does this,
 * and the furniture is exactly the sort of thing that is written once, is never
 * looked at again, and quietly rots: an og:image pointing at a file that was
 * renamed, a canonical left on the previous folder name, a scene added to the
 * catalog but not the sitemap. All of that is invisible in a browser and
 * expensive in a share preview, and all of it is a string comparison away from
 * being caught. Generalising this over every experience would be worth doing.
 *
 * THE FOLDER IS www/highwater AND THE CODE INSIDE IT STILL SAYS `ocean`. That
 * is deliberate rather than half-finished work: the folder was renamed on
 * 2026-08-21 and `OCEAN_CONFIG`, the `window.ocean*` QA hooks, and the sibling
 * suites' filenames were all left alone on purpose, so that a QA session in
 * progress kept working. Do not "fix" it piecemeal.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

const PAGE = new URL('../www/highwater/index.html', import.meta.url);
const ORIGIN = 'https://www.scenexp.com';
const BASE = `${ORIGIN}/highwater/`;

// ---------------------------------------------------------------------------
// The scene builds
// ---------------------------------------------------------------------------

describe('the whole sea builds without a browser', () => {
    beforeEach(() => {
        installThree();
        installCanvas();
        installBrowserGlobals();
    });
    afterEach(() => { uninstallAll(); });

    test('sky, sand, water and lightning all initialise in the page order', async () => {
        jest.resetModules();
        // The BUILT modules, because main.js resolves its imports to the
        // .min.js files and module state has to be shared with what is driven
        // here. This is why `npm run build` runs before `npm test`.
        const { OCEAN_CONFIG } = await import('../www/highwater/js/config.min.js');
        const sky = await import('../www/highwater/js/sky.min.js');
        const sand = await import('../www/highwater/js/sand.min.js');
        const water = await import('../www/highwater/js/water.min.js');
        const lightning = await import('../www/highwater/js/lightning.min.js');

        const scene = { children: [], add(o) { this.children.push(o); }, remove() {} };

        // EXACTLY THE ORDER main.js USES, and the order is load bearing: both
        // sheets compile the sky's own program into their shaders, so the sky
        // has to exist before either of them asks for its uniforms.
        sky.initSky(scene, null, OCEAN_CONFIG, { renderer: null });
        const handover = {
            uniformGlsl: sky.SKY_UNIFORM_GLSL,
            glsl: sky.SKY_GLSL,
            uniforms: sky.skyUniforms()
        };
        expect(handover.glsl).toContain('oceanSkyColor');
        expect(handover.uniforms.uFlash).toBeDefined();

        sand.initSand(scene, OCEAN_CONFIG, { mobile: false, sky: handover });
        water.initWater(scene, OCEAN_CONFIG, { mobile: false, sky: handover });
        lightning.initLightning(scene, null, OCEAN_CONFIG,
            { sky: handover, reducedMotion: false });

        // Every module put something in the scene and nothing threw.
        expect(scene.children.length).toBeGreaterThanOrEqual(4);

        // And the arc runs. Walked rather than spot checked, because a throw
        // thirty seconds in is exactly the failure this suite exists to catch
        // and a single tick would sail past it.
        for (let t = 0; t <= 90; t += 1.5) {
            expect(() => lightning.updateLightning(t, OCEAN_CONFIG)).not.toThrow();
        }

        lightning.disposeLightning();
    });

    test('the storm arc is self-consistent end to end', async () => {
        jest.resetModules();
        const { OCEAN_CONFIG } = await import('../www/highwater/js/config.min.js');
        const storm = await import('../www/highwater/js/storm.min.js');
        for (let t = 0; t <= OCEAN_CONFIG.storm.seconds; t++) {
            const s = storm.stormStateAt(t, OCEAN_CONFIG, 0);
            expect(Number.isFinite(s.swell)).toBe(true);
            expect(Number.isFinite(s.surge)).toBe(true);
            expect(Number.isFinite(s.gloom)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// The furniture
// ---------------------------------------------------------------------------

describe('the page carries the metadata a share and a crawler need', () => {
    let html;
    let main;
    beforeAll(async () => {
        html = await readFile(PAGE, 'utf8');
        main = await readFile(new URL('../www/highwater/js/main.js', import.meta.url), 'utf8');
    });

    /** The content of a meta tag, whichever attribute order it was written in. */
    const meta = (key) => {
        const m = html.match(
            new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"`, 'i')
        ) || html.match(
            new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="${key}"`, 'i')
        );
        return m ? m[1] : null;
    };

    test('the identity block is present and points at this folder', () => {
        expect(html).toContain(`<link rel="canonical" href="${BASE}">`);
        expect(meta('og:url')).toBe(BASE);
        expect(meta('og:title')).toBe('High Water');
        expect(meta('og:type')).toBe('website');
        expect(meta('og:site_name')).toBe('SceneXP');
        expect(meta('twitter:card')).toBe('summary_large_image');
        expect(meta('twitter:title')).toBe('High Water');
        expect(html).toMatch(/<title>High Water<\/title>/);
        expect(meta('author')).toBe('Steve Noll');
        expect(meta('description')).toBeTruthy();
    });

    test('EXACTLY ONE og:image, because Apple renders every one it finds', () => {
        // Two og:image tags put two identical cards in a friend's message
        // thread. earthdefense shipped that once and it is the reason this
        // assertion exists on the newest page rather than the oldest.
        const images = html.match(/<meta property="og:image"/g) || [];
        expect(images).toHaveLength(1);
    });

    test('the card is declared at the size every renderer expects', () => {
        expect(meta('og:image:width')).toBe('1200');
        expect(meta('og:image:height')).toBe('630');
        expect(meta('og:image:type')).toBe('image/webp');
    });

    test('every image reference on the site names the same file', () => {
        // THE ONE THAT WOULD ACTUALLY GO WRONG. The card lives in three places
        // (og:image, twitter:image, and the home page card's <img>), and a
        // cache-busting bump applied to two of the three is a silent
        // inconsistency nobody would see until a share looked stale.
        const image = meta('og:image');
        expect(image).toBe(`${BASE}assets/og-highwater.webp?v=1`);
        expect(meta('twitter:image')).toBe(image);
    });

    test('alt text is present on the card and matches between the two blocks', () => {
        // A share preview is often the only thing a screen reader user gets.
        const alt = meta('og:image:alt');
        expect(alt).toBeTruthy();
        expect(alt.length).toBeGreaterThan(60);
        expect(meta('twitter:image:alt')).toBe(alt);
    });

    test('the JSON-LD parses and agrees with the tags around it', () => {
        const block = html.match(
            /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
        );
        expect(block).not.toBeNull();
        const data = JSON.parse(block[1]);
        expect(data['@context']).toBe('https://schema.org');
        expect(data.url).toBe(BASE);
        expect(data.name).toBe(meta('og:title'));
        expect(data.inLanguage).toBe('en-US');
    });

    test('the security and accessibility furniture is all still here', () => {
        // These are house rules rather than preferences, so they are asserted
        // rather than trusted. The CSP in particular is the reason there is no
        // inline style or script anywhere in this experience.
        expect(html).toContain("default-src 'self'");
        expect(html).toContain("object-src 'none'");
        expect(html).not.toMatch(/<style[\s>]/);
        // A <script> with a src is the pattern; a <script> with a body is not.
        const inlineScript = html.match(/<script(?![^>]*(?:src=|type="application\/ld))[^>]*>/g);
        expect(inlineScript).toBeNull();
        expect(html).toContain('class="skip-link"');
        expect(html).toContain('id="home-btn"');
        expect(html).toContain('noscript-fallback');
        expect(html).toContain('data-ui-theme="surf"');
        expect(html).toContain('rel="icon"');
    });

    test('every floating control the page declares is one the script reveals', () => {
        // THE BUG THIS EXISTS FOR, AND IT SHIPPED. `.ui-float` is `display: none`
        // in the shared stylesheet and only `.ui-float.visible` is shown, which
        // is how the other experiences keep their chrome off the screen until
        // there is a world behind it. The home button was added to this page
        // with the correct markup and correct classes, and main.js never added
        // `visible`, so it was on the page and invisible. Nothing failed,
        // nothing warned, and it took somebody opening the scene to notice.
        //
        // A source-text check rather than a rendered one, which is weaker than
        // it looks on paper and is the right trade here: driving main.js needs a
        // canvas, a WebGL context and a full THREE, and the actual failure mode
        // is one missing line rather than anything subtle.
        expect(html).toContain('class="ui-float menu-btn"');
        expect(main).toMatch(/querySelectorAll\('\.ui-float'\)/);
        expect(main).toMatch(/classList\.add\('visible'\)/);
    });

    test('the moments worth counting are counted', () => {
        // Not an assertion that telemetry is correct, which this cannot see.
        // It is an assertion that the four events the site's own reporting
        // expects from this page are still being sent, because they are easy to
        // drop in a refactor and their absence looks exactly like a scene
        // nobody visited.
        //
        // MATCHED AS A CALL AND NOT AS A STRING. The first version of this
        // looked for the event name alone, which meant renaming `track` to
        // anything at all left it passing: the literal was still in the file,
        // just no longer being sent anywhere. Caught by deliberately breaking
        // it, which is the only way that class of weak assertion ever surfaces.
        for (const event of ['session-start', 'begin-watching', 'arc-complete', 'replay']) {
            expect(main).toMatch(new RegExp(`\\btrack\\(\\s*'${event}'`));
        }
        expect(main).toMatch(/\btrackFinal\(\s*'session-end'/);
        expect(main).toMatch(/import \{[^}]*\btrack\b[^}]*\} from '\.\.\/\.\.\/shared\/js\/telemetry-1\.0\.0\.min\.js'/);
    });

    test('the content warning is on the card and is not negotiable', () => {
        // Ninety seconds that set out to frighten somebody and end with the sea
        // closing over their head. That is a thing a visitor is owed in
        // advance, and the flashing is a thing a photosensitive visitor is owed
        // in advance. Neither line is furniture and neither comes out.
        const card = html.slice(html.indexOf('id="welcome"'), html.indexOf('id="wash"'));
        expect(card).toMatch(/meant to unsettle you/);
        expect(card).toMatch(/comes over you/);
        expect(card).toMatch(/lightning/);
        expect(card).toMatch(/flashes/);
        expect(card).toMatch(/without sound/);
    });
});

describe('the rest of the site knows the scene exists', () => {
    test('it is in the sitemap, llms.txt, the catalog and the directory page', async () => {
        const [sitemap, llms, directory, home] = await Promise.all([
            readFile(new URL('../www/sitemap.xml', import.meta.url), 'utf8'),
            readFile(new URL('../www/llms.txt', import.meta.url), 'utf8'),
            readFile(new URL('../www/js/directory.js', import.meta.url), 'utf8'),
            readFile(new URL('../www/index.html', import.meta.url), 'utf8')
        ]);
        expect(sitemap).toContain(`<loc>${BASE}</loc>`);
        expect(llms).toContain(BASE);
        expect(directory).toContain("slug: 'highwater'");
        expect(directory).toContain("url: 'highwater/'");
        // The catalog and the cards are paired by slug at runtime, so an entry
        // in one without the other is a card that never filters or a filter
        // that targets nothing.
        expect(home).toContain('data-slug="highwater"');
        expect(home).toContain('href="/highwater/"');
        expect(home).toContain(`"url": "${BASE}"`);
    });

    test('the ItemList positions run 1..n with no gap or repeat', async () => {
        // Adding a scene means renumbering every entry below it, which is
        // exactly the sort of hand edit that lands a second "position": 4.
        const home = await readFile(new URL('../www/index.html', import.meta.url), 'utf8');
        const positions = [...home.matchAll(/"position": (\d+),/g)].map((m) => Number(m[1]));
        expect(positions.length).toBeGreaterThan(0);
        expect([...positions].sort((a, b) => a - b))
            .toEqual(positions.map((_, i) => i + 1));
    });

    test('robots.txt lets crawlers in and names the sitemap', async () => {
        const robots = await readFile(new URL('../www/robots.txt', import.meta.url), 'utf8');
        expect(robots).toMatch(/^Allow: \/$/m);
        expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
        expect(robots).not.toMatch(/^Disallow: \/highwater/m);
    });
});
