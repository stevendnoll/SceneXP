// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * martian.js - The commander flying the lead raider, and the one line they say.
 *
 * THE FLEET NOW HAS SOMEBODY IN IT. The opening used to be nine hulls closing
 * up at Mars and then a long retreat to Earth, which says a fleet is coming and
 * says nothing about who is flying it. www/xo set the standard this answers: it
 * spends eleven silent seconds making the other team feel like an opponent, and
 * every play afterwards is better for it.
 *
 * THIS FILE OWNS A FACE AND A SENTENCE, AND NOTHING ELSE. It does not know
 * where the fleet is, where Mars is, or where the camera goes. intro.js mounts
 * `createMartianPod`'s group on ship zero and drives `updateMartian` off the
 * shot clock, so the commander rides the formation for free and this module
 * never has to be told anything twice. The dependency runs one way, intro to
 * martian, which is what lets the camera stay one module's job.
 *
 * THEY RIDE THE LEAD RAIDER RATHER THAN A SHIP OF THEIR OWN. The first draft
 * gave them a command ship standing off to one side of the approach line, and
 * Steve's screenshots killed it in one look: the commander was a speck at the
 * edge of frame, plainly not part of the squadron, while the formation sat
 * frozen in a scattered swarm behind them waiting for the monologue to end.
 * Riding the apex of the V fixes all of it at once. They are IN the formation,
 * the camera has an obvious thing to push in on, and the form-up plays at its
 * proper speed because nothing is being held back for them.
 *
 * WHICH IS WHY THE DOME IS OVERSIZED. A raider is 220 units long and the world
 * camera clips at 100 units (`space.worldCamera.near`), so there is a hard
 * floor on how close the shot can get, and at that floor a proportionate
 * cockpit is a few pixels. `canopyRadius` is therefore about half a hull
 * length, which is absurd as engineering and correct as drawing: it puts the
 * head at about a sixth of the frame height, and it marks the apex ship as the
 * flagship from the first frame of the form-up, so the push-in has a subject
 * the visitor has already been looking at. Every other figure on this site is
 * exaggerated for the same reason.
 *
 * THE INTERIOR SHELL IS NOT DECORATION. The first draft had glass and no back
 * to it, and the raider's own wing and nose drew straight through the canopy
 * and across the commander's head. `interior` is a sphere with `BackSide`, so
 * only its far half is drawn: the camera sees through the near glass, past the
 * commander, and onto a dark wall that hides the hull behind them. Removing it
 * puts a wing through somebody's skull.
 *
 * THE FACE IS A SILHOUETTE AND TWO EYES. At about a hundred and fifty pixels
 * there is no room for a nose, and the first draft proved what happens when the
 * parts are modelled anyway: a near-spherical head with a boxy hinged jaw read
 * as a bearded bust rather than a creature. What carries at this size is the
 * outline, a wide cranium tapering to a narrow chin, and the eyes. Everything
 * else is subordinate to those two.
 *
 * AND THE EYES ARE MATTE, WHICH IS THE OTHER THING THE SCREENSHOTS TAUGHT. They
 * were `roughness: 0.28` and the console light put a specular highlight on each
 * one, so the two features that were supposed to be the darkest things in the
 * frame rendered as two white dots. They are now fully rough and non-metallic,
 * and the console light is a light with no visible fitting rather than the
 * bright emissive bar that used to be the brightest object on screen.
 *
 * IT IS SILENT, and there is no fixing that. The opening plays before the
 * visitor has clicked anything, so there is no gesture and no audio context.
 * The line is a caption, the live region gets it once, and the briefing carries
 * it as a quote for everyone who skips or never sees it. Reading it as an
 * intercepted transmission is what makes the silence the point rather than an
 * apology, and it is why the mouth moves at all: a mouth working under text
 * that is plainly a transcript is the whole illusion.
 *
 * NOTHING HERE IS RANDOM. Every number is the config's or derived from it, so a
 * visitor who reloads sees the same commander say the same thing the same way.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

let cfg = null;          // config.martian
let group = null;        // the dome, and everybody in it
let mouth = null;        // the one moving part
let glow = null;         // the console light, or null
let built = null;        // what dispose has to release
let spoken = false;

const caption = { text: '', amount: 0, index: -1 };

// ---- Pure core --------------------------------------------------------------

