// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - John Walker, The Auto Man experience configuration
 *
 * One plain object holding every per-experience knob this experience's
 * modules accept. main.js imports this and passes slices into the init
 * functions: initScene(canvas, AUTOMAN_CONFIG), initStore(), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The eleventh SceneXP micro-environment, and the fourth passive one: a
 * small promotional world for John Walker, "The Auto Man," a car buying
 * and selling advocate in Baltimore. The visitor arrives at a dealership
 * sales desk and finds the moment John sells. He is at the desk with his
 * customer, pointing at the deal sheet, making her case to the dealer
 * across from them, while she nods along. Behind the dealer a wide glass
 * wall looks out on the lot, and every so often a car rolls past.
 *
 * There is no walking and no free-look here on purpose, the same passive
 * contract as the jamar, gavin, and sunnyvalejenn experiences: the camera
 * holds one composed viewpoint and the room does the living. So this
 * config carries no spawn point, no world bounds, and no checklist, and
 * main.js imports none of the walking controls. The shared pan/zoom row
 * (pan-1.0.0.js) runs at every aspect so visitors can look around the
 * showroom, tilt up and down, and lean in on the papers, with swipe and
 * pinch driving the same moves on touch.
 *
 * The glass wall makes the sky part of the room, so the day/night cycle
 * is DISABLED and the shared sky holds at noon. It is a bright midday on
 * the lot at every hour. Clouds stay on and drift past the glass.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const AUTOMAN_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'showroom',

    // The room rectangle, for the shared interior lighting rig
    // (lighting-1.0.0.js reads building.{width, depth, height, positionX,
    // positionZ} to place its fixture grid and ambient fills). Mirrors
    // LAYOUT.room in store.js.
    building: {
        width: 7.6,
        depth: 7.4,
        height: 3.05,
        positionX: 0,
        positionZ: -0.7
    },

    // The fixed viewpoint: standing at the open right-hand corner of the
    // sales desk, about head height for someone beside it, aimed down at
    // the deal sheet. From here John and his customer sit in the near
    // left of the frame in three-quarter view, the dealer sits across
    // from them, and the glass wall and the lot fill the space behind his
    // shoulder. Every face reads, which matters because all three are tap
    // targets. (PRD decision D2.)
    //
    // SOLVED, NOT COMPOSED BY EYE. These numbers come out of a search over
    // camera positions and the customer's seat, scored against everything
    // the scene needs at once. The seating is the part that had to give:
    // with John and his customer BOTH square on the desk's near side,
    // anyone facing the dealer has their back to this camera, and the two
    // of them also collapse onto the same sight line. Corner seating fixes
    // both, and is decision D8.
    //
    // What the chosen arrangement delivers:
    //
    //   John's face       55 deg off the lens, reads FRONT (his likeness
    //                     is the one that has to land)
    //   the customer      86 deg, a clean profile, and a nod reads from
    //                     any angle
    //   the dealer        83 deg, profile turning to front, listening
    //   min separation    11.2 deg, so nobody collapses into a neighbour
    //   nearest person    3.71m, so nobody looms over the lens
    //   behind the dealer x -1.74 on the back wall, comfortably central
    //                     glass rather than a sliver beside the pier
    //
    // Move the camera, the lookAt point, the desk, or any seat and all of
    // that has to be re-solved together, INCLUDING the lot placement in
    // store.js, which is measured from this same viewpoint.
    //
    // !! PORTRAIT DOLLY, READ BEFORE TUNING !!
    // The shared placeCamera() that sunnyvalejenn uses widens the FOV and
    // then dollies the camera by raising camera.position.z alone. That is
    // correct only for a camera whose view axis is roughly -Z, which was
    // true of Jenn's doorway seat and is NOT true here: this camera sits
    // at a corner and looks diagonally, so pushing it in +z alone slides
    // it sideways relative to its own view and swings the aim (lookAt is
    // fixed). placeCamera has to be reworked to dolly ALONG the view axis
    // instead, moving the position away from lookAt on the normalized
    // (position - lookAt) vector.
    camera: {
        position: { x: 2.50, y: 1.45, z: -0.30 },
        lookAt: { x: -0.93, y: 0.92, z: -2.18 },
        fov: 50,
        portrait: {
            fov: 74,
            // Half the width that must survive a portrait frame, measured
            // at the lookAt plane. Derived by projecting each figure onto
            // the camera's right vector, adding a 0.34 half-body, and
            // scaling to the lookAt distance: John needs 0.52, the
            // customer 1.41, the dealer 1.42. So 1.45, with a little air.
            // placeCamera backs the eye along its view axis until this
            // much fits either side of the lookAt point, which IS the deal
            // sheet, so the focus plane needs no separate number.
            minHalfWidth: 1.45,
            // How far the eye may sit from the lookAt point, in metres
            // along that axis. The composed range is 3.95. The cap comes
            // from the east wall behind the camera: the view axis leaves
            // the lookAt point with an x component of 0.869, so an eye
            // range of r puts it at x = -0.93 + 0.869r, and the wall's
            // room-side face is at 3.725. Stopping at x 3.57 gives
            // r = 5.18, so 5.1 leaves a little air. A 9:19.5 phone needs
            // only 4.17 of that, so there is real margin.
            maxRange: 5.1,
            // View controls (shared pan-1.0.0.js): the showroom is wider
            // than any frame, so every aspect crops the coffee bar on one
            // side and the sales board on the other. This scene runs the
            // row at ALL screen sizes (main.js passes alwaysOn, like
            // jamar and sunnyvalejenn). The pan arrows yaw up to maxAngle
            // radians each way, at speed radians per second. The zoom
            // pair is binocular-style FOV: up to maxIn degrees below the
            // current orientation's composed fov (leaning in on the deal
            // sheet) and maxOut degrees above it (widening the whole
            // showroom), at speed degrees per second. Touch swipes drive
            // the same yaw and zoom, and can also tilt the view up to
            // maxTilt radians up or down (the ceiling panels up high, the
            // waste basket down low). The tilt has no buttons: swipe it
            // directly, or hold W/S or Shift+Up/Down at the pan speed.
            // Rotating between orientations recenters everything.
            pan: {
                speed: 0.4,
                maxAngle: 0.62,
                maxTilt: 0.32
            },
            zoom: {
                speed: 18,
                maxIn: 26,
                maxOut: 8
            }
        }
    },

    // The glass wall makes the sky part of the room, so unlike the
    // windowless bar the sky must look good at all times: the cycle is
    // disabled and the shared rig holds at noon. It is a bright midday on
    // the lot at every hour.
    dayNight: { enabled: false },

    // No comet over a suburban dealership, but the drifting clouds stay:
    // the glass frames them, and they keep the lot alive between cars.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A friendly showroom at every hour.
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key
    // is shared across experiences so returning visitors' cached proofs
    // stay valid on the same serving domain. main.js also hands the
    // solved proof to the contact card, which is why the reveal there
    // costs the visitor nothing (see site.contact below).
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything
    // that names the serving domain is derived from location at runtime.
    // This experience features a business: John Walker, The Auto Man.
    // Unlike the other featured businesses, John has no separate website,
    // because THIS PAGE is his web presence. So there is no outbound
    // business URL here, and the second floating button is the contact
    // button rather than a link away.
    site: {
        // The person this experience celebrates, and his business.
        honoree: {
            label: 'John Walker',
            business: 'John Walker, The Auto Man'
        },

        business: {
            name: 'John Walker, The Auto Man',
            tagline: 'Your advocate before, during, and after the deal',
            serviceArea: 'Baltimore, Maryland, or anywhere by Zoom',
            guarantee: '100% satisfaction guarantee, or the fee comes back'
        },

        // How a visitor reaches John. The values are stored in pieces so
        // a scraper grepping the source for a phone or email pattern
        // finds nothing, and they are assembled into tel:, sms:, and
        // mailto: hrefs only after the proof of work above resolves. That
        // is the same soft deterrent www/js/contact.js uses for the
        // developer's address, and it is PRD decision D3.
        //
        // The proof is already solved during init(), long before any card
        // can open, so the reveal is instant: the contact card renders
        // with live links, never a spinner. If the proof is unavailable
        // (no crypto.subtle, which in practice means a non-secure
        // origin), the card falls back to the pitch plus a link to
        // /contact.html rather than showing a contact card with no way to
        // make contact.
        //
        // OPEN: whether these values should ALSO appear in the page's
        // JSON-LD and noscript fallback, so search engines and assistants
        // can retrieve them. See PRD section 17. Built as reveal-only
        // until that is settled.
        contact: {
            phoneParts: [['41', '0'], ['2', '99'], ['67', '39']],
            emailParts: [['Johnny', 'Walker', 'theautoman'], ['gm', 'ail'], ['c', 'om']],
            smsBody: 'Hi John, I found your 3D showroom and I would like to talk about a car.',
            emailSubject: 'A free consultation, please'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'John Walker, The Auto Man',
            text: 'A tiny 3D dealership where John Walker is at the desk arguing the deal down for his customer, and the coffee is free:'
        },

        // The builder funnel. Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    }

    // (No autopilot tour, no settings panel, no checklist: the visitor's
    // only job here is to watch someone good at this do it, and the
    // showroom's only job is to be worth the stay.)
});
