// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Martian commander (www/earthdefense/js/martian.js).
 *
 * THIS MODULE OWNS A FACE AND A SENTENCE, so that is what this file measures.
 * The camera is intro.js's and is tested there, including the two numbers that
 * decide whether any of this is visible at all: `closeRange` against the near
 * plane, and `closeRange` against the head's share of the frame. What is left
 * here is the geometry, the timing of the words, and the mouth.
 *
 * THE FACE IS THE POINT AND IT FAILED ONCE, which is why the geometry has as
 * many assertions as the arithmetic. Steve's screenshots of the first version
 * were unambiguous: it did not look like an alien. The specific faults are all
 * pinned below, because each was invisible to every test that existed and
 * obvious in one screenshot:
 *
 *   1. THE EYES RENDERED WHITE. They were `roughness: 0.28`, so the console
 *      light put a specular highlight on each one and the two darkest features
 *      in the frame came out as two bright dots.
 *   2. THE HULL DREW THROUGH THE GLASS. The canopy was transparent with no
 *      opaque backing, so the raider's own wing and nose crossed the
 *      commander's head.
 *   3. THE HEAD WAS A BALL WITH A BEARD. A near-spherical cranium with a boxy
 *      hinged jaw a third its width, which is what a face becomes when the
 *      parts are modelled instead of the silhouette.
 *   4. THE CONSOLE WAS THE BRIGHTEST THING IN SHOT. An emissive bar meant to
 *      be the light's source read as a fluorescent tube.
 *
 * NOTHING HERE ALLOWS FOR RANDOMNESS, because there is none. Every number is
 * the config's or derived from it, so a visitor who reloads sees the same
 * commander say the same thing the same way.
 */
import { jest } from '@jest/globals';

// Just enough THREE to build the pod, and RECORDING rather than pretending:
// what matters is where the parts land, what they are made of, and what the
// mouth is doing.
class FakeGeometry {
    constructor(...args) { this.args = args; this.disposed = false; this.rotated = 0; }
    rotateX(a) { this.rotated = a; return this; }
    dispose() { this.disposed = true; }
}
class FakeMaterial {
    constructor(opts) { Object.assign(this, opts || {}); this.disposed = false; }
    dispose() { this.disposed = true; }
}
class FakeObject {
    constructor() {
        this.children = [];
        this.name = '';
        this.visible = true;
        this.position = {
            x: 0, y: 0, z: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = {
            x: 1, y: 1, z: 1,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        };
    }
    add(child) { this.children.push(child); return this; }
}
class FakeMesh extends FakeObject {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class FakeLight extends FakeObject {
    constructor(color, intensity, distance) {
        super();
        this.color = color; this.intensity = intensity; this.distance = distance;
    }
}

function installThree() {
    globalThis.THREE = {
        Group: FakeObject,
        Mesh: FakeMesh,
        PointLight: FakeLight,
        ConeGeometry: FakeGeometry,
        BoxGeometry: FakeGeometry,
        SphereGeometry: FakeGeometry,
        CylinderGeometry: FakeGeometry,
        MeshStandardMaterial: FakeMaterial,
        FrontSide: 0,
        BackSide: 1,
        DoubleSide: 2
    };
}

let martian;
let CONFIG;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    martian = await import('../www/earthdefense/js/martian.js');
    martian.createMartianPod(CONFIG);
});

afterEach(() => {
    if (martian) martian.disposeMartian();
    delete globalThis.THREE;
});

const SPEC = () => CONFIG.martian;
const POD = () => CONFIG.martian.pod;
const part = (name) => martian.__test__.group().children.find((c) => c.name === name);

// ---- The face ---------------------------------------------------------------

