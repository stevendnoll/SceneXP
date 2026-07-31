// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the karaoke night experience.
 *
 * The second passive SceneXP experience, so this conductor stays small:
 * build the bar, park the camera at its one composed viewpoint, and let
 * the room do all the moving. There are no movement controls, no
 * collision, and no day/night cycle (the bar is windowless, so it is
 * karaoke night in here at every hour). The interactions that do exist
 * are featherweight: the welcome overlay (dismissed with a click, tap,
 * or key), the floating Home button, the portrait-only pan and zoom row
 * (shared pan part, so phones can see the sides the narrow frame crops
 * and lean in toward the stage), and one raycast per tap to see what the
 * visitor pointed at, answered in the host's voice by the dialog card.
 * The scene is deliberately silent: the bar-sounds ambience was removed
 * (Steve's call, the murmur did not suit a karaoke night).
 *
 * Future contributors: this file (with www/gavin/js/main.js) is the
 * template for "living diorama" experiences. If your scene wants walking
 * and clicking instead, start from www/steve/js/main.js, which wires the
 * shared controls.
 */

import { JAMAR_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import { initPortraitControls, updatePortraitControls, gestureClaimedTap } from '../../shared/js/pan-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getRenderer,
    removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import { initStore, updateBar, drawTvTo, setNowPlaying } from './store.min.js';
import { getOutdoorPropMeshes } from '../../shared/js/world-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

// DOM references (resolved in init)
let canvas, loadingScreen, blocker;
let dialogModal, dialogTitle, dialogMessage;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up
let tvView, tvCanvas, tvCaption;   // the karaoke screen close-up overlay
let tvViewOpen = false;
let tvRaf = 0;
let jukeboxModal, jukeboxSongs;    // the jukebox song picker
let jukeboxOpen = false;

let cleanupController = null;

// One raycast per tap, with a little forgiveness for fingertips
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _tolPointer = new THREE.Vector2();  // offset sample point for forgiving taps
const TAP_TOLERANCE_PX = 26;              // matches the other experiences' tap radius

// ---- Initialization -------------------------------------------------------

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile); // tag every telemetry ping with mobile vs not

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');
    tvView = document.getElementById('tv-view');
    tvCanvas = document.getElementById('tv-canvas');
    tvCaption = document.getElementById('tv-caption');
    jukeboxModal = document.getElementById('jukebox-modal');
    jukeboxSongs = document.getElementById('jukebox-songs');

    if (!canvas) return;

    // Wire the Home button from JAMAR_CONFIG.site, so config stays the
    // single home for these values. An equivalent fallback is baked into
    // the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(JAMAR_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, JAMAR_CONFIG);
    placeCamera();

    updateLoadingStatus('Warming up the speakers…', 50);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Handing Jamar the mic…', 80);
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
    }, 400);

    // Mark the start of this visit. Records the input mode so the log can tell
    // desktop visits from touch ones. (Hits are tied together by the PoW hash.)
    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

/** Park the camera at the experience's one composed viewpoint. The bar
 *  provides all the motion; the camera only re-derives on resize.
 *
 *  The composition assumes a landscape frame. three.js FOV is vertical,
 *  so a portrait phone keeps the height but loses both sides. Below an
 *  aspect of 1 this widens to the portrait FOV and dollies the camera
 *  straight back until the composed half-width (the stage and most of
 *  the booth) fits in frame at the stage's distance, capped at
 *  portrait.maxZ so the dolly can never back through the wall behind
 *  the camera. Runs on every resize, so rotating the phone reframes
 *  live. */
