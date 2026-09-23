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
import { XO_CONFIG as CFG } from './config.min.js';
import { muteButton } from './hud.min.js';
import { autoJump, setAutoJump } from './jump.min.js';

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
    { slug: 'pass7', diagram: 7, name: 'Stack Right',
      blurb: 'Two short to the right, with a deep route running either side of them.' },
    { slug: 'pass8', diagram: 11, name: 'Short Cross',
      blurb: 'Everybody works short, the widest pair drifting left.' },
    { slug: 'screen1', diagram: 13, name: 'Screen Left',
      blurb: 'One receiver stays short as a target while the other clears deep left.' },
    { slug: 'pass2', diagram: 2, name: 'Flood Left',
      blurb: 'All four go deep and three of them break the same way, flooding that side.' },
    { slug: 'pass4', diagram: 4, name: 'Four Verticals',
      blurb: 'All four receivers run straight down the field. Nobody breaks.' },
    { slug: 'pass3', diagram: 3, name: 'Deep Drift',
      blurb: 'Four deep routes with three drifting left, the widest crossing the field.' },
    { slug: 'run1', diagram: 8, name: 'Run Right',
      blurb: 'Blockers work right while one receiver comes back to the left.' },
    { slug: 'pass1', diagram: 1, name: 'Split Verticals',
      blurb: 'Two receivers straight down the middle while the other two peel to opposite sidelines.' },
    { slug: 'pass5', diagram: 5, name: 'Deep Split',
      blurb: 'Four deep routes split either side of the field.' },
    { slug: 'pass6', diagram: 6, name: 'Three Short, One Deep',
      blurb: 'Three receivers stay underneath while one clears out deep to the left.' },
    { slug: 'run2', diagram: 9, name: 'Run Left',
      blurb: 'Every receiver works left, and none of them go deep.' },
    { slug: 'run3', diagram: 10, name: 'Run Middle',
      blurb: 'Short and medium routes through the middle of the field.' },
    { slug: 'jumbo1', diagram: 12, name: 'Jumbo Split',
      blurb: 'A heavy line, with the two receivers deep to opposite sidelines.' },
    { slug: 'jumbo2', diagram: 14, name: 'Jumbo Right',
      blurb: 'A heavy line, with both receivers working to the right.' },
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
const SVG_NS = 'http://www.w3.org/2000/svg';
let onChoose = null;
let onStartOver = null;
/** Opens the rules, and is handed the function that brings the book back. */
let onHelp = null;
/** The Team colors card (colors-ui.js), handed a way back to the book. */
let onColors = null;
/** Told when the defense is changed, for the usage log (see telemetry.js). */
let onDefense = null;
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
        if (onDefense) onDefense(select.value);
    });
    wrap.appendChild(select);
    return wrap;
}

function buildCard(play, repeat = false) {
    const item = document.createElement('li');
    item.className = repeat ? 'play-card is-repeat' : 'play-card';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'play-choose';
    button.dataset.slug = play.slug;
    if (repeat) {
        // THE SAME PLAY IN TWO PLACES NEEDS TWO NAMES, in the document and to
        // anything reading it out. An id may appear once, and a control that
        // announces itself identically twice is a visitor wondering which one
        // they are on.
        button.dataset.repeat = 'true';
        button.setAttribute('aria-label', `${play.name}, your last play, again`);
    }

    const canvas = document.createElement('canvas');
    canvas.id = repeat ? `play-diagram-repeat-${play.slug}` : `play-diagram-${play.slug}`;
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
    button.addEventListener('click', () => choose(play.slug, repeat));
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
    // ALL of them, because the last play now appears twice: once at the top of
    // the book and once where it always lives.
    const buttons = root.querySelectorAll(
        `.play-choose[data-slug="${settings.lastPlay}"]`
    );
    for (const button of buttons) {
        const tag = document.createElement('span');
        tag.className = 'play-last';
        tag.textContent = 'Last play';
        button.appendChild(tag);
    }
}

/**
 * PUT THE LAST PLAY AT THE TOP OF THE BOOK, AND LEAVE IT WHERE IT LIVES.
 *
 * The 2D game does exactly this: the play you just called is the first card in
 * the book AND is still in its own place, so a visitor running the same play
 * twice does not go hunting for it, and one browsing the book still finds it
 * where they left it.
 *
 * REBUILT ON EVERY OPEN, like the tag itself, because the play that was last is
 * only knowable at the moment the book opens. The card is a second, separate
 * card rather than a moved one: moving it would leave a hole in the grid and
 * change where every other play sits from one play to the next, which is the
 * one thing a book you are learning to read must not do.
 */