describe('the commander has a face', () => {
    test('it is built from a silhouette and two eyes', () => {
        for (const name of ['cranium', 'chin', 'eye-left', 'eye-right', 'mouth', 'neck', 'shoulders']) {
            expect(part(name)).toBeTruthy();
        }
    });

    /** THE TAPER IS THE SILHOUETTE. A sphere cannot taper, so the head is a
     *  cranium with a cone hung under it: wide at the brow, narrow at the jaw.
     *  The first version was a barely-scaled sphere and read as a ball. */
    test('the head is wide at the brow and narrow at the chin', () => {
        const cranium = part('cranium');
        const chin = part('chin');
        const r = POD().headRadius;

        // The cone's apex points DOWN, which is what makes the taper a taper
        // rather than a hat.
        expect(chin.rotation.x).toBeCloseTo(Math.PI, 6);
        // Narrower than the cranium it hangs under...
        expect(chin.geometry.args[0]).toBeLessThan(r);
        // ...and hung below it, with its base buried inside so the join cannot
        // show.
        expect(chin.position.y).toBeLessThan(0);
        expect(chin.position.y + chin.geometry.args[1] / 2).toBeGreaterThan(-r);
        // And the cranium is not itself squashed into a disguise for the taper.
        expect(cranium.scale.y).toBeGreaterThan(0.9);
        expect(cranium.scale.y).toBeLessThan(1.2);
    });

    /** THE EYES RENDERED AS TWO WHITE DOTS, which is the single worst defect in
     *  the first version and the least obvious in code. A glossy black sphere
     *  under a point light is a mirror. */
    test('the eyes are matte, so no light can put a highlight on them', () => {
        for (const name of ['eye-left', 'eye-right']) {
            const eye = part(name);
            expect(eye.material.roughness).toBe(1);
            expect(eye.material.metalness).toBe(0);
            // And genuinely dark rather than merely dark-ish.
            expect(eye.material.color).toBeLessThan(0x202020);
        }
    });

    test('they are big, almond, set wide and tilted', () => {
        const left = part('eye-left');
        const right = part('eye-right');
        const r = POD().headRadius;

        // BIG. A quarter of the head's width each, which is what carries at a
        // hundred and fifty pixels.
        expect(left.scale.x).toBeGreaterThan(r * 0.3);
        // ALMOND, not round: flatter than it is long.
        expect(left.scale.y).toBeLessThan(left.scale.x * 0.7);
        // SET WIDE, and symmetrically.
        expect(Math.sign(left.position.x)).toBe(-Math.sign(right.position.x));
        expect(Math.abs(left.position.x)).toBeCloseTo(Math.abs(right.position.x), 6);
        expect(Math.abs(left.position.x)).toBeGreaterThan(r * 0.35);
        // ABOVE the mouth, which is the other half of the silhouette.
        expect(left.position.y).toBeGreaterThan(part('mouth').position.y);
        // AND TILTED, outer corners up, mirrored. The difference between a
        // wary face and a hostile one.
        expect(Math.sign(left.rotation.z)).toBe(-Math.sign(right.rotation.z));
        expect(Math.abs(left.rotation.z)).toBeCloseTo(POD().eyeTilt, 6);
    });

    test('the eyes and the mouth sit on the FRONT of the head', () => {
        // Behind the head's midpoint they would be on the back of the skull,
        // which is a thing that has happened to somebody before.
        for (const name of ['eye-left', 'eye-right', 'mouth']) {
            expect(part(name).position.z).toBeGreaterThan(0);
        }
    });

    /** A SLIT, NOT A JAW. The first version hinged a box a third the width of
     *  the head and it read as a beard. */
    test('the mouth is a thin line rather than a jaw', () => {
        const mouth = part('mouth');
        expect(mouth.scale.y).toBeLessThan(mouth.scale.x * 0.25);
        expect(mouth.scale.x).toBeLessThan(POD().headRadius * 0.5);
    });

    /** Wide shoulders under a tapered head make a linebacker, and the first
     *  version's box was the biggest thing in the cockpit. */
    test('the shoulders are narrow and low enough to be half out of shot', () => {
        const shoulders = part('shoulders');
        const r = POD().headRadius;
        expect(shoulders.geometry.args[0]).toBeLessThan(r * 2.6);
        expect(shoulders.position.y).toBeLessThan(-r);
    });
});

// ---- The cockpit ------------------------------------------------------------