/** Which caption is up, and how far in it is, for any moment of the shot.
 *
 *  AN INDEX AND AN AMOUNT rather than a string, so the DOM is written only when
 *  the index changes and the opacity every frame. Writing `textContent` sixty
 *  times a second is how a caption ends up re-announced on every frame.
 *
 *  Beats are read as a list rather than as a switch on elapsed time, so the
 *  copy and its timing stay in config where they can be retimed without
 *  touching this file. Overlapping beats are not supported and the first match
 *  wins: two captions in one frame is a pile-up, not a crossfade.
 *
 *  THE TIMES ARE THE SHOT'S OWN CLOCK, not this beat's. intro.js hands over its
 *  elapsed time, so `at` and `out` are measured from the first frame of the
 *  form-up rather than from the moment the camera arrives. That keeps the
 *  caption honest when the push-in is retimed: move `closeSeconds` and the
 *  words stay where they were, which is visible and fixable, instead of
 *  silently sliding along with it. */
export function beatAt(elapsed, beats, fade = 0.3, out = { text: '', amount: 0, index: -1 }) {
    out.text = '';
    out.amount = 0;
    out.index = -1;
    const list = beats || [];
    const f = Math.max(0.01, fade);
    for (let i = 0; i < list.length; i++) {
        const beat = list[i];
        const at = beat.at || 0;
        const off = beat.out === undefined ? at + 2 : beat.out;
        if (elapsed < at || elapsed >= off) continue;
        const inU = Math.min(1, (elapsed - at) / f);
        const outU = Math.min(1, (off - elapsed) / f);
        out.text = beat.text || '';
        out.amount = Math.max(0, Math.min(inU, outU));
        out.index = i;
        return out;
    }
    return out;
}

/** How far the mouth is open, 0 to 1.
 *
 *  ONLY WHILE THERE ARE WORDS ON SCREEN, which is the whole rule of a silent
 *  scene: the mouth works exactly when there is a caption and is shut
 *  otherwise. A mouth moving over an empty frame reads as a fault.
 *
 *  A RECTIFIED SINE, because speech is a mouth returning to closed and a plain
 *  sine spends half its time inverted. Scaled by the caption's own fade so the
 *  first and last syllable arrive and leave with the words rather than snapping
 *  on mid-vowel. */
export function mouthOpen(elapsed, beats, rate = 5.4, fade = 0.3) {
    const beat = beatAt(elapsed, beats, fade, { text: '', amount: 0, index: -1 });
    if (beat.index < 0) return 0;
    return Math.abs(Math.sin(elapsed * Math.PI * Math.max(0.1, rate))) * beat.amount;
}

// ---- Building ---------------------------------------------------------------

/** Build the dome and the commander inside it, and hand the group back.
 *
 *  RETURNED RATHER THAN ADDED TO A SCENE, because the caller parents it to a
 *  ship. Everything in here is positioned about the DOME'S CENTRE, so mounting
 *  it is one position and no arithmetic at the call site.
 *
 *  Returns null if it cannot build, which costs the opening its commander and
 *  nothing else: intro.js carries on with a plain lead raider. */
export function createMartianPod(config = EARTHDEFENSE_CONFIG) {
    disposeMartian();
    cfg = (config && config.martian) || null;
    if (!cfg) return null;
    if (typeof THREE === 'undefined' || !THREE.Group) return null;

    const pod = cfg.pod || {};
    built = { geometries: [], materials: [] };
    group = new THREE.Group();
    group.name = 'martian-pod';

    buildDome(pod);
    buildCommander(pod);
    return group;
}

/** The glass and what is behind it.
 *
 *  TWO SPHERES DOING OPPOSITE JOBS. The outer one is the glass: transparent,
 *  and `depthWrite: false` so it cannot hide its own occupant whichever way the
 *  sort lands. The inner one is the interior: opaque, and `BackSide` so only
 *  its FAR half is drawn. The camera therefore looks through the near glass,
 *  past the commander, and onto a dark wall that hides the raider's wing and
 *  nose. With the outer sphere alone, which is how this shipped first, the hull
 *  drew straight through the canopy and across the commander's head. */
function buildDome(pod) {
    const r = pod.canopyRadius || 60;

    const interior = new THREE.Mesh(
        geo(new THREE.SphereGeometry(r * 0.94, 20, 14)),
        mat(new THREE.MeshStandardMaterial({
            color: pod.interiorColor || 0x141d1a,
            roughness: 1,
            metalness: 0,
            side: THREE.BackSide
        })));
    interior.name = 'interior';
    group.add(interior);

    const glass = new THREE.Mesh(
        geo(new THREE.SphereGeometry(r, 20, 14)),
        mat(new THREE.MeshStandardMaterial({
            color: pod.canopyColor || 0x9fd8e4,
            roughness: 0.1,
            metalness: 0.15,
            transparent: true,
            opacity: pod.canopyOpacity === undefined ? 0.18 : pod.canopyOpacity,
            depthWrite: false
        })));
    glass.name = 'canopy';
    group.add(glass);
}

