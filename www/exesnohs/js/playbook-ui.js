// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playbook-ui.js - Choosing a play.
 *
 * The overlay above the field: ten plays, each with its diagram, its name and a
 * description of where the receivers actually go, plus a choice of what defense
 * to face. playbook.js draws the diagrams; this file builds the cards around
 * them, handles the choosing, and remembers what was chosen.
 *
 * EVERY CONTROL IS A REAL BUTTON OR A REAL SELECT. No canvas hit testing, no
 * pointer-only paths. This game is unusual among the 3D scenes here in that its
 * whole interface is already discrete controls, and that is worth protecting
 * deliberately rather than by luck: a visitor can play the entire game from a
 * keyboard, and a screen reader gets a named list of plays rather than ten
 * unlabelled pictures.
 */
import { OffensivePlaybookClass } from './playbook.min.js';
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

/**
 * ALL SEVENTEEN PLAYS, WHICH IS WHAT THE 2D GAME HAS.
 *
 * `diagram` maps a play's slug to its drawPlay number, read off the 2D game's
 * PlaybookOverlay component. The mapping is NOT sequential and cannot be
 * guessed: pass8 draws diagram 11, jumbo2 draws 14, screen1 draws 13.
 *
 * SEVEN OF THESE WERE LEFT OUT ON A MISREADING, and it is worth writing down
 * because it cost the playbook 40% of its contents. The note here used to say
 * that pass1, pass3, pass4, pass6, pass7, slant1 and slant2 had their cases
 * "commented out in formationRouteQb, so they have diagrams but no routes".
 * The switch does only name ten slugs, but it has a `default:` that hands the
 * quarterback a full drop-back with boundaries, so every one of the seven runs.
 * Checked by playing them: they produce catches, incompletes and receivers who
 * travel 4 to 22 metres, which is a working play by any definition.
 *
 * `name` AND `blurb` ARE MEASURED FROM THE ROUTE SHAPE, which is the second
 * thing that was wrong. They used to be derived by running each play twelve
 * times and averaging where each receiver ENDED UP, and an end position throws
 * away the route: a receiver who runs deep and cuts back across finishes in the
 * same place as one who drifted. So a play whose four receivers run straight
 * down the field was called Deep Split and the name Four Verticals was on a
 * play where three of them break left.
 *
 * They are now taken from the whole path: depth, net lateral travel and where
 * the break falls. `pass4` really is four verticals, all four running 25m with
 * under half a metre of drift between them, and it now carries the name.
 */
export const PLAYS = [
    { slug: 'pass1', diagram: 1, name: 'Split Verticals',
      blurb: 'Two receivers straight down the middle while the other two peel to opposite sidelines.' },
    { slug: 'pass2', diagram: 2, name: 'Flood Left',
      blurb: 'All four go deep and three of them break the same way, flooding that side.' },
    { slug: 'pass3', diagram: 3, name: 'Deep Drift',
      blurb: 'Four deep routes with three drifting left, the widest crossing the field.' },
    { slug: 'pass4', diagram: 4, name: 'Four Verticals',
      blurb: 'All four receivers run straight down the field. Nobody breaks.' },
    { slug: 'pass5', diagram: 5, name: 'Deep Split',
      blurb: 'Four deep routes split either side of the field.' },
    { slug: 'pass6', diagram: 6, name: 'Three Short, One Deep',
      blurb: 'Three receivers stay underneath while one clears out deep to the left.' },
    { slug: 'pass7', diagram: 7, name: 'Stack Right',
      blurb: 'Two short to the right, with a deep route running either side of them.' },
    { slug: 'pass8', diagram: 11, name: 'Short Cross',
      blurb: 'Everybody works short, the widest pair drifting left.' },
    { slug: 'run1', diagram: 8, name: 'Run Right',
      blurb: 'Blockers work right while one receiver comes back to the left.' },
    { slug: 'run2', diagram: 9, name: 'Run Left',
      blurb: 'Every receiver works left, and none of them go deep.' },
    { slug: 'run3', diagram: 10, name: 'Run Middle',
      blurb: 'Short and medium routes through the middle of the field.' },
    { slug: 'jumbo1', diagram: 12, name: 'Jumbo Split',
      blurb: 'A heavy line, with the two receivers deep to opposite sidelines.' },
    { slug: 'jumbo2', diagram: 14, name: 'Jumbo Right',
      blurb: 'A heavy line, with both receivers working to the right.' },
    { slug: 'screen1', diagram: 13, name: 'Screen Left',
      blurb: 'One receiver stays short as a target while the other clears deep left.' },
    { slug: 'screen2', diagram: 15, name: 'Screen Short',
      blurb: 'Two receivers stay very short, with a medium route out to the right.' },
    { slug: 'slant1', diagram: 16, name: 'Twin Slants Right',
      blurb: 'Two receivers slant deep to the right while one crosses the other way.' },
    { slug: 'slant2', diagram: 17, name: 'Deep Crossers',
      blurb: 'Deep crossing routes both ways, the widest running clean across the field.' },
];