describe('the dome', () => {
    /** THE HULL DREW THROUGH THE GLASS in the first version: the canopy was
     *  transparent with nothing behind it, so the raider's own wing and nose
     *  crossed the commander's head. The interior is an opaque sphere with
     *  `BackSide`, so only its FAR half is drawn: the camera sees through the
     *  near glass, past the commander, and onto a dark wall. */
    test('has an opaque interior behind the commander', () => {
        const interior = part('interior');
        expect(interior).toBeTruthy();
        expect(interior.material.side).toBe(THREE.BackSide);
        expect(interior.material.transparent).toBeFalsy();
        // Inside the glass, or it would be the glass.
        expect(interior.geometry.args[0]).toBeLessThan(POD().canopyRadius);
    });

    test('the glass writes no depth, so it cannot hide its own occupant', () => {
        const glass = part('canopy');
        expect(glass.material.depthWrite).toBe(false);
        expect(glass.material.transparent).toBe(true);
        expect(glass.material.opacity).toBeLessThan(0.4);
    });

    test('every part of the commander is inside the dome', () => {
        // A head poking through the canopy is worse than no canopy.
        const r = POD().canopyRadius;
        for (const name of ['cranium', 'eye-left', 'mouth', 'neck', 'shoulders']) {
            const node = part(name);
            expect(Math.hypot(node.position.x, node.position.y, node.position.z))
                .toBeLessThan(r);
        }
    });

    /** THE CONSOLE WAS THE BRIGHTEST THING IN SHOT. It had an emissive bar to
     *  be the light's visible source, which promptly read as a fluorescent tube
     *  across the cockpit. There is now a light and no fitting. */
    test('the console is a light with no visible source', () => {
        const glow = martian.__test__.glow();
        expect(glow).toBeTruthy();
        // Nothing emissive anywhere in the pod.
        for (const node of martian.__test__.group().children) {
            if (node.material) expect(node.material.emissive).toBeUndefined();
        }
    });

    test('and it lights the face from BELOW', () => {
        // A face lit from below is being told something. A face lit from the
        // front is being photographed.
        const glow = martian.__test__.glow();
        expect(glow.position.y).toBeLessThan(part('cranium').position.y);
        expect(glow.position.z).toBeGreaterThan(0);
    });

    test('the light is kept local to one raider canopy', () => {
        const glow = martian.__test__.glow();
        expect(glow.distance).toBe(POD().glowDistance);
        // Nothing else in a 200,000 unit scene should be relit by a prop.
        expect(glow.distance).toBeLessThan(CONFIG.intro.range);
    });

    test('reduced effects drops the light and keeps the commander', () => {
        // The story is not an effect. Thinner, not absent, the same as the
        // squadron and the finale's flares.
        const glow = martian.__test__.glow();
        martian.setMartianReduced(true);
        expect(glow.visible).toBe(false);
        expect(part('cranium')).toBeTruthy();
        martian.setMartianReduced(false);
        expect(glow.visible).toBe(true);
    });
});

// ---- What they say ----------------------------------------------------------

describe('the line', () => {
    test('is the one Steve asked for, and only that', () => {
        const beats = SPEC().beats;
        expect(beats).toHaveLength(1);
        expect(beats[0].text).toBe('Earth will be ours.');
    });

    test('comes up, holds and goes', () => {
        const spec = SPEC();
        const beat = spec.beats[0];
        const mid = (beat.at + beat.out) / 2;

        expect(martian.beatAt(beat.at - 0.01, spec.beats, spec.beatFade).index).toBe(-1);
        expect(martian.beatAt(mid, spec.beats, spec.beatFade).text).toBe(beat.text);
        expect(martian.beatAt(mid, spec.beats, spec.beatFade).amount).toBeCloseTo(1, 6);
        expect(martian.beatAt(beat.out + 0.01, spec.beats, spec.beatFade).index).toBe(-1);
    });

    test('arrives and leaves at nothing, so neither end is a flicker', () => {
        const spec = SPEC();
        const beat = spec.beats[0];
        expect(martian.beatAt(beat.at, spec.beats, spec.beatFade).amount).toBeCloseTo(0, 6);
        expect(martian.beatAt(beat.at + spec.beatFade / 2, spec.beats, spec.beatFade).amount)
            .toBeCloseTo(0.5, 6);
        expect(martian.beatAt(beat.out, spec.beats, spec.beatFade).index).toBe(-1);
    });

    test('never two captions at once', () => {
        // A pile-up rather than a crossfade, and the copy is written on the
        // assumption it cannot happen.
        const spec = SPEC();
        for (let t = 0; t <= CONFIG.intro.seconds; t += 0.01) {
            const showing = spec.beats.filter((b) => t >= b.at && t < b.out);
            expect(showing.length).toBeLessThan(2);
        }
    });

    test('keeps the house style', () => {
        // No em-dashes and no semicolons in anything a visitor reads, which is
        // a standing rule for every string on this site.
        const spec = SPEC();
        for (const beat of spec.beats) expect(beat.text).not.toMatch(/[—;]/);
        expect(spec.spoken).not.toMatch(/[—;]/);
    });

    test('the spoken line carries the words and the framing', () => {
        // The caption's "Intercepted transmission" label is aria-hidden, so the
        // live region is the only place a screen reader learns who is talking.
        const spec = SPEC();
        expect(spec.spoken.toLowerCase()).toContain('earth will be ours');
        expect(spec.spoken.toLowerCase()).toContain('transmission');
        expect(spec.spoken.toLowerCase()).toContain('martian');
    });

    test('the live region is handed the line exactly once', () => {
        expect(martian.takeMartianAnnouncement()).toBe(SPEC().spoken);
        expect(martian.takeMartianAnnouncement()).toBe('');
    });

    test('a reset arms the announcement again', () => {
        // A second boot should not open on a commander who has already spoken.
        martian.takeMartianAnnouncement();
        martian.resetMartian();
        expect(martian.takeMartianAnnouncement()).toBe(SPEC().spoken);
    });

    test('says nothing at all without a config', () => {
        martian.disposeMartian();
        expect(martian.takeMartianAnnouncement()).toBe('');
    });

    test('the caption is cleared by a reset', () => {
        const spec = SPEC();
        const beat = spec.beats[0];
        martian.updateMartian((beat.at + beat.out) / 2);
        expect(martian.martianCaption().text).toBe(beat.text);
        martian.resetMartian();
        expect(martian.martianCaption().text).toBe('');
        expect(martian.martianCaption().amount).toBe(0);
    });
});