function placeCamera() {
    const camera = getCamera();
    const cam = JAMAR_CONFIG.camera;
    if (!camera || !cam) return;

    const aspect = window.innerWidth / window.innerHeight;
    const portrait = cam.portrait || {};
    let fov = cam.fov || camera.fov;
    let z = cam.position.z;

    if (aspect < 1 && portrait.minHalfWidth) {
        fov = portrait.fov || fov;
        // Distance at which minHalfWidth meters of half-frame fit the
        // narrow view, back-solved from the horizontal FOV.
        const halfFovRad = (fov / 2) * Math.PI / 180;
        const needed = portrait.focusZ + portrait.minHalfWidth / (Math.tan(halfFovRad) * aspect);
        z = Math.max(z, needed);    // only ever dolly back, never closer
        if (portrait.maxZ) z = Math.min(z, portrait.maxZ);    // and never through the wall
    }

    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(cam.position.x, cam.position.y, z);
    camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    // Shared resize first (renderer size + pixel ratio), then re-derive the
    // fixed viewpoint for the new aspect (the portrait dolly above).
    window.addEventListener('resize', () => {
        handleResize();
        placeCamera();
    }, { signal });

    // iOS Safari ignores `user-scalable=no` (Apple re-enabled zoom in iOS 10 for
    // accessibility), so the only way to keep the immersive 3D view from being
    // pinch-zoomed there is to block Safari's own gesture events. These are
    // non-standard, Safari-only events; preventing gesturestart stops the pinch.
    // Scoped to this page only: the 2D content pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    // Session-end / dwell time. visibilitychange→hidden is the reliable terminal
    // signal (especially on mobile, where unload often doesn't fire); pagehide is
    // a backup. Page-lifetime listeners (no AbortSignal) and endSession is
    // self-guarded, so firing from both is harmless.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    // The welcome overlay: any click, tap, or keypress lets the visitor in.
    // The scene is already alive behind it, so dismissing is all it does.
    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginWatching();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginWatching();
            }
        }, { signal });
    }

    // A click or tap on the scene: any of the bar's storytelling props.
    // A tap that merely ends a swipe or pinch (see the surface option
    // below) belongs to the gesture, not to a prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { signal });

    // The bar dialog's close buttons and backdrop, plus Escape
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (dialogOpen) closePropDialog();
        else if (tvViewOpen) closeTvView();
        else if (jukeboxOpen) closeJukebox();
    }, { signal });

    // The jukebox picker's close buttons, backdrop, and song list
    if (jukeboxModal) jukeboxModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeJukebox, { signal }));
    buildJukeboxSongList(signal);

    // The karaoke screen close-up's close buttons and backdrop, and a
    // re-measure of its canvas if the window changes while it is open
    if (tvView) tvView.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeTvView, { signal }));
    window.addEventListener('resize', () => {
        if (tvViewOpen) sizeTvCanvas();
    }, { signal });

    // View controls: this room is wider than any frame, so even a
    // desktop landscape crops the bar on one side and part of the left
    // wall on the other. The shared part builds a bottom-center row at
    // EVERY aspect for this scene (alwaysOn + the 'always-on' CSS
    // variant; gavin stays portrait-only): pan arrows that slowly yaw
    // the view toward the booth on one side and the bar on the other,
    // and a zoom pair that leans in toward the stage or widens the whole
    // room. The zoom anchors to whichever FOV the current orientation
    // composed with. Handing over the canvas as `surface` adds the touch
    // paths: swipe to pan sideways or tilt up and down, pinch to zoom.
    initPortraitControls({
        getCamera,
        lookAt: JAMAR_CONFIG.camera.lookAt,
        baseFov: JAMAR_CONFIG.camera.portrait.fov,
        landscapeFov: JAMAR_CONFIG.camera.fov,
        pan: JAMAR_CONFIG.camera.portrait.pan,
        zoom: JAMAR_CONFIG.camera.portrait.zoom,
        alwaysOn: true,
        extraClass: 'always-on',
        surface: canvas,
        onFirstUse: (kind) => track(`portrait-${kind}`),
        signal
    });

}

// ---- Scene taps: the storytelling props ------------------------------------

/** True if the object and every ancestor are visible (future-proofing for
 *  props that toggle themselves off; nothing hidden should answer taps). */
function chainVisible(obj) {
    let o = obj;
    while (o) {
        if (o.visible === false) return false;
        o = o.parent;
    }
    return true;
}

/** Nearest visible hit among `targets` under a ray through `point`. */
function firstVisibleHit(targets) {
    const hits = raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
        if (chainVisible(hit.object)) return hit;
    }
    return null;
}

// Props this size are easy to miss beside their big neighbors, so they
// get the whole tolerance search to themselves before anything else is
// allowed to answer. The neighbors are large enough to spare the halo.
const SMALL_PROP_KINDS = ['appletini'];

/** Direct hit first, then a couple of rings of sample rays around the
 *  point, so a pint glass is tappable with a fingertip (same forgiveness
 *  the walkable experiences give their small click targets). */