/** The defensive formations the library will actually run, in the order its
 *  own `defense` array lists them. */
export const DEFENSES = [
    'cover2', 'cover3', 'cover5', 'cover7', 'cover9', 'cover11', 'cover12',
    'cover13', 'cover14', 'cover15', 'cover16',
    'zone4', 'zone5', 'zone6', 'zone7', 'zone8', 'zone9', 'zone10', 'zone11',
];

/** 'cover13' reads as 'Cover 13'. Mechanical, so a new formation needs no
 *  table entry and no name can drift from its slug. */
const defenseLabel = (slug) => slug.replace(/^([a-z]+)(\d+)$/, (_m, w, n) =>
    `${w[0].toUpperCase()}${w.slice(1)} ${n}`);

const book = new OffensivePlaybookClass({});
let onChoose = null;
let onStartOver = null;
let settings = { lastPlay: '', defense: '' };

// ---- Persistence -----------------------------------------------------------

function load() {
    try {
        const raw = localStorage.getItem(CFG.storage.play);
        if (!raw) return;
        const stored = JSON.parse(raw);
        // A VISITOR'S SAVED CHOICE SURVIVES THE SPELLING FIX. This shipped
        // briefly writing `defence`, and the whole point of persisting a
        // preference is that somebody does not have to set it again. Read the
        // old key, write only the new one.
        if (stored.defence && !stored.defense) stored.defense = stored.defence;
        delete stored.defence;
        settings = { ...settings, ...stored };
    } catch (e) { /* private mode, or a value from an older shape. Defaults. */ }
}

function save() {
    try {
        localStorage.setItem(CFG.storage.play, JSON.stringify(settings));
    } catch (e) { /* nothing here is worth failing a play over */ }
}

// ---- Drawing the diagrams dark ---------------------------------------------

/**
 * THE DIAGRAMS ARE DRAWN IN THE 2D GAME'S PALETTE AND SHOWN IN OURS.
 *
 * playbook.js is a port and stays one (D7): its 1026 lines carry the exact
 * coordinates of sixteen plays and not one of them has been touched. What it
 * also carries is a colour scheme for a light page, and this page is a night
 * stadium. Ten near-white rectangles glowing out of a dark overlay is the first
 * thing the eye goes to, and the eye should be going to the plays.
 *
 * SO THE COLOURS ARE REMAPPED ON THE WAY OUT, not edited on the way in. Every
 * colour the ported file sets is one of eleven exact strings (grep says so:
 * 94 uses of the letter grey, 74 of B's blue, and so on down to one white and
 * one football brown). A small proxy over the 2D context watches `fillStyle`
 * and `strokeStyle` and swaps those eleven for their dark-ground equivalents.
 *
 * Two things fall out of doing it this way rather than as a filter. The ROUTE
 * COLOURS SURVIVE AS HUES, so A is still red on the card and red on the grass
 * and red on its throw button, which a CSS `invert` would have destroyed. And
 * anything the ported file draws that is NOT in the table comes through
 * untouched, so a colour arriving here that nobody planned for is visible
 * rather than silently wrong.
 *
 * The route hues are the same four `config.receivers` hands to the markers, so
 * there is still exactly one place a receiver's colour is decided.
 */
/** Light ink on a dark ground always reads thinner than the same weight the
 *  other way round, and every route in the ported file is one pixel. */
const DIAGRAM_LINE_BOOST = 1.4;

export const DIAGRAM_INK = {
    'rgb(235, 235, 235)': '#161d28',      // the card ground
    '30, 30, 30, 0.8': '235, 240, 248, 0.92',   // player letters
    '10, 10, 10, 0.9': '226, 232, 242, 0.95',   // heavier marks
    '50, 50, 50, 0.8': '150, 161, 178, 0.85',   // the quieter ones
    '125, 0, 0, 0.8': hexToRgba(CFG.receivers.wr1.ink, 0.95),
    '0, 0, 125, 0.8': hexToRgba(CFG.receivers.wr2.ink, 0.95),
    '125, 0, 125, 0.8': hexToRgba(CFG.receivers.wr3.ink, 0.95),
    '0, 125, 0, 0.8': hexToRgba(CFG.receivers.wr4.ink, 0.95),
    '0, 125, 0, 0.4': '120, 200, 140, 0.35',    // the line of scrimmage
    'rgb(111, 15, 10)': '#c2603a',        // the football
    'rgb(255, 255, 255)': '#12171f',      // ...and its lacing, now dark on it
};

