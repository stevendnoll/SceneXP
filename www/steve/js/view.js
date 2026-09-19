// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - The home office's one composed viewpoint, as a pure function.
 *
 * ---- WHY THIS IS ITS OWN FILE ----
 *
 * The office used to be walked through, so where the eye stood was the
 * visitor's business. Now the eye is fixed, and the one thing the scene
 * promises is that STEVE IS IN THE DEFAULT VIEW AT EVERY SCREEN SHAPE, from
 * an ultrawide monitor to a phone held upright. That promise is only worth
 * making if something checks it through a real camera, and a check that
 * copies the camera numbers out of main.js would pass against a camera main.js
 * no longer builds. So main.js and tests/steve-view.test.mjs both call this,
 * and the test projects the real room through exactly what the page does.
 *
 * ---- WHERE THE EYE STANDS ----
 *
 * In front of the closet doors, looking north across the room at Steve's
 * left side as he works at the sit-stand desk. Measured against the real
 * room (three.js in a node:vm sandbox, occlusion included) before it was
 * chosen:
 *
 *   from the middle of the room   Steve at 141 deg from his facing, which
 *                                 is mostly the back of his head
 *   from here                     99 deg, a side profile, and 100% of him
 *                                 in the default view at 21:9, 16:9, 4:3,
 *                                 1:1, 3:4, 9:16 and a 9:19.5 phone
 *
 * The wall display is about 40 deg to the right and fully in view after that
 * pan, on a phone as well as a monitor. The pan wraps (see config.js), so
 * everything else in the room is a turn away, the closet doors included,
 * which are right behind the lens.
 *
 * ---- PORTRAIT WIDENS, IT DOES NOT BACK UP ----
 *
 * The diorama scenes back the camera away from the subject on a portrait
 * phone until it fits. This one cannot: the eye is already standing against
 * the closet, and a camera that can turn all the way round would be backed
 * into whatever is behind the direction it happened to face. So below an
 * aspect of 1 only the lens widens, from `fov` to `portrait.fov`. Measured,
 * that is enough: Steve is taller than he is wide, and a portrait frame
 * gives him more height, not less.
 */

/**
 * The camera a given screen shape gets: where it stands, what it aims at, and
 * its VERTICAL field of view (three.js FOV is vertical). Pure, so the page and
 * the test agree by construction.
 *
 * @param {object} camera  STEVE_CONFIG.camera
 * @param {number} aspect  width / height of the viewport
 * @returns {{ position: {x,y,z}, lookAt: {x,y,z}, fov: number, portrait: boolean }}
 */
export function composeView(camera, aspect) {
    const portrait = aspect < 1;
    const fov = portrait && camera.portrait && camera.portrait.fov
        ? camera.portrait.fov
        : camera.fov;
    return {
        position: { ...camera.position },
        lookAt: { ...camera.lookAt },
        fov,
        portrait,
    };
}
