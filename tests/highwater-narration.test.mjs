// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * High Water's story, told to a screen reader (config.narration, through
 * shared/js/narration-1.0.0.js), and focus after Begin.
 *
 * Added in the accessibility pass of 2026-09-23. Before it, a visitor who
 * cannot see the scene heard the welcome card, a minute of silence, and "The
 * sea has taken the beach". Each sentence is held to the moment it describes,
 * and the last to the moment the water actually closes over the camera,
 * worked out from the storm the way the page works it out.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.unstable_mockModule('../www/highwater/js/config.min.js', async () => (
    await import('../www/highwater/js/config.js')
));

let C;
let S;
let N;

beforeAll(async () => {
    ({ OCEAN_CONFIG: C } = await import('../www/highwater/js/config.js'));
    S = await import('../www/highwater/js/storm.js');
    N = await import('../www/shared/js/narration-1.0.0.js');
});

const beats = () => C.narration.beats;
const stage = (name) => C.storm.stages.find((s) => s.name === name).from;
const beat = (words) => beats().find((b) => b.text.includes(words)).at;

/** When the sea first closes over the camera: the surge at the camera plus
 *  the tsunami front, as main.js reads them, into the storm's white-out. */
function engulfedAt() {
    for (let t = 0; t <= C.storm.seconds; t += 0.05) {
        const surge = S.surgeAt(t, C.storm) + S.frontLevelAt(C.camera.z, S.frontAt(t, C.storm));
        if (S.stormStateAt(t, C, surge).engulf > 0.01) return t;
    }
    return null;
}

describe('THE BEATS', () => {
    test('are in order, far enough apart to be heard, and inside the story', () => {
        const list = beats();
        expect(list.length).toBeGreaterThanOrEqual(6);
        for (let i = 1; i < list.length; i++) expect(list[i].at - list[i - 1].at).toBeGreaterThanOrEqual(3.5);
        expect(list[0].at).toBeGreaterThan(0);
        const fade = C.storm.seconds - C.storm.fadeSeconds;
        expect(list[list.length - 1].at).toBeLessThan(fade);
    });

    test('each lands on the stage it describes', () => {
        expect(beat('swell starts to build')).toBeGreaterThanOrEqual(stage('turning'));
        expect(beat('storm is up')).toBeGreaterThanOrEqual(stage('storm'));
        expect(beat('sea stops')).toBeGreaterThanOrEqual(stage('lull'));
        expect(beat('pulls back')).toBeGreaterThanOrEqual(stage('drawback'));
        expect(beat('wall of water')).toBeGreaterThanOrEqual(stage('tsunami'));
        // And the lightning sentence comes once there is lightning.
        const firstStrike = C.storm.lightning.rate.find((k) => k.value > 0).at;
        expect(beat('Lightning')).toBeGreaterThanOrEqual(firstStrike);
        // Each in the stage it names, not the next one.
        expect(beat('sea stops')).toBeLessThan(stage('drawback'));
        expect(beat('pulls back')).toBeLessThan(stage('tsunami'));
    });

    test('THE LAST IS SAID AS THE SEA REACHES YOU, not before and not after', () => {
        const under = engulfedAt();
        expect(under).not.toBeNull();
        const last = beats()[beats().length - 1];
        expect(last.text).toMatch(/comes over you/);
        expect(last.at).toBeLessThanOrEqual(under);
        expect(under - last.at).toBeLessThan(4);
    });

    test('keep the house style: no semicolons, no em-dashes, and each is a sentence', () => {
        for (const { text } of beats()) {
            expect(text).not.toMatch(/[;—]/);
            expect(text).toMatch(/^[A-Z].*\.$/);
        }
    });

    test('played through, each is said once, in order', () => {
        const said = [];
        const region = { set textContent(v) { if (v) said.push(v); } };
        const narrator = N.createNarrator(region, C.narration);
        for (let t = 0; t <= C.storm.seconds; t += 1 / 60) narrator.update(t, { begun: true });
        expect(said).toEqual(beats().map((b) => b.text));
    });
});

describe('the page', () => {
    const main = readFileSync(join(process.cwd(), 'www/highwater/js/main.js'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'www/highwater/index.html'), 'utf8');

    test('has the live region, and the loop feeds it every frame', () => {
        expect(page).toContain('<p id="story-status" class="sr-only" role="status" aria-live="polite"></p>');
        expect(main).toMatch(/createNarrator\(document\.getElementById\('story-status'\), OCEAN_CONFIG\.narration\)/);
        // Handed the player's own { begun, scrubbing } for the frame, so it
        // stays quiet behind the card and under a drag.
        const frame = main.slice(main.indexOf('function drawFrame(delta, arc, info)'));
        expect(frame).toMatch(/^[\s\S]{0,400}narrator\.update\(arc, info\)/);
    });

    // A KEYBOARD BEGIN HANDS FOCUS ON, as Resume, Restart and Replay do. That
    // is the shared player's now, and highwater-begin.test.mjs presses the
    // real page's Begin both ways.
});