/** '#ff6a5e' at 0.95 becomes '255, 106, 94, 0.95', which is the shape the
 *  ported drawing helpers wrap in `rgba(...)`. */
function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha}`;
}

/**
 * Hand a canvas a context that recolours as it draws.
 *
 * The ported methods find their canvas by selector and call `getContext('2d')`
 * on it themselves, so the swap has to happen on the element. Overriding
 * `getContext` for these ten canvases and nothing else keeps the whole trick
 * inside this function.
 *
 * The proxy forwards everything: methods are bound to the real context so
 * `this` is right, and only the two colour properties are intercepted on the
 * way in. Line width is nudged up because a one-pixel route drawn as dark ink
 * on paper is a one-pixel route drawn as light ink on slate, and light-on-dark
 * always looks thinner than the same weight the other way round.
 */
function themeCanvas(canvas) {
    if (!canvas.getContext) return canvas;
    const real = canvas.getContext('2d');
    if (!real) return canvas;
    const proxy = new Proxy(real, {
        get(target, prop) {
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, prop, value) {
            if ((prop === 'fillStyle' || prop === 'strokeStyle')
                && typeof value === 'string') {
                const key = value.startsWith('rgba(')
                    ? value.slice(5, -1) : value;
                const mapped = DIAGRAM_INK[key];
                if (mapped) {
                    target[prop] = mapped.startsWith('#') ? mapped : `rgba(${mapped})`;
                    return true;
                }
            }
            if (prop === 'lineWidth' && typeof value === 'number') {
                target[prop] = value * DIAGRAM_LINE_BOOST;
                return true;
            }
            target[prop] = value;
            return true;
        },
    });
    // The type argument is honoured rather than ignored, so this cannot quietly
    // hand a 2D context to something that asked for anything else.
    const native = canvas.getContext.bind(canvas);
    canvas.getContext = (type, ...rest) =>
        (type === '2d' ? proxy : native(type, ...rest));
    return canvas;
}

// ---- Building --------------------------------------------------------------

function buildDefenseRow() {
    const wrap = document.createElement('p');
    wrap.className = 'playbook-defense';

    const label = document.createElement('label');
    label.htmlFor = 'defense-select';
    label.textContent = 'Defense to face';
    wrap.appendChild(label);

    const select = document.createElement('select');
    select.id = 'defense-select';
    const random = document.createElement('option');
    random.value = '';
    random.textContent = 'Surprise me';
    select.appendChild(random);
    for (const slug of DEFENSES) {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = defenseLabel(slug);
        select.appendChild(opt);
    }
    select.value = settings.defense || '';
    select.addEventListener('change', () => {
        settings.defense = select.value;
        save();
    });
    wrap.appendChild(select);
    return wrap;
}

function buildCard(play) {
    const item = document.createElement('li');
    item.className = 'play-card';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'play-choose';
    button.dataset.slug = play.slug;

    const canvas = document.createElement('canvas');
    canvas.id = `play-diagram-${play.slug}`;
    canvas.width = 300;
    canvas.height = 150;
    // The diagram is decoration: the name and blurb below carry the same
    // information as text, so a screen reader is not read a picture it cannot
    // see. This is the "text alternative for every diagram" M3 asks for.
    canvas.setAttribute('aria-hidden', 'true');
    // Hand it a context that repaints the 2D game's light palette for a dark
    // room. Done here rather than in playbook.js, which is a port.
    themeCanvas(canvas);
    button.appendChild(canvas);

    const name = document.createElement('span');
    name.className = 'play-name';
    name.textContent = play.name;
    button.appendChild(name);

    const blurb = document.createElement('span');
    blurb.className = 'play-blurb';
    blurb.textContent = play.blurb;
    button.appendChild(blurb);

    // The "Last play" tag is not built here. See `markLastPlay`.
    button.addEventListener('click', () => choose(play.slug));
    item.appendChild(button);
    return item;
}

/**
 * MOVE THE "LAST PLAY" TAG TO THE PLAY THAT WAS ACTUALLY LAST.
 *
 * QA ITEM 1. It used to be built into the card, once, inside `initPlaybook`,
 * which runs a single time at boot against whatever was in localStorage when
 * the page loaded. `choose` then updated that stored value and never rebuilt
 * anything, so the tag stayed pinned to the play from the PREVIOUS VISIT for
 * the whole session however many plays were called. A returning visitor saw it
 * on a play they had not touched today, and a first-time visitor never saw it
 * at all.
 *
 * Re-applied every time the playbook opens, which is the only moment it can be
 * read, so it cannot go stale: there is nowhere for it to be wrong.
 */
function markLastPlay(root) {
    for (const tag of root.querySelectorAll('.play-last')) tag.remove();
    if (!settings.lastPlay) return;
    const button = root.querySelector(`.play-choose[data-slug="${settings.lastPlay}"]`);
    if (!button) return;
    const tag = document.createElement('span');
    tag.className = 'play-last';
    tag.textContent = 'Last play';
    button.appendChild(tag);
}

/** Draw every diagram. Must run AFTER the canvases are in the document,
 *  because the ported drawPlay methods find their canvas by selector. */
function drawAll() {
    for (const play of PLAYS) {
        const method = `drawPlay${play.diagram}`;
        if (typeof book[method] === 'function') {
            book[method](`#play-diagram-${play.slug}`);
        }
    }
}

