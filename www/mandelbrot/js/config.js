// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Mandelbrot experience configuration
 *
 * One plain object holding every per-experience knob this experience's
 * modules accept. main.js imports this and passes slices into the init
 * functions: initScene(canvas, MANDELBROT_CONFIG), initStore(), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The ninth SceneXP micro-environment, and the first one set in space.
 * It honors Benoit Mandelbrot and the shape that carries his name: the
 * visitor floats in a softly lit starfield, galaxies and nebulae glowing
 * in the distance, while the Mandelbrot set hangs in the middle of the
 * view. The set's interior is pure black, and its infinitely detailed
 * boundary burns neon orange.
 *
 * Like gavin and jamar this is a passive "living diorama": no walking,
 * no collision. The camera holds one composed viewpoint and the shared
 * pan part (pan-1.0.0.js) supplies the same pan, tilt, and zoom controls
 * those experiences use, running at every aspect the way jamar does,
 * because leaning closer to the edge is the whole point here.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const MANDELBROT_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'cosmos',

    // The fixed viewpoint: floating in open space, eye to eye with the
    // center of the fractal plane. The camera is set here at init (and
    // re-derived on resize) and never moves during play; lookAt is the
    // point it faces (the center of the Mandelbrot plane at LAYOUT.fractal
    // in store.js).
    //
    // The scene is composed for a landscape frame, and three.js FOV is
    // vertical, so a portrait phone would slice off both sides of the
    // set. When the aspect ratio drops below 1, main.js widens the FOV
    // to portrait.fov and dollies the camera straight back until
    // minHalfWidth meters to either side of center still fit in frame at
    // the plane's distance (focusZ). Landscape frames always use the
    // composed position as-is.
    camera: {
        position: { x: 0, y: 1.3, z: 0.6 },
        lookAt: { x: 0, y: 1.3, z: -3.0 },
        fov: 60,
        portrait: {
            fov: 70,
            minHalfWidth: 1.9,
            focusZ: -3.0,
            // (Only framing knobs here: this experience retired the
            // shared pan/zoom row in favor of the autozoom cluster
            // below, so the view holds its composed aim and placeCamera
            // owns the portrait reframe.)
        }
    },

    // The autozoom control (main.js builds the row): the dive flies
    // itself toward fractal.dive. speeds are the selectable rates in
    // doublings of magnification per second, cycled by the speed
    // button; defaultIndex picks the starting rate. Direction starts
    // inward, play starts paused: the visitor presses play to fall.
    autozoom: {
        speeds: [0.5, 1, 2],
        defaultIndex: 1
    },

    // No day/night cycle in deep space: the store replaces the shared sky
    // (dome, sun, moon, clouds) with its own starfield, and main.js never
    // calls updateDayNightCycle, so the lighting the store composes holds.
    dayNight: { enabled: false },

    // The Mandelbrot set and the infinite dive (store.js). center/span
    // frame the classic full view of the set in the complex plane;
    // level 0 renders synchronously at init and every deeper level
    // comes from the js/fractal-worker.js pool. Iterations and texture
    // size step down on touch devices to keep every frame quick on
    // phones, and the iteration budget climbs per level because deeper
    // boundary needs more iterations to resolve.
    //
    // targets are the fixed points the zoom can fall toward, shown as
    // glowing touchpoints on the resting monument; targets[0] (Seahorse
    // Valley, the seam where the set's two great circles pinch
    // together) is the default. Every entry is an EXACTLY-KNOWN
    // boundary point, almost all Misiurewicz points, where the set is
    // provably self-similar so the detail repeats beneath the dive
    // forever. The digits matter: each value is either exact (the tip,
    // the dendrite, the fork) or refined by Newton's method to full
    // double precision, because a coordinate truncated at 8 decimals
    // drifts off the boundary near depth 24 and lands the zoom in
    // featureless black. Every candidate was health-checked frame by
    // frame past the precision floor; add new ones only the same way.
    //
    // relief turns each rendered frame into displaced terrain: height
    // is the world-space rise (meters) of the brightest boundary ridge
    // at the composed distance, and grid the displacement mesh
    // resolution. rollDegPerDoubling corkscrews the whole tunnel gently
    // as the dive deepens (every level rolls together, so their tiling
    // is unaffected).
    //
    // floorDoublings is the honest bottom: past about 2^38.5 (four
    // hundred billion to one), adjacent pixels of a double-precision
    // grid collapse into the same number and the picture would turn to
    // blocks, so the dive glides to a stop just above that and main.js
    // tells the visitor why.
    fractal: {
        center: { re: -0.7, im: 0 },
        span: 2.8,
        targets: [
            { label: 'Seahorse Valley', re: -0.7756837680090538, im: 0.13646736829469008 },
            { label: 'Elephant Valley', re: 0.3514237590525219, im: 0.0638665598132929 },
            { label: 'The North Dendrite', re: 0, im: 1 },
            { label: 'The Western Fork', re: -1.5436890126920764, im: 0 },
            { label: 'Seahorse Valley South', re: -0.7756837680090538, im: -0.13646736829469008 },
            { label: 'Elephant Valley South', re: 0.3514237590525219, im: -0.0638665598132929 },
            { label: 'The Scepter Valley', re: -1.2941017670715493, im: 0.08085905686745486 },
            { label: 'The Northern Valley', re: -0.23971619022313434, im: 0.8455033137002887 },
            { label: 'The South Dendrite', re: 0, im: -1 },
            { label: 'The Eastern Shoulder', re: 0.279291372505202, im: 0.6053860423165295 },
            { label: 'The Southern Valley', re: -0.23971619022313434, im: -0.8455033137002887 }
        ],
        maxIter: 140,
        maxIterMobile: 110,
        iterPerLevel: 24,
        iterPerLevelMobile: 18,
        textureSize: 1024,
        textureSizeMobile: 640,
        relief: { height: 0.16, grid: 128, gridMobile: 80 },
        rollDegPerDoubling: 4,
        // The color cycle: each tunnel level renders its boundary glow
        // at a slightly different hue, so the dive's color drifts as it
        // deepens and the next color is visible glowing deeper down the
        // tunnel before it arrives. The hue BOUNCES back and forth
        // across the warm band [minHue, maxHue] (degrees, minHue may be
        // negative meaning below 0 on the wheel): gold down through
        // orange, red, magenta, to violet and back, deliberately never
        // entering green, cyan, or blue (Steve found the orange-green
        // passage ugly), and a bounce never jumps the way a wheel wrap
        // would. baseHue 25 is the classic orange; the drift only
        // begins startLevel levels down, so the resting monument and
        // the flat pre-reveal zoom keep their composed look. Hue
        // depends only on the level number, so surfacing replays the
        // same colors in reverse.
        //
        // Each level is one fixed hue, so the SMOOTHNESS of the visible
        // transitions is set entirely by the per-level step: the
        // crossfade between adjacent levels blends their two hues, and
        // a small step keeps that blend imperceptible (30 read as
        // abrupt jumps).
        colorCycle: {
            baseHue: 25,
            degreesPerLevel: 12,
            startLevel: 3,
            minHue: -75,
            maxHue: 50
        },
        // The set stays a flat 2D picture (the monument, scaling up like
        // a classic Mandelbrot zoom) until the dive reaches this
        // MAGNIFICATION (same units the depth chip reports); then the
        // 3D tunnel layers crossfade in. Kept low on purpose: the
        // monument's one texture is stretched by this same factor at
        // the handoff, so a large value means the pre-reveal picture
        // goes blurry before the layers arrive to sharpen it.
        revealMagnification: 6,
        floorDoublings: 38.5
    },

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it honors Benoit Mandelbrot and
    // the mathematics he gave everyone, so the welcome link goes to the
    // serving site's root in the same tab.
    site: {
        // The person this experience celebrates.
        honoree: {
            label: 'Benoit Mandelbrot'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'The Mandelbrot Set',
            text: 'A quiet float through deep space beside the most famous shape in mathematics. Come see the orange fire at the edge:'
        },

        // The builder funnel. Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    }

    // (No autopilot tour, no settings panel, no checklist: the visitor's
    // only job here is to look, and the edge's only job is to be worth
    // looking at.)
});