/** The commander.
 *
 *  A WIDE CRANIUM AND A NARROW CHIN, built as a sphere with a cone hung under
 *  it rather than as one shape, because a sphere cannot taper and the taper IS
 *  the silhouette. Everything else on this face is small enough that it could
 *  be left out without changing what the thing is, which is the test each part
 *  had to pass to be here at all. */
function buildCommander(pod) {
    const r = pod.headRadius || 24;

    const skin = mat(new THREE.MeshStandardMaterial({
        color: pod.skinColor || 0x9db08c,
        roughness: 0.95,
        metalness: 0
    }));

    const cranium = new THREE.Mesh(geo(new THREE.SphereGeometry(r, 18, 14)), skin);
    cranium.name = 'cranium';
    // Barely scaled. The taper below is what makes the head read, and squashing
    // the sphere as well only makes it look like a squashed sphere.
    cranium.scale.set(1, 1.04, 0.94);
    group.add(cranium);

    // THE CHIN, and the reason the head is two pieces. A cone with its apex
    // DOWN and its base buried inside the cranium, so the join never shows and
    // the outline runs wide at the brow and narrow at the jaw.
    const chin = new THREE.Mesh(
        geo(new THREE.ConeGeometry(r * 0.76, r * 1.45, 14)), skin);
    chin.name = 'chin';
    chin.rotation.x = Math.PI;
    chin.position.y = -r * 0.5;
    group.add(chin);

    // THE EYES ARE THE FACE. Big, set wide and high, tilted so the outer
    // corners lift, and ALMOND rather than round: a sphere scaled flat in two
    // axes costs one geometry and reads as an eye instead of a bead.
    //
    // MATTE, WHICH IS LOAD BEARING. At `roughness: 0.28` the console light put
    // a specular highlight on each one and the darkest features in the frame
    // rendered as two white dots. Fully rough and non-metallic, they stay black
    // under any light this scene can throw at them.
    const eyeMaterial = mat(new THREE.MeshStandardMaterial({
        color: pod.eyeColor || 0x05060a,
        roughness: 1,
        metalness: 0
    }));
    const eye = geo(new THREE.SphereGeometry(1, 14, 10));
    for (const sign of [-1, 1]) {
        const mesh = new THREE.Mesh(eye, eyeMaterial);
        mesh.name = sign < 0 ? 'eye-left' : 'eye-right';
        mesh.scale.set(r * 0.46, r * 0.26, r * 0.22);
        mesh.position.set(sign * r * 0.52, r * 0.12, r * 0.78);
        mesh.rotation.z = sign * (pod.eyeTilt === undefined ? 0.34 : pod.eyeTilt);
        group.add(mesh);
    }

    // A SLIT, NOT A JAW. The first draft hinged a box a third the width of the
    // head and it read as a beard. This is a dark line that opens, which is all
    // a mouth needs to be at this size, and `updateMartian` scales it.
    mouth = new THREE.Mesh(
        geo(new THREE.SphereGeometry(1, 10, 8)),
        mat(new THREE.MeshStandardMaterial({
            color: pod.mouthColor || 0x120d10, roughness: 1, metalness: 0
        })));
    mouth.name = 'mouth';
    mouth.position.set(0, -r * 0.72, r * 0.62);
    mouth.scale.set(r * 0.3, r * 0.04, r * 0.12);
    group.add(mouth);

    const suit = mat(new THREE.MeshStandardMaterial({
        color: pod.suitColor || 0x2f3a33, roughness: 0.92, metalness: 0.05
    }));
    const neck = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(r * 0.24, r * 0.3, r * 0.75, 10)), suit);
    neck.name = 'neck';
    neck.position.y = -r * 1.45;
    group.add(neck);

    // NARROW, AND LOW ENOUGH TO BE HALF OUT OF SHOT. Wide shoulders under a
    // tapered head make a linebacker. These are here to stop the head floating
    // and for no other reason.
    const shoulders = new THREE.Mesh(
        geo(new THREE.BoxGeometry(r * 2.1, r * 0.55, r * 0.8)), suit);
    shoulders.name = 'shoulders';
    shoulders.position.y = -r * 1.95;
    group.add(shoulders);

    // THE CONSOLE IS A LIGHT WITH NO FITTING, and that is deliberate. It used
    // to have a bright emissive bar to be the source, which promptly became the
    // brightest object in the frame and read as a fluorescent tube across the
    // bottom of the cockpit. A glow from below the frame needs no visible
    // source: the visitor is looking into a lit cockpit and supplies the rest.
    //
    // Lighting from BELOW is the point. A face lit from below is being told
    // something. A face lit from the front is being photographed.
    if (THREE.PointLight) {
        glow = new THREE.PointLight(
            pod.glowColor || 0x74e0c2,
            pod.glowIntensity === undefined ? 3.2 : pod.glowIntensity,
            // Kept local, so nothing else in a 200,000 unit scene is relit by a
            // prop inside one raider's canopy.
            pod.glowDistance === undefined ? 420 : pod.glowDistance);
        glow.name = 'console-glow';
        glow.position.set(0, -r * 1.6, r * 1.1);
        group.add(glow);
    }
}