function choose(slug) {
    settings.lastPlay = slug;
    save();
    hide();
    if (onChoose) onChoose(slug, settings.defense);
}

// ---- Public surface --------------------------------------------------------

/**
 * STARTING OVER, AND IT ASKS TWICE.
 *
 * QA ITEM 11: a visitor who has had three bad plays should not have to sit
 * through seven more to get a fresh ten. It lives here rather than in the HUD
 * because the playbook is where somebody between plays already is, and because
 * a control that can end a game should not be sitting next to the score during
 * one.
 *
 * The confirm is not decoration. A game now survives a reload (progress.js), so
 * this button destroys something real, and one press of a small word in a
 * corner is not enough intent for that. The second press is the decision; a
 * cancel or reopening the playbook puts it back.
 */
function buildStartOver() {
    const wrap = document.createElement('div');
    wrap.className = 'playbook-restart';

    const ask = document.createElement('button');
    ask.type = 'button';
    ask.className = 'playbook-restart-btn';
    ask.textContent = 'Start over';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'playbook-restart-btn is-confirm';
    confirm.textContent = 'Start over?';
    confirm.hidden = true;
    confirm.setAttribute('aria-label', 'Confirm starting a new game');

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'playbook-restart-btn';
    cancel.textContent = 'Keep playing';
    cancel.hidden = true;

    const settle = () => { ask.hidden = false; confirm.hidden = true; cancel.hidden = true; };
    ask.addEventListener('click', () => {
        ask.hidden = true;
        confirm.hidden = false;
        cancel.hidden = false;
        confirm.focus();
    });
    cancel.addEventListener('click', () => { settle(); ask.focus(); });
    confirm.addEventListener('click', () => {
        settle();
        if (onStartOver) onStartOver();
    });

    // appendChild rather than append: the headless DOM the suite boots this
    // module against implements one and not the other, and a builder that
    // throws leaves the playbook with no cards in it at all.
    wrap.appendChild(ask);
    wrap.appendChild(confirm);
    wrap.appendChild(cancel);
    return wrap;
}

/** Put the restart control back to its resting state, so a playbook that opens
 *  never opens mid-question. */
function settleStartOver(root) {
    const wrap = root.querySelector('.playbook-restart');
    if (!wrap) return;
    const buttons = wrap.querySelectorAll('.playbook-restart-btn');
    buttons.forEach((b, i) => { b.hidden = i !== 0; });
}

export function initPlaybook(handler, startOver = null) {
    onChoose = handler;
    onStartOver = startOver;
    load();

    const root = document.getElementById('playbook');
    if (!root) return;
    const head = root.querySelector('.playbook-head');
    if (head && onStartOver) head.appendChild(buildStartOver());

    const body = root.querySelector('.playbook-body');
    if (!body) return;
    body.textContent = '';
    body.appendChild(buildDefenseRow());

    const grid = document.createElement('ul');
    grid.className = 'playbook-grid';
    for (const play of PLAYS) grid.appendChild(buildCard(play));
    body.appendChild(grid);

    drawAll();
    return root;
}

export function show() {
    const root = document.getElementById('playbook');
    if (!root) return;
    root.hidden = false;
    // Read the last play HERE, every time, rather than once at boot: it is the
    // only moment at which the answer is current (QA item 1).
    markLastPlay(root);
    settleStartOver(root);
    // Focus the first play so a keyboard visitor lands somewhere useful rather
    // than at the top of the document.
    const first = root.querySelector('.play-choose');
    if (first) first.focus();
}

export function hide() {
    const root = document.getElementById('playbook');
    if (root) root.hidden = true;
}

export function isOpen() {
    const root = document.getElementById('playbook');
    return !!root && !root.hidden;
}

/** The stored preferences, for anything that needs to know what is selected. */
export function getSettings() {
    return { ...settings };
}