function searchHit(targets, camera) {
    raycaster.setFromCamera(pointer, camera);
    let hit = firstVisibleHit(targets);
    if (hit) return hit;
    const rx = (TAP_TOLERANCE_PX * 2) / window.innerWidth;
    const ry = (TAP_TOLERANCE_PX * 2) / window.innerHeight;
    for (const rf of [0.5, 1]) {
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            _tolPointer.set(pointer.x + Math.cos(ang) * rx * rf, pointer.y + Math.sin(ang) * ry * rf);
            raycaster.setFromCamera(_tolPointer, camera);
            hit = firstVisibleHit(targets);
            if (hit) return hit;
        }
    }
    return null;
}

/** Nearest visible hit under the screen point: the small props get first
 *  refusal at full tolerance, then everything answers as usual. */
function pickSceneHit(clientX, clientY) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = getOutdoorPropMeshes();
    if (!targets.length) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const small = targets.filter(g => g.userData && SMALL_PROP_KINDS.includes(g.userData.propKind));
    return (small.length && searchHit(small, camera)) || searchHit(targets, camera);
}

/** Walk up from a hit mesh to the nearest prop root (tagged isProp by
 *  registerOutdoorProp). Nearest wins: a glass in Mike's hand resolves as
 *  'mike' before anything behind him. */
function getPropRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isProp) return o;
        o = o.parent;
    }
    return null;
}

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || dialogOpen || tvViewOpen || jukeboxOpen) return;
    const hit = pickSceneHit(clientX, clientY);
    if (!hit) return;
    const prop = getPropRoot(hit.object);
    if (prop) openPropDialog(prop.userData.propKind);
}

