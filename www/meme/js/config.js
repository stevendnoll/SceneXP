// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Meme Studio (/meme/, specs/meme PLANNING): the studio, its
 * light and camera, the caption rules, the wordmark, the export sizes and
 * the remix link's ceiling. Every number a QA round might move is here, in
 * meters, seconds, pixels and radians.
 *
 * DEEP FROZEN, so nothing at run time can change the page's tuning by
 * accident.
 */

function deepFreeze(o) {
    for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
    return Object.freeze(o);
}

export const MEME_PAGE = deepFreeze({
    /** The soft studio the shadowboxes float in: the avatar page's warm
     *  white, a floor far larger than any frame so its edge is never seen,
     *  `below` meters under the boxes' own floors (Steve's QA, 2026-10-28:
     *  level with the bottom row's floors, the two fought for every pixel,
     *  plainest on The Handshake's dark floor). */
    studio: {
        color: '#F1EFEA',
        floor: { size: 60, color: '#ECE8E1', below: 0.01 }
    },

    /**
     * Soft daylight: an even sky, one sun, and a cool fill, as the avatar's
     * studio is lit. THE SUN COMES IN THROUGH THE OPENINGS (QA 2026-10-28):
     * it stands low in front, a touch to the right, so each box is lit only
     * through its own front and a figure's shadow lands on its own back
     * wall as a flash photo's does, never in the panel below. The box's
     * planes cast (panels.js), so the ceiling and the side keep a
     * neighbor's shadow out. `position` less `target` is only a direction:
     * the stage re-aims the sun at each arrangement and sizes its shadow
     * camera to it (`fitSun`), `reach` being the least half-extent.
     *
     * The ceiling's own shadow line on the back wall sits at the box's
     * height less the depth times the tangent of the sun's elevation, and
     * tests/meme-shadows holds it above what the face camera sees. The
     * side wall's shadow strip is the same sum with the azimuth, so the
     * sun stands only a few degrees off square (a camera nudged sideways
     * for a pointing arm saw a dark bar at the panel's edge, 2026-10-28).
     */
    light: {
        sky: { color: '#F6F8FB', ground: '#ECE7DF', intensity: 2.2 },
        sun: {
            color: '#FFF6EA', intensity: 1.8, position: [0.6, 1.2, 6.0], target: [0, 0.8, 0],
            shadow: { size: 1024, reach: 2.6, bias: -0.0004, normalBias: 0.03, radius: 4 }
        },
        fill: { color: '#E6EDF5', intensity: 0.5, position: [-3, 2.4, 2.6] },
        exposure: 1.0
    },

    /** The camera on the whole arrangement: `eye` where it stands and `aim`
     *  what it looks at before a template is shown, `fov` vertical in
     *  degrees. With one, the arrangement is framed (`view`). */
    camera: { fov: 32, eye: [0, 1.5, 5.2], aim: [0, 1.0, 0] },

    /**
     * The live view (PLANNING 5.1): the whole arrangement framed with
     * `margin` to spare, the camera standing `lift` of its distance above
     * the arrangement's middle; a tap on a panel glides into it over
     * `glide` seconds (a cut under reduced motion) and a tap again glides
     * out; a drag tilts the view up to `tilt.yaw` and `tilt.pitch` radians,
     * `tilt.perPixel` radians a pixel; a tap moves less than `tapPixels`.
     */
    view: { margin: 1.12, lift: 0.08, glide: 0.6, tilt: { yaw: 0.35, pitch: 0.18, perPixel: 0.004 }, tapPixels: 6 },

    /**
     * A shadowbox (PLANNING 5.1): the open box each panel's scene stands in,
     * in meters, its origin at the middle of its floor and its open side
     * toward +z. Tall enough for a figure with a hat, wide enough that a
     * cell's camera sees only its own back wall on a wide screen. `gap` is
     * the space between boxes in the arrangement (M2). `wall` and `floor`
     * are its default colors; a cell may name its own `backdrop`.
     */
    box: { width: 2.4, height: 2.3, depth: 1.4, gap: 0.12, wall: '#E9E4DC', floor: '#DDD7CE' },

    /**
     * Captions (PLANNING D1 and D4, 2026-10-27). `font` is the caption
     * face, a system stack with nothing fetched: Impact where the device
     * has it (macOS, Windows, iOS), the condensed fallback on Android. It
     * is named once here and once in css/meme.css (`--mm-caption-font`),
     * and tests/meme-init holds the two the same. `maxChars` a slot,
     * `maxSlots` a template, `maxLines` a caption once wrapped.
     */
    caption: {
        font: 'Impact, "Arial Narrow Bold", "Roboto Condensed", sans-serif',
        maxChars: 60,
        maxSlots: 6,
        maxLines: 2,
        /** How a caption is drawn on a panel (compose.js): the face `size`
         *  as a share of the panel's height, shrinking to `smallest` of that
         *  to fit, the `stroke` as a share of the face, `inset` from the
         *  panel's edge as a share of its height, the line height, and the
         *  classic white on a black outline in capitals. */
        size: 0.11, smallest: 0.55, stroke: 0.09, inset: 0.04, lineHeight: 1.04,
        fill: '#ffffff', outline: '#000000', uppercase: true,
        /** A caption on a prop's surface (the chart's sheet): the face
         *  `scale` times the size a panel of the sheet's height would get,
         *  since the sheet is small, up to `maxLines` lines (Steve,
         *  2026-10-28: bigger words on the board). */
        board: { scale: 1.9, maxLines: 3 }
    },

    /** A label pinned to a figure (compose.js): the face `size` as a share
     *  of the panel's height, at most `maxWidth` of the panel's width, over
     *  the figure's chest, `below` the head's middle in meters. */
    label: { size: 0.062, maxWidth: 0.34, below: 0.32, gap: 0.01 },

    /** The composite picture (compose.js): the panels tiled on a dark
     *  ground with a `gutter` between and around them, as a share of the
     *  picture's height. */
    panel: { gutter: 0.012, background: '#111111' },

    /** Everything Is Fine's flames (scenes/fine.js): `count` sprites, half
     *  on a phone, each `size` meters across, licking `rise` meters a
     *  second. */
    fire: { count: 14, countMobile: 7, size: 0.5, rise: 0.35 },

    /** And its smoke under the ceiling (M8): `count` puffs, fewer on a
     *  phone, each about `size` meters tall, drifting `drift` meters a
     *  second. */
    smoke: { count: 10, countMobile: 6, size: 0.75, drift: 0.04 },

    /**
     * A template's background color, where it offers one (Galaxy Brain,
     * M8): the visitor picks one color, the deepest row wears it and the
     * rows above fade from `paper` toward it, each by its cell's `tint`
     * share (templates.js). A pick lighter than `cap` (HSL lightness) is
     * darkened to it, so the last row stays dark enough for the glow to
     * bloom. `swatches` are offered beside the meme's own and any color.
     */
    tint: {
        paper: '#F4F1EA',
        cap: 0.42,
        swatches: [
            { id: 'black', label: 'Black', color: '#121214' },
            { id: 'midnight', label: 'Midnight blue', color: '#1B2A55' },
            { id: 'teal', label: 'Teal', color: '#145E5C' },
            { id: 'forest', label: 'Forest green', color: '#275A33' },
            { id: 'crimson', label: 'Crimson', color: '#8A1C2C' },
            { id: 'orange', label: 'Burnt orange', color: '#A9481A' }
        ]
    },

    /** The wordmark on every export (D3): text only, in the caption face,
     *  white with the dark outline, `height` and `inset` as shares of the
     *  canvas height, bottom right. */
    wordmark: { text: 'SceneXP.com', height: 0.024, inset: 0.03 },

    /** Export sizes (PRD 5.6): pictures as PNG. The preview on the sheet is
     *  drawn `preview` pixels across. (The video's `clip` settings left with
     *  the video, held back from the launch, and are in commit 21f3068.) */
    export: {
        pictures: [
            { id: 'square', w: 1080, h: 1080, label: '1080 square' },
            { id: 'portrait', w: 1080, h: 1350, label: '1080 by 1350 portrait' }
        ],
        preview: 540
    },

    /** The remix link (PLANNING 4.3): the longest fragment `decodeRemix`
     *  reads, with room for every slot at its cap and the longest avatar. */
    remix: { maxLength: 2000 },

    /** Where the last meme is kept in this browser (F8). */
    storageKey: 'scenexp-meme',

    /** What comes next once something is shared or saved (M7). A visitor
     *  with an avatar is shown the promo catalog's pick (PAIRS: X's and
     *  O's). One with none is shown the avatar page, drawn as a catalog
     *  entry is (promo-1.0.0 `entry`), whose Back button returns here. */
    next: {
        avatar: {
            slug: 'avatar',
            title: 'Your Avatar',
            line: 'Make a figure that looks like you',
            art: '/avatar/assets/og-avatar.webp?v=1',
            href: '/avatar/?return=/meme/'
        }
    },

    /** The usage pings' proof of work (shared boot part), under the same
     *  key every scene uses, so a visit that wanders through here stays one
     *  visit in the log. */
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    quality: {
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5
    }
});