// ---- The mouth --------------------------------------------------------------

describe('the mouth', () => {
    test('is shut whenever there are no words on screen', () => {
        // THE WHOLE RULE OF A SILENT SCENE. A mouth working over an empty frame
        // reads as a fault rather than as speech.
        const spec = SPEC();
        for (let t = 0; t <= CONFIG.intro.seconds; t += 0.005) {
            const speaking = spec.beats.some((b) => t >= b.at && t < b.out);
            if (!speaking) {
                expect(martian.mouthOpen(t, spec.beats, POD().mouthRate, spec.beatFade)).toBe(0);
            }
        }
    });

    test('moves while the caption is up', () => {
        const spec = SPEC();
        const beat = spec.beats[0];
        let most = 0;
        for (let t = beat.at; t < beat.out; t += 0.005) {
            most = Math.max(most, martian.mouthOpen(t, spec.beats, POD().mouthRate, spec.beatFade));
        }
        expect(most).toBeGreaterThan(0.85);
    });

    test('returns to shut within the beat, because speech does', () => {
        // A rectified sine rather than a sine: a mouth that never closes is a
        // held vowel, and this is meant to read as talking.
        const spec = SPEC();
        const beat = spec.beats[0];
        let least = Infinity;
        for (let t = beat.at + spec.beatFade; t < beat.out - spec.beatFade; t += 0.002) {
            least = Math.min(least, martian.mouthOpen(t, spec.beats, POD().mouthRate, spec.beatFade));
        }
        expect(least).toBeLessThan(0.05);
    });

    /** IT SCALES RATHER THAN HINGES, and it never closes to nothing: a mouth
     *  that vanishes between syllables reads as a flicker. */
    test('opens the slit without ever losing it', () => {
        const spec = SPEC();
        const mouth = martian.__test__.mouth();
        const shut = mouth.scale.y;
        expect(shut).toBeGreaterThan(0);

        let most = 0;
        for (let i = 0; i <= 600; i++) {
            martian.updateMartian((i / 600) * CONFIG.intro.seconds);
            expect(mouth.scale.y).toBeGreaterThanOrEqual(shut - 1e-9);
            most = Math.max(most, mouth.scale.y);
        }
        // It plainly opens, and stays a slit rather than becoming a hole.
        expect(most).toBeGreaterThan(shut * 3);
        expect(most).toBeLessThan(mouth.scale.x);
    });

    test('is shut again after a reset', () => {
        const spec = SPEC();
        const mouth = martian.__test__.mouth();
        const shut = mouth.scale.y;
        martian.updateMartian((spec.beats[0].at + spec.beats[0].out) / 2);
        expect(mouth.scale.y).toBeGreaterThan(shut);
        martian.resetMartian();
        expect(mouth.scale.y).toBeCloseTo(shut, 9);
    });
});

// ---- Building and tearing down ----------------------------------------------