// ---- The bar's stories -----------------------------------------------------
// Title + two lines for each clickable thing in the bar, in the same warm
// host's voice as the rest of the site, free of em-dashes and semicolons.
// Two lines apiece so a second click gives something new. The NPC lines
// here are a first pass: the punchlines Steve has planned for Jamar, Mike,
// and the rest arrive with the interactions pass, along with the setlist.
const PROP_CONTENT = {
    jamar: {
        title: 'Jamar',
        lines: [
            'The man of the hour, and the reason the corner stage exists. When Jamar takes the mic, the bar stops being a bar and becomes an audience.',
            'It is his birthday, and he is spending it the correct way: mid-chorus, mic in hand, best friends in the booth. Happy birthday, Jamar.'
        ]
    },
    steve: {
        title: 'Steve',
        lines: [
            'He claims he will sing later, but that seems an unLIKE-ly story.',
            'Remember that one episode of The Simpsons? Wait, of course you do.'
        ]
    },
    mike: {
        title: 'Mike',
        lines: [
            'Every good singer needs a hype man, and Mike was born for the role.',
            'He knows every word of every song Jamar sings, and even sings a few himself.'
        ]
    },
    bartender: {
        title: 'The Bartender',
        lines: [
            'Keeper of the taps and the second-best seat in the house. The glass has been polished for three songs now. Nobody minds.',
            'House rule: the birthday singer never sees the bottom of an empty glass. The staff takes this seriously.'
        ]
    },
    patrons: {
        title: 'The Regulars',
        lines: [
            'They came in for one quiet drink. That was two hours and one very committed singalong ago.',
            'They do not know Jamar personally. By the second chorus, that had stopped mattering.'
        ]
    },
    stage: {
        title: 'The Corner Stage',
        lines: [
            'Four square meters of plywood and one pink glowing edge, which is all any legend has ever needed.',
            'Regulars call it the corner office. Tonight it belongs to the birthday act.'
        ]
    },
    tv: {
        // Opens the full-size close-up instead of the dialog card (see
        // openTvView). These lines rotate as the caption beneath it.
        title: 'The Lyrics Screen',
        lines: [
            'The words roll and the pink sweep keeps the time, so the whole room can join in. And the whole room does.',
            'Tonight it is MacArthur Park, the Donna Summer version, all eight minutes of it. Jamar rarely looks up. He knows every word.'
        ]
    },
    speaker: {
        title: 'The PA Speakers',
        lines: [
            'The house pair, keeping the beat honest at about a hundred and five a minute. You can feel them from the booth, which is the point.',
            'Turned up exactly loud enough that nobody can hear whether you are on key. Karaoke engineering at its finest.'
        ]
    },
    micstand: {
        title: 'The Mic Stand',
        lines: [
            'The spare stand, politely unemployed. Jamar is a mic-in-hand performer and everyone knows it.',
            'It holds the mic between singers, which tonight means it holds nothing at all.'
        ]
    },
    console: {
        title: 'The Karaoke Machine',
        lines: [
            'The songbook, the queue, and the four chunky buttons that start the show. Note the queue: Jamar, then Jamar again.',
            'The birthday singer picks the setlist. That is not a house rule so much as a law of nature.'
        ]
    },
    appletini: {
        title: 'The Appletini',
        lines: [
            'Appletini, easy on the tini.',
            'Jamar’s between-verses drink, parked where he can find it.'
        ]
    },
    booth: {
        title: 'The Birthday Booth',
        lines: [
            'Best seat in the house: red vinyl, a clear view of the stage, and close enough to heckle with love.',
            'The open side is for you, by the way. The crew keeps a spot for whoever wanders in.'
        ]
    },
    drinks: {
        title: 'The Round',
        lines: [
            'A pitcher, a spare glass, and pretzels standing by. The spare glass is for the visitor. That would be you.',
            'The pretzels are for between verses. The pitcher is for after the big note lands.'
        ]
    },
    bar: {
        title: 'The Bar',
        lines: [
            'Dark walnut, a brass foot rail, and three taps. Everything a corner bar needs and nothing it does not.',
            'The stools are open tonight. Everyone is either in the booth or on their feet for the chorus.'
        ]
    },
    bottles: {
        title: 'The Back Bar',
        lines: [
            'Two shelves glowing like stained glass. The bartender arranges them by color and will not be talked out of it.',
            'The good stuff is on the top shelf, saved for occasions. A best friend\'s birthday qualifies.'
        ]
    },
    hightop: {
        title: 'The High-Top',
        lines: [
            'Standing room with a table, for people who plan to dance the moment the right song starts.',
            'The regulars claimed it hours ago. Their round has gone warm. The singalong took priority.'
        ]
    },
    dartboard: {
        title: 'The Dartboard',
        lines: [
            'Retired for the evening. House policy is no darts during a performance, and the house is correct.',
            'Mike holds the board record. Mike also set the previous record. Nobody else really plays.'
        ]
    },
    posters: {
        title: 'The Gig Posters',
        lines: [
            'Open mic Fridays and whoever The Corner Booth Trio are. Every good wall tells you what the room believes in.',
            'Ask about the trio and three people in this bar will look modest all of a sudden.'
        ]
    },
    stringlights: {
        title: 'The String Lights',
        lines: [
            'Warm little bulbs on a lazy sag, twinkling just enough to make everyone look their best.',
            'One of them flickers on its own schedule. The staff calls it ambiance and the staff is right.'
        ]
    },
    neon: {
        title: 'The Neon Sign',
        lines: [
            'KARAOKE, EVERY NIGHT, in pink and blue. It hums a little, flickers on occasion, and means every word.',
            'It has hung there long enough that the brick behind it is permanently blushing.'
        ]
    },
    banner: {
        title: 'The Banner',
        lines: [
            'HAPPY BIRTHDAY, JAMAR! Hung slightly crooked, the way every good party banner has been hung since the beginning of time.',
            'Steve taped it up before Jamar arrived. Mike supervised. The crookedness was a joint effort.'
        ]
    },
    discoball: {
        title: 'The Disco Ball',
        lines: [
            'Slowly turning, catching the stage wash, absolutely convinced it is load-bearing. In a way, it is.',
            'It has one job and it does that job at exactly one speed. The room would not have it any other way.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

// ---- The songbook ----------------------------------------------------------
// The jukebox's setlist. Real titles and artists (titles are not
// copyrightable), but every rolling line is ORIGINAL text in the song's
// spirit. Licensed lyrics never go on the screen: the site is live and
// the repo will be public. SONGBOOK[0] mirrors store.js's boot default.
const SONGBOOK = [
    {
        // Steve asked to open on the famous cake line. That exact line is
        // the licensed lyric, so this original opener bows to the moment
        // (the cake, the rain, the heartbreak) in our own words instead.
        label: 'MacArthur Park', artist: 'Donna Summer',
        title: 'MacArthur Park  •  Donna Summer',
        lines: [
            'The cake never made it in out of the rain',
            'But nobody came here tonight for the cake',
            'The strings swell up and the room sings on',
            'One more chorus before the dawn'
        ],
        secondsPerLine: 4.2
    },
    {
        label: "That's The Way It Is", artist: 'Celine Dion',
        title: "That's The Way It Is  •  Celine Dion",
        lines: [
            'When the road runs long and the lights burn low',
            'Keep believing more than you can know',
            'Somewhere down the line the answer shows',
            'And the whole room sings like it already knows'
        ],
        secondsPerLine: 4.4
    },
    {
        label: 'Three Times a Lady', artist: 'The Commodores',
        title: 'Three Times a Lady  •  The Commodores',
        lines: [
            'For every year and every dance',
            'For every patient second chance',
            'Raise the lights and let the slow song play',
            'Some thank yous take a whole song to say'
        ],
        secondsPerLine: 5.0
    }
];
let currentSongIndex = 0;

let dialogReturnFocus = null;

/** Open the bar dialog for a clicked prop: its title and a line from
 *  its pair (alternating, so a second click gives something new). Two
 *  props are special: the lyrics screen opens the close-up view, and
 *  the jukebox opens the song picker. */
function openPropDialog(kind) {
    if (kind === 'tv') { openTvView(); return; }
    if (kind === 'jukebox') { openJukebox(); return; }
    const content = PROP_CONTENT[kind];
    if (!content || !dialogModal) return;
    dialogOpen = true;
    track('click-prop', { kind });
    if (dialogTitle) dialogTitle.textContent = content.title;
    if (dialogMessage) dialogMessage.textContent = content.lines[propTick++ % content.lines.length];
    dialogReturnFocus = document.activeElement;
    dialogModal.classList.remove('hidden');
    const dismiss = dialogModal.querySelector('.dialog-primary');
    if (dismiss) dismiss.focus();
}

function closePropDialog() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    dialogOpen = false;
    const el = dialogReturnFocus;
    dialogReturnFocus = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

// ---- Karaoke screen close-up -----------------------------------------------
// Tapping the lyrics screen brings the wall TV up to full size instead of
// a dialog card, the way the interstate desk monitor works: updateBar
// keeps advancing the song in the main loop, and while the overlay is up
// the same painter re-paints the current frame into its canvas each
// animation frame. The sweep, the rolling lines, and the equalizer all
// keep going up close.

function openTvView() {
    if (!tvView) return;
    tvViewOpen = true;
    track('click-prop', { kind: 'tv' });
    const content = PROP_CONTENT.tv;
    if (tvCaption && content) tvCaption.textContent = content.lines[propTick++ % content.lines.length];
    dialogReturnFocus = document.activeElement;
    tvView.classList.remove('hidden');
    sizeTvCanvas();          // measure now that the overlay is laid out
    startTvRender();
    const closeBtn = tvView.querySelector('.tv-close');
    if (closeBtn) closeBtn.focus();
}

function closeTvView() {
    if (!tvView) return;
    tvView.classList.add('hidden');
    stopTvRender();
    tvViewOpen = false;
    const el = dialogReturnFocus;
    dialogReturnFocus = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

/** Size the close-up canvas to its displayed box at device pixels so the
 *  shared painter renders crisply. */
function sizeTvCanvas() {
    if (!tvCanvas) return;
    const rect = tvCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    tvCanvas.width = Math.max(2, Math.round(rect.width * dpr));
    tvCanvas.height = Math.max(2, Math.round(rect.height * dpr));
}

function startTvRender() {
    const ctx = tvCanvas && tvCanvas.getContext('2d');
    const loop = () => {
        if (!tvViewOpen || !ctx) return;
        drawTvTo(ctx, tvCanvas.width, tvCanvas.height);
        tvRaf = requestAnimationFrame(loop);
    };
    tvRaf = requestAnimationFrame(loop);
}

function stopTvRender() {
    if (tvRaf) cancelAnimationFrame(tvRaf);
    tvRaf = 0;
}

// ---- The jukebox song picker -----------------------------------------------
// Tapping the jukebox opens a small picker instead of a dialog card.
// Choosing a song hands it to store.js's setNowPlaying, so the lyrics
// screen switches mid-note and the whole room follows Jamar into it.

/** Build one button per SONGBOOK entry (once, at startup). */
function buildJukeboxSongList(signal) {
    if (!jukeboxSongs) return;
    SONGBOOK.forEach((song, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jukebox-song';
        const title = document.createElement('span');
        title.className = 'jukebox-song-title';
        title.textContent = song.label;
        const artist = document.createElement('span');
        artist.className = 'jukebox-song-artist';
        artist.textContent = song.artist;
        button.append(title, artist);
        button.addEventListener('click', () => chooseSong(i), { signal });
        jukeboxSongs.appendChild(button);
    });
}

/** Mark which song is on: the playing entry gets its chip and stays
 *  pressable (tapping it just restarts the song from the top). */
function refreshJukeboxSongList() {
    if (!jukeboxSongs) return;
    jukeboxSongs.querySelectorAll('.jukebox-song').forEach((button, i) => {
        const playing = i === currentSongIndex;
        button.classList.toggle('playing', playing);
        const song = SONGBOOK[i];
        button.setAttribute('aria-label',
            playing ? `${song.label} by ${song.artist}, now playing` : `Play ${song.label} by ${song.artist}`);
    });
}

function chooseSong(i) {
    currentSongIndex = i;
    setNowPlaying(SONGBOOK[i]);
    track('jukebox-select', { song: SONGBOOK[i].label });
    refreshJukeboxSongList();
    // The screen switching over is its own confirmation
    closeJukebox();
}

function openJukebox() {
    if (!jukeboxModal) return;
    jukeboxOpen = true;
    track('click-prop', { kind: 'jukebox' });
    refreshJukeboxSongList();
    dialogReturnFocus = document.activeElement;
    jukeboxModal.classList.remove('hidden');
    const current = jukeboxModal.querySelector('.jukebox-song.playing') ||
        jukeboxModal.querySelector('.jukebox-song');
    if (current) current.focus();
}

function closeJukebox() {
    if (!jukeboxModal) return;
    jukeboxModal.classList.add('hidden');
    jukeboxOpen = false;
    const el = dialogReturnFocus;
    dialogReturnFocus = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

/** Dismiss the welcome overlay and settle in for the show. */
function beginWatching() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-watching');
}

/** Wire the outward-facing links from JAMAR_CONFIG.site. There is no
 *  featured business here: the experience honors the builder's best
 *  friend, so the Home button goes to the serving site's root in the same
 *  tab (Phase 5 rule: the marketing pages live at every hosting domain's
 *  root). */
function applySiteLinks() {
    const site = JAMAR_CONFIG.site;
    const home = document.getElementById('home-btn');
    if (home) {
        home.href = site.home.path;
        home.removeAttribute('target');
        home.removeAttribute('rel');
        home.title = site.home.title;
        home.setAttribute('aria-label', site.home.title);
    }
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    // No day/night pass here: the bar is windowless and carries its own
    // lighting, set once at build time. The room provides all the motion.
    updateBar(deltaTime);
    updatePortraitControls(deltaTime);

    render();
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    const renderer = getRenderer();
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
}

// Dwell-time tracking: report a one-time session-end (with elapsed seconds) when
// the page is first hidden or torn down. Fires at most once per load. Note this
// means backgrounding the tab ends the measured session, so the number is a
// "time to first leave" — a reasonable lower bound on engagement.
let _sessionStart = 0;
let _sessionEnded = false;

function endSession() {
    if (_sessionEnded || !_sessionStart) return;
    _sessionEnded = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - _sessionStart) / 1000) });
}

export function getState() {
    return { ...state };
}

// ---- Boot -----------------------------------------------------------------

/** Best-effort check that the browser can create a WebGL context. */
function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
            (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

/** Route visitors whose browser can't run the 3D scene to the 2D site, with a
 *  brief note, instead of leaving them staring at a blank canvas. */
function fallbackTo2D() {
    try {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = document.getElementById('load-status');
        if (status) status.textContent = "This browser can't run the 3D view. Taking you to the standard site…";
    } catch (e) { /* ignore — we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

/** Start the experience, but fall back to the 2D site if WebGL is unavailable
 *  or the scene fails to build (so a hard failure never ends in a blank page).
 *  Note: errors thrown later inside the render loop are not auto-recovered. */
function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Bar] 3D init failed, falling back to the 2D site:', err);
        fallbackTo2D();
    });
}

// Auto-boot only in a browser. Under test (Node, no `document`) importing this
// module must stay side-effect-free rather than booting the whole 3D app.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}

// Exposed for unit tests only; production code uses the named export above.
export const __test__ = { bufToHex, hasWebGL };
