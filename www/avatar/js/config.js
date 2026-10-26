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
        /** The plinth the figure stands on: a low round disc of warm gray
         *  stone that turns, on a dark toe set `inset` in, so it seems to
         *  float. A few shades deeper than the white room (Steve's QA,
         *  2026-10-24: white soles disappeared into a near-white plinth). */
        plinth: { radius: 0.5, height: 0.07, toe: 0.02, inset: 0.04, chamfer: 0.008, stone: '#C9C2B6', toeColor: '#2A2D31' },
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
     * The camera. Its framings (`frameFor`): the whole figure, and close in
     * on the face and on the feet. `center` is the height the camera aims at
     * above the plinth's top, `height` the most that must fit top to bottom,
     * `half` the most either side of the figure's middle, `lift` how far
     * above `center` the camera stands, `margin` the room to spare. `fov` is
     * vertical, degrees.
     *
     * The zoom (`viewFor`) runs from the whole figure (0) to close in (1)
     * about a focus height, between `lowest` and `highest`. A button is a
     * `step`; the wheel moves `wheel` a pixel of scroll (`trackpad` times
     * that for a trackpad's pinch); two fingers move `pinch` for each
     * doubling of their spread; and zooming in drifts the focus `drift` of
     * the way toward the point under the pointer. The view closes on its
     * goal at `follow` (a rate a second). The + button zooms toward the
     * tab's part of the figure: the face's or the feet's `center`, or the
     * `torso` for the body's tabs. Zoomed in, an upright drag pans.
     */
    camera: {
        fov: 30,
        zoom: { step: 0.34, wheel: 0.0016, trackpad: 4, pinch: 1.4, drift: 0.5, follow: 9, lowest: 0.15, highest: 1.62, torso: 1.1 },
        frames: {
            // 2.1 tall since 2026-10-26: the bigger standard hand reaches
            // higher mid-wave, and the whole figure must stay in the frame.
            body: { center: 0.94, height: 2.1, half: 0.62, lift: 0.22, margin: 1.06 },
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
     * options, and only while the field it `requires` shows; a field with
     * `hideWhen` steps aside while the avatar holds that value (no beard,
     * no beard's color), and one with `showWhen` shows only while it does
     * (a jersey's number, on the jersey). A 'number' field is typed, not
     * chosen from a row (a hundred buttons would be no row). A tab shows
     * only when it has a field to show. Every color field ends in a custom
     * swatch (any color, the browser's own picker). A field with a `frame`
     * of its own is framed by it when chosen, not by its tab's (the shoes,
     * on the Clothes tab, still look at the feet).
     *
     * SIX TABS IN TWO ROWS OF THREE (Steve's QA, 2026-10-26, down from
     * nine): the mouth's two groups sit on the Face tab between the cheeks
     * and the facial hair (top down, and the beard wraps the mouth); the
     * shoes are clothes; the hat is on the Hair tab, since every hat is
     * fitted to the hair under it. Facial hair is on the Face tab, since
     * the Hair tab is full of styles (2026-10-25); the hands and the feet
     * are part of the Build.
     */
    tabs: [
        {
            id: 'face', label: 'Face', frame: 'face', fields: [
                { key: 'skin', legend: 'Skin tone', kind: 'swatch' },
                { key: 'faceShape', legend: 'Face shape', kind: 'text' },
                { key: 'nose', legend: 'Nose', kind: 'text' },
                { key: 'cheeks', legend: 'Cheeks', kind: 'text' },
                { key: 'mouth', legend: 'Expression', kind: 'text' },
                { key: 'lips', legend: 'Lip color', kind: 'swatch' },
                { key: 'facial', legend: 'Facial hair', kind: 'text' },
                { key: 'facialColor', legend: 'Facial hair color', kind: 'swatch', hideWhen: { field: 'facial', value: 'none' } }
            ]
        },
        {
            id: 'eyes', label: 'Eyes', frame: 'face', fields: [
                { key: 'eyeShape', legend: 'Eye shape', kind: 'text' },
                { key: 'eyes', legend: 'Eye color', kind: 'swatch' },
                { key: 'brows', legend: 'Eyebrows', kind: 'text' },
                { key: 'glasses', legend: 'Glasses', kind: 'text' },
                { key: 'frameColor', legend: 'Frame color', kind: 'swatch', hideWhen: { field: 'glasses', value: 'none' } },
                { key: 'lensColor', legend: 'Lens color', kind: 'swatch', hideWhen: { field: 'glasses', value: 'none' } }
            ]
        },
        {
            id: 'hair', label: 'Hair', frame: 'face', fields: [
                { key: 'length', legend: 'Style', kind: 'text' },
                { key: 'hair', legend: 'Color', kind: 'swatch' },
                { key: 'hat', legend: 'Hat', kind: 'text' },
                { key: 'hatColor', legend: 'Hat color', kind: 'swatch', requires: 'hat', hideWhen: { field: 'hat', value: 'none' } }
            ]
        },
        {
            id: 'build', label: 'Build', frame: 'body', fields: [
                { key: 'build', legend: 'Build', kind: 'text' },
                { key: 'muscles', legend: 'Muscles', kind: 'text' },
                { key: 'handSize', legend: 'Hand size', kind: 'text' },
                { key: 'footSize', legend: 'Foot size', kind: 'text' }
            ]
        },
        {
            id: 'clothes', label: 'Clothes', frame: 'body', fields: [
                { key: 'shirt', legend: 'Shirt', kind: 'swatch' },
                { key: 'sleeves', legend: 'Style', kind: 'text' },
                { key: 'jerseyNumber', legend: 'Jersey number', kind: 'number', showWhen: { field: 'sleeves', value: 'jersey' } },
                { key: 'numberColor', legend: 'Number color', kind: 'swatch', showWhen: { field: 'sleeves', value: 'jersey' } },
                { key: 'bottom', legend: 'Pants, skirt or shorts', kind: 'text' },
                { key: 'bottomColor', legend: 'Color', kind: 'swatch' },
                { key: 'shoes', legend: 'Shoes', kind: 'text', frame: 'feet' },
                { key: 'shoeColor', legend: 'Shoe color', kind: 'swatch', frame: 'feet' }
            ]
        },
        {
            // The underlayer (Steve's QA, 2026-10-26): what shows where the
            // legs and the arms are bare, each with a color of its own.
            id: 'layers', label: 'Layers', frame: 'body', fields: [
                { key: 'legwear', legend: 'Legs', kind: 'text' },
                { key: 'legwearColor', legend: 'Legwear color', kind: 'swatch', hideWhen: { field: 'legwear', value: 'none' } },
                { key: 'armwear', legend: 'Arms', kind: 'text' },
                { key: 'armwearColor', legend: 'Armwear color', kind: 'swatch', hideWhen: { field: 'armwear', value: 'none' } }
            ]
        }
    ],

    /**
     * Export my avatar (Steve, 2026-10-26; js/export.js): a picture or a
     * clip of the figure on screen, made on the device. A picture is
     * square, at one of `pictures` (pixels across), framed on the head and
     * shoulders (the chip's portrait) or the whole figure, on the studio or
     * clear, with a border or none. The preview in the dialog is drawn
     * `preview` pixels across. A clip is `clip.seconds` long at `clip.fps`:
     * the figure waves from `clip.waveAt` and turns once round from
     * `clip.turnFrom` over `clip.turnSeconds`, so it ends facing the front
     * as it began and loops cleanly, at one of `clip.sizes`.
     */
    export: {
        pictures: [
            { id: 'p512', px: 512, label: '512 px' },
            { id: 'p1024', px: 1024, label: '1024 px' },
            { id: 'p2048', px: 2048, label: '2048 px' }
        ],
        preview: 560,
        clip: {
            seconds: 4.5, fps: 30, waveAt: 0.3, turnFrom: 1.5, turnSeconds: 3.0,
            bitrate: 8000000, mobileBitrate: 5000000,
            sizes: [
                { id: 'c720', w: 720, h: 720, label: '720 square' },
                { id: 'c1080', w: 1080, h: 1080, label: '1080 square' },
                { id: 'story', w: 1080, h: 1920, label: '1080 by 1920 story' }
            ]
        }
    },

    /** Where the default portrait is served from (the home page's chip
     *  before a visitor saves one), and what the lab saves it as. */
    defaultPortrait: { path: '/assets/avatar/default.png', file: 'default.png' },

    quality: {
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5,
        maxFrameSeconds: 0.1
    }
});