function syncRepeatCard(root) {
    const grid = root.querySelector('.playbook-grid');
    if (!grid) return;
    for (const old of grid.querySelectorAll('.play-card.is-repeat')) old.remove();
    if (!settings.lastPlay) return;
    const play = PLAYS.find((p) => p.slug === settings.lastPlay);
    if (!play) return;

    const card = buildCard(play, true);
    grid.insertBefore(card, grid.firstChild);
    // AFTER it is in the document: the ported drawPlay methods find their
    // canvas by selector, so one that has not been inserted is not there.
    const method = `drawPlay${play.diagram}`;
    if (typeof book[method] === 'function') {
        book[method](`#play-diagram-repeat-${play.slug}`);
    }
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

/** `repeat` is whether it was the "your last play" card at the top of the book,
 *  which the usage log wants to know and nothing else here does. */
function choose(slug, repeat = false) {
    settings.lastPlay = slug;
    save();
    hide();
    if (onChoose) onChoose(slug, settings.defense, { repeat });
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
    // The visible words first, so voice control can say what it sees (WCAG
    // 2.5.3). It was "Confirm starting a new game", which "Start over?" is not.
    confirm.setAttribute('aria-label', 'Start over? Yes, start a new game');

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

/** A question mark in a circle, drawn the way the sound button's speaker is. */
function helpIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'hud-mute-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '12');
    ring.setAttribute('cy', '12');
    ring.setAttribute('r', '9');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'currentColor');
    ring.setAttribute('stroke-width', '1.9');
    svg.appendChild(ring);

    const hook = document.createElementNS(SVG_NS, 'path');
    hook.setAttribute('d', 'M9.3 9.2a2.8 2.8 0 1 1 3.4 3.3v1.6');
    hook.setAttribute('fill', 'none');
    hook.setAttribute('stroke', 'currentColor');
    hook.setAttribute('stroke-width', '1.9');
    hook.setAttribute('stroke-linecap', 'round');
    hook.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(hook);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', '12.1');
    dot.setAttribute('cy', '17.4');
    dot.setAttribute('r', '1.05');
    dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
    return svg;
}

/**
 * HOW TO PLAY, AND IT LEADS THE ROW.
 *
 * The welcome card was a one-time read: past "Take the field" there was no way
 * back to the rules, the scoring ladder or the directory link without a reload.
 * It sits with the sound and Start over because those are the controls about
 * the GAME rather than the next play, and it goes first because it is the one
 * a new visitor is looking for and the only one of the three that changes
 * nothing.
 *
 * THE BOOK STEPS ASIDE RATHER THAN CLOSING. `hide` would take the "Keep this
 * play" button and its Escape handler with it, and a visitor who opened the
 * book to change a play, read the rules and came back would have lost the way
 * out of the change. Only one aria-modal dialog may be showing at a time (the
 * focus trap wraps the last one it finds), so it is hidden, not layered under.
 */
/** A jersey, drawn in the same line weight as the question mark beside it. */
function jerseyIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'hud-mute-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shirt = document.createElementNS(SVG_NS, 'path');
    shirt.setAttribute('d', 'M8.6 3.5 4 6.1l1.9 3.7 2.2-1V20.5h7.8V8.8l2.2 1L20 6.1l-4.6-2.6a3.4 3.4 0 0 1-6.8 0z');
    shirt.setAttribute('fill', 'none');
    shirt.setAttribute('stroke', 'currentColor');
    shirt.setAttribute('stroke-width', '1.8');
    shirt.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(shirt);
    return svg;
}

/**
 * TEAM COLORS, BETWEEN HOW TO PLAY AND THE SOUND. It opens the Team colors card
 * and steps the book aside the way How to play does, for the same reason: a
 * change of play waiting to be kept has to survive the trip.
 */
function buildColors() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playbook-restart-btn playbook-help playbook-colors';
    btn.appendChild(jerseyIcon());
    const label = document.createElement('span');
    label.textContent = 'Team colors';
    btn.appendChild(label);
    btn.addEventListener('click', () => {
        const root = document.getElementById('playbook');
        if (!root || !onColors) return;
        root.hidden = true;
        onColors(() => {
            root.hidden = false;
            settleStartOver(root);
            btn.focus();
        });
    });
    return btn;
}

function buildHelp() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playbook-restart-btn playbook-help';
    btn.appendChild(helpIcon());
    const label = document.createElement('span');
    label.textContent = 'How to play';
    btn.appendChild(label);
    btn.addEventListener('click', () => {
        const root = document.getElementById('playbook');
        if (!root || !onHelp) return;
        root.hidden = true;
        onHelp(() => {
            root.hidden = false;
            settleStartOver(root);
            btn.focus();
        });
    });
    return btn;
}