describe('building the pod', () => {
    test('hands back a group rather than adding it to a scene', () => {
        // The caller parents it to a ship, which is what makes the commander
        // ride the formation for free.
        martian.disposeMartian();
        const pod = martian.createMartianPod(CONFIG);
        expect(pod).toBe(martian.__test__.group());
        expect(pod.name).toBe('martian-pod');
    });

    test('everything is positioned about the dome centre', () => {
        // So mounting it is one position and no arithmetic at the call site.
        const r = POD().canopyRadius;
        for (const node of martian.__test__.group().children) {
            expect(Math.abs(node.position.x)).toBeLessThan(r);
            expect(Math.abs(node.position.z)).toBeLessThan(r);
        }
    });

    test('dispose releases every buffer it made', () => {
        // EVERYTHING HERE IS OURS, unlike the squadron's hulls, which borrow
        // the fleet's geometry and must not be freed from this side.
        const geometries = martian.__test__.group().children
            .filter((c) => c.geometry).map((c) => c.geometry);
        expect(geometries.length).toBeGreaterThan(5);

        martian.disposeMartian();
        expect(geometries.every((g) => g.disposed)).toBe(true);
        expect(martian.__test__.group()).toBe(null);
    });

    test('dispose twice is not an error', () => {
        martian.disposeMartian();
        expect(() => martian.disposeMartian()).not.toThrow();
    });

    test('a second build does not leak the first', () => {
        const first = martian.__test__.group();
        const geometries = first.children.filter((c) => c.geometry).map((c) => c.geometry);
        martian.createMartianPod(CONFIG);
        expect(geometries.every((g) => g.disposed)).toBe(true);
        expect(martian.__test__.group()).not.toBe(first);
    });

    test('cannot be built without its config', () => {
        martian.disposeMartian();
        expect(martian.createMartianPod({ intro: CONFIG.intro })).toBe(null);
    });

    test('cannot be built with no THREE at all', () => {
        martian.disposeMartian();
        const kept = globalThis.THREE;
        delete globalThis.THREE;
        expect(martian.createMartianPod(CONFIG)).toBe(null);
        globalThis.THREE = kept;
    });

    test('a build without a point light still works', () => {
        // A missing light should cost the console glow rather than the face.
        martian.disposeMartian();
        const kept = THREE.PointLight;
        delete THREE.PointLight;
        expect(martian.createMartianPod(CONFIG)).toBeTruthy();
        expect(martian.__test__.glow()).toBe(null);
        expect(() => martian.setMartianReduced(true)).not.toThrow();
        expect(() => martian.updateMartian(5)).not.toThrow();
        THREE.PointLight = kept;
    });

    /** EVERY `|| default` IN THE FILE, IN ONE GO. A fallback nothing runs is a
     *  fallback nobody has checked, and the real config fills in every field,
     *  so the only way to walk them is to hand the module one that does not. */
    test('a config with nothing in it still builds and still solves', () => {
        martian.disposeMartian();
        const bare = { martian: { pod: {} } };
        expect(martian.createMartianPod(bare)).toBeTruthy();
        for (const name of ['cranium', 'chin', 'eye-left', 'mouth', 'shoulders', 'interior', 'canopy']) {
            expect(part(name)).toBeTruthy();
        }
        expect(() => martian.updateMartian(3, bare)).not.toThrow();
        const mouth = martian.__test__.mouth();
        for (const v of [mouth.scale.x, mouth.scale.y, mouth.scale.z]) {
            expect(Number.isFinite(v)).toBe(true);
        }
    });

    test('no beats at all is a silent commander rather than a broken one', () => {
        expect(martian.beatAt(1, undefined).index).toBe(-1);
        expect(martian.beatAt(1, []).index).toBe(-1);
        expect(martian.mouthOpen(1, [])).toBe(0);
        // A beat with no `out` gets a default length rather than lasting for
        // ever, which would leave a caption over the departure.
        expect(martian.beatAt(1, [{ at: 0, text: 'hi' }], 0.1).text).toBe('hi');
        expect(martian.beatAt(99, [{ at: 0, text: 'hi' }], 0.1).index).toBe(-1);
    });

    test('updating with no pod built is not an error', () => {
        martian.disposeMartian();
        expect(() => martian.updateMartian(3)).not.toThrow();
        expect(() => martian.resetMartian()).not.toThrow();
        expect(() => martian.setMartianReduced(true)).not.toThrow();
    });
});