// ---- One frame --------------------------------------------------------------

/** Drive the mouth and pick the caption, off the SHOT's clock.
 *
 *  Takes the elapsed time rather than a delta, because intro.js owns the clock
 *  and a second copy of it here is a second thing to get out of step. It also
 *  means a stall, a long frame and a skip all land the mouth in the right place
 *  rather than somewhere that depends on how the shot got there. */
export function updateMartian(elapsed, config = EARTHDEFENSE_CONFIG) {
    const spec = cfg || (config && config.martian);
    if (!spec) return caption;
    beatAt(elapsed, spec.beats, spec.beatFade, caption);
    if (mouth) {
        const pod = spec.pod || {};
        const r = pod.headRadius || 24;
        const open = mouthOpen(elapsed, spec.beats, pod.mouthRate, spec.beatFade);
        // From a line to an oval. The closed height is not zero, because a
        // mouth that vanishes between syllables reads as a flicker.
        mouth.scale.set(r * 0.3, r * (0.04 + 0.2 * open), r * 0.12);
    }
    return caption;
}

/** Put the commander back to the start: mouth shut, nothing said, no caption.
 *  Called when the shot starts, so a second boot does not open on a half-open
 *  mouth or skip the announcement. */
export function resetMartian() {
    spoken = false;
    caption.text = '';
    caption.amount = 0;
    caption.index = -1;
    if (mouth && cfg) {
        const r = (cfg.pod && cfg.pod.headRadius) || 24;
        mouth.scale.set(r * 0.3, r * 0.04, r * 0.12);
    }
    return true;
}

// ---- What the caller reads --------------------------------------------------

/** The caption this frame wants: its text, and how far faded in it is. Reused,
 *  so read it rather than hold it. */
export function martianCaption() { return caption; }

/** Whether the live region still owes the visitor the line, and a note that it
 *  has been paid. Asked once per shot rather than per frame, because a live
 *  region written every frame is a screen reader talking over itself. */
export function takeMartianAnnouncement() {
    if (!cfg || spoken) return '';
    spoken = true;
    return cfg.spoken || '';
}

/** Fewer parts, in the same "built full, partly used" spirit as the starfield,
 *  the flare pool and the squadron.
 *
 *  IT DROPS THE LIGHT AND KEEPS THE COMMANDER. Reduced EFFECTS means thinner
 *  rather than absent everywhere else in this experience, and the commander is
 *  the story rather than an effect. Without the console light the face is still
 *  lit by the scene's ambient and key light, just less dramatically. */
export function setMartianReduced(on) {
    if (glow) glow.visible = !on;
    return !!on;
}

export function disposeMartian() {
    // EVERYTHING HERE IS OURS. The pod shares nothing with the fleet, unlike
    // the squadron's hulls, so every geometry and material it made is released.
    // Taking it out of its parent is the caller's job, because the caller is
    // what put it there.
    if (built) {
        for (const g of built.geometries) if (g && g.dispose) g.dispose();
        for (const m of built.materials) if (m && m.dispose) m.dispose();
    }
    built = null;
    group = null;
    mouth = null;
    glow = null;
    cfg = null;
    spoken = false;
    caption.text = '';
    caption.amount = 0;
    caption.index = -1;
}

// ---- Small helpers ----------------------------------------------------------

/** Remember a geometry, or a material, so `disposeMartian` can release it.
 *
 *  TWO FUNCTIONS RATHER THAN ONE THAT SNIFFS. The obvious version asks the
 *  object what it is, and under a chainable THREE stub every object answers yes
 *  to every question: one list would swallow the lot and the other would never
 *  be disposed, in a test reporting that everything was fine. The call site
 *  knows which it made, so it says. */
function geo(geometry) {
    if (built) built.geometries.push(geometry);
    return geometry;
}

function mat(material) {
    if (built) built.materials.push(material);
    return material;
}

export const __test__ = {
    caption,
    group: () => group,
    mouth: () => mouth,
    glow: () => glow
};