/**
 * AUTO JUMP (2026-09-23), BESIDE THE SOUND. Since that day the visitor times
 * the receiver's jump, and this is the way back to the receivers jumping by
 * themselves, for anybody who cannot make a timed press or would rather just
 * watch. Off by default. It lives here because this is the screen a visitor
 * sits on between plays, and it takes effect from the next snap.
 *
 * Worded like the sound button beside it, "Auto jump off" and "Auto jump on",
 * with `aria-pressed` saying the same thing to a screen reader.
 */
function buildAutoJump(onChange) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playbook-restart-btn playbook-autojump';
    const paint = () => {
        const on = autoJump();
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? 'Auto jump on' : 'Auto jump off';
    };
    btn.addEventListener('click', () => {
        const on = setAutoJump(!autoJump());
        paint();
        if (onChange) onChange(on);
    });
    paint();
    return btn;
}

export function initPlaybook(handler, startOver = null,
    { defense = null, help = null, colors = null, autoJumpChanged = null } = {}) {
    onChoose = handler;
    onStartOver = startOver;
    onDefense = defense;
    onHelp = help;
    onColors = colors;
    load();

    const root = document.getElementById('playbook');
    if (!root) return;
    const head = root.querySelector('.playbook-head');
    if (head) {
        /**
         * THE SOUND CONTROL SITS WITH START OVER, which is QA round
         * twenty-seven item 3. Between plays this screen covers the HUD bar,
         * so the only mute in the game is behind the one panel a visitor
         * spends the most time looking at. hud.js builds it so both buttons
         * say the same thing, and the pair share a row because they are the
         * two things on this screen that are about the GAME rather than about
         * the next play.
         */
        const controls = document.createElement('div');
        controls.className = 'playbook-controls';
        if (onHelp) controls.appendChild(buildHelp());
        if (onColors) controls.appendChild(buildColors());
        const mute = muteButton();
        if (mute) controls.appendChild(mute);
        controls.appendChild(buildAutoJump(autoJumpChanged));
        if (onStartOver) controls.appendChild(buildStartOver());
        if (onHelp || mute || onStartOver) head.appendChild(controls);
    }

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

/**
 * SHOW THE BOOK.
 *
 * `opts.canCancel` is the difference between the two reasons it opens. Between
 * plays there is no way out but forward, and that is right: a play has to be
 * called. Opened over a formation by "Change play" it is a second thought, and
 * a second thought has to be allowed to be a third one, so it grows a way back
 * and answers Escape.
 */
export function show(opts = {}) {
    const root = document.getElementById('playbook');
    if (!root) return;
    root.hidden = false;
    setCancel(root, opts.canCancel ? opts.onCancel : null);
    // Read the last play HERE, every time, rather than once at boot: it is the
    // only moment at which the answer is current (QA item 1).
    syncRepeatCard(root);
    markLastPlay(root);
    settleStartOver(root);
    // Focus the first play so a keyboard visitor lands somewhere useful rather
    // than at the top of the document.
    const first = root.querySelector('.play-choose');
    if (first) first.focus();
}

export function hide() {
    const root = document.getElementById('playbook');
    if (!root) return;
    root.hidden = true;
    setCancel(root, null);
}

/**
 * The way back out, and the Escape key with it.
 *
 * BOTH LIVE AND DIE TOGETHER, in one function, because the failure here is a
 * listener that outlives the button: opened, cancelled and opened again for a
 * different reason, an Escape handler left behind would close a book that has
 * to be answered. Removing and rebuilding is cheaper to reason about than
 * tracking whether one is already installed.
 */
let escapeCancel = null;

function setCancel(root, onCancel) {
    const head = root.querySelector('.playbook-head');
    const old = root.querySelector('.playbook-cancel');
    if (old) old.remove();
    if (escapeCancel) {
        document.removeEventListener('keydown', escapeCancel);
        escapeCancel = null;
    }
    if (!onCancel || !head) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playbook-restart-btn playbook-cancel';
    btn.textContent = 'Keep this play';
    btn.setAttribute('aria-keyshortcuts', 'Escape');
    btn.addEventListener('click', onCancel);
    head.appendChild(btn);

    escapeCancel = (event) => {
        // Hidden also covers the rules card opened from How to play, which
        // steps the book aside and closes on the same press (hud.js `showHelp`).
        if (event.key !== 'Escape' || root.hidden) return;
        event.preventDefault();
        onCancel();
    };
    document.addEventListener('keydown', escapeCancel);
}

export function isOpen() {
    const root = document.getElementById('playbook');
    return !!root && !root.hidden;
}

/** The stored preferences, for anything that needs to know what is selected. */
export function getSettings() {
    return { ...settings };
}
