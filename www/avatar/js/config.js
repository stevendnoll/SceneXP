// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Your Avatar (/avatar/, specs/avatar PLANNING section 4): the
 * studio, its camera, the turntable, and the editor's tabs. Every number a QA
 * round might move is here, in meters, seconds and radians.
 *
 * DEEP FROZEN, so nothing at run time can change the page's tuning by
 * accident.
 */

function deepFreeze(o) {
    for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
    return Object.freeze(o);
}

export const AVATAR_PAGE = deepFreeze({
    /** The white studio (Steve's taste: calm, white, softly lit). A floor
     *  running from `front` (behind the camera) back to `back`, where it
     *  curves up through a quarter circle of `radius` into a wall. Far
     *  larger than any frame, so its edges are never seen. */
    studio: {
        color: '#F1EFEA',
        cove: { width: 40, front: 14, back: 3.2, radius: 1.8, height: 12 },
        /** The plinth the figure stands on: a low round disc of pale stone
         *  that turns, on a dark toe set `inset` in, so it seems to float. */
        plinth: { radius: 0.5, height: 0.07, toe: 0.02, inset: 0.04, chamfer: 0.008, stone: '#ECE8E1', toeColor: '#2A2D31' },
        /** The soft shadow under the plinth: `alpha` dark from `inside`
         *  meters within its rim, fading out over `soft` meters past it. */
        contact: { alpha: 0.3, inside: 0.15, soft: 0.35, lift: 0.002 }
    },

    /** Soft daylight from an unseen skylight: an even sky, one sun from high
     *  in front whose shadow falls on the plinth, and a cool fill. */
    light: {
        sky: { color: '#F6F8FB', ground: '#ECE7DF', intensity: 2.4 },
        sun: {
            color: '#FFF6EA', intensity: 2.0, position: [1.6, 5, 3.4], target: [0, 0.8, 0],
            shadow: { size: 1024, reach: 1.1, near: 1, far: 12, bias: -0.0004, normalBias: 0.02, radius: 4 }
        },
        fill: { color: '#E6EDF5', intensity: 0.55, position: [-3, 2.4, 2.6] },
        exposure: 1.0
    },

    /**
     * The camera's three framings, eased between as the tabs change
     * (`frameFor`): the whole figure, the face, the feet. `center` is the
     * height the camera aims at above the plinth's top, `height` the most
     * that must fit top to bottom, `half` the most either side of the
     * figure's middle, `lift` how far above `center` the camera stands,
     * `margin` the room to spare. `fov` is vertical, degrees.
     */
    camera: {
        fov: 30,
        ease: 0.6,
        frames: {
            body: { center: 0.94, height: 2.0, half: 0.62, lift: 0.22, margin: 1.06 },
            face: { center: 1.53, height: 0.62, half: 0.3, lift: 0.05, margin: 1.0 },
            feet: { center: 0.3, height: 0.9, half: 0.45, lift: 0.5, margin: 1.0 }
        }
    },

    /** The turntable: `speed` radians a second while it turns by itself,
     *  stopping (facing front) after `idle` seconds with nobody touching
     *  anything, `drag` radians a pixel of drag, and `step` radians a press
     *  of a turn button, eased over `stepSeconds`. */
    turntable: { speed: 0.22, idle: 24, drag: 0.012, step: Math.PI / 4, stepSeconds: 0.5 },

    /** The figure waves this long after a save (seconds), once it has
     *  turned to face the front. */
    waveAfterSave: 0.35,

    /**
     * The editor's tabs (PRD section 6), in order, each with the camera's
     * framing and its fields. `kind` is 'swatch' (a color) or 'text' (a
     * word). A field shows only when this version draws more than one of its
     * options, and only while the field it `requires` shows (a hat's color
     * means nothing without hats), and a tab only when it has a field to
     * show (the Hat tab waits for the hats, M5).
     */
    tabs: [
        {
            id: 'face', label: 'Face', frame: 'face', fields: [
                { key: 'skin', legend: 'Skin tone', kind: 'swatch' },
                { key: 'eyes', legend: 'Eye color', kind: 'swatch' },
                { key: 'mouth', legend: 'Expression', kind: 'text' },
                { key: 'lips', legend: 'Lip color', kind: 'swatch' },
                { key: 'facial', legend: 'Facial hair', kind: 'text' },
                { key: 'glasses', legend: 'Glasses', kind: 'text' }
            ]
        },
        {
            id: 'hair', label: 'Hair', frame: 'face', fields: [
                { key: 'length', legend: 'Style', kind: 'text' },
                { key: 'hair', legend: 'Color', kind: 'swatch' }
            ]
        },
        {
            id: 'build', label: 'Build', frame: 'body', fields: [
                { key: 'build', legend: 'Build', kind: 'text' },
                { key: 'muscles', legend: 'Muscles', kind: 'text' }
            ]
        },
        {
            id: 'clothes', label: 'Clothes', frame: 'body', fields: [
                { key: 'shirt', legend: 'Shirt', kind: 'swatch' },
                { key: 'sleeves', legend: 'Style', kind: 'text' },
                { key: 'bottom', legend: 'Pants, skirt or shorts', kind: 'text' },
                { key: 'bottomColor', legend: 'Color', kind: 'swatch' }
            ]
        },
        {
            id: 'feet', label: 'Feet', frame: 'feet', fields: [
                { key: 'shoes', legend: 'Shoes', kind: 'text' },
                { key: 'shoeColor', legend: 'Shoe color', kind: 'swatch' }
            ]
        },
        {
            id: 'hat', label: 'Hat', frame: 'face', fields: [
                { key: 'hat', legend: 'Hat', kind: 'text' },
                { key: 'hatColor', legend: 'Hat color', kind: 'swatch', requires: 'hat' }
            ]
        }
    ],

    /** Where the default portrait is served from (the home page's chip
     *  before a visitor saves one), and what the lab saves it as. */
    defaultPortrait: { path: '/assets/avatar/default.png', file: 'default.png' },

    quality: {
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5,
        maxFrameSeconds: 0.1
    }
});
