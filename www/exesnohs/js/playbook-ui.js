// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playbook-ui.js - Choosing a play.
 *
 * The overlay above the field: ten plays, each with its diagram, its name and a
 * description of where the receivers actually go, plus a choice of what defence
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
 * The ten live plays.
 *
 * `diagram` maps a play's slug to its drawPlay number, read off the 2D game's
 * PlaybookOverlay component. The mapping is NOT sequential and cannot be
 * guessed: pass8 draws diagram 11, jumbo2 draws 14, screen1 draws 13.
 *
 * The library defines seven more (pass1, pass3, pass4, pass6, pass7, slant1,
 * slant2) whose cases are commented out in formationRouteQb, so they have
 * diagrams but no routes. They are deliberately not listed.
 *
 * `blurb` IS DERIVED, NOT INVENTED. Each one was measured by running the play
 * twelve times through the real simulation and averaging where each receiver
 * ended up, because player speeds are randomised per snap. Nothing here claims
 * a route the code does not actually run.
 */
export const PLAYS = [
    { slug: 'pass2', diagram: 2, name: 'Four Verticals',
      blurb: 'All four receivers run deep, three of them breaking left.' },
    { slug: 'pass5', diagram: 5, name: 'Deep Split',
      blurb: 'Four deep routes split either side of the field.' },
    { slug: 'pass8', diagram: 11, name: 'Short Cross',
      blurb: 'Three receivers work short and across, one clears out deep left.' },
    { slug: 'screen1', diagram: 13, name: 'Screen Left',
      blurb: 'One receiver stays short as a target, the other clears deep left.' },
    { slug: 'screen2', diagram: 15, name: 'Screen Short',
      blurb: 'Two short options underneath with a medium route to the right.' },
    { slug: 'run1', diagram: 8, name: 'Run Right',
      blurb: 'Three receivers block short right while one clears deep.' },
    { slug: 'run2', diagram: 9, name: 'Run Left',
      blurb: 'Everybody works short and to the left.' },
    { slug: 'run3', diagram: 10, name: 'Run Middle',
      blurb: 'Short and medium routes through the middle of the field.' },
    { slug: 'jumbo1', diagram: 12, name: 'Jumbo Split',
      blurb: 'A heavy line, with two receivers deep on opposite sides.' },
    { slug: 'jumbo2', diagram: 14, name: 'Jumbo Right',
      blurb: 'A heavy line, with both receivers deep to the right.' },
];

/** The defensive formations the library will actually run, in the order its
 *  own `defense` array lists them. */
export const DEFENCES = [
    'cover2', 'cover3', 'cover5', 'cover7', 'cover9', 'cover11', 'cover12',
    'cover13', 'cover14', 'cover15', 'cover16',
    'zone4', 'zone5', 'zone6', 'zone7', 'zone8', 'zone9', 'zone10', 'zone11',
];

/** 'cover13' reads as 'Cover 13'. Mechanical, so a new formation needs no
 *  table entry and no name can drift from its slug. */
const defenceLabel = (slug) => slug.replace(/^([a-z]+)(\d+)$/, (_m, w, n) =>
    `${w[0].toUpperCase()}${w.slice(1)} ${n}`);

const book = new OffensivePlaybookClass({});
let onChoose = null;
let settings = { lastPlay: '', defence: '' };

// ---- Persistence -----------------------------------------------------------

function load() {
    try {
        const raw = localStorage.getItem(CFG.storage.play);
        if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) { /* private mode, or a value from an older shape. Defaults. */ }
}

function save() {
    try {
        localStorage.setItem(CFG.storage.play, JSON.stringify(settings));
    } catch (e) { /* nothing here is worth failing a play over */ }
}

// ---- Building --------------------------------------------------------------

function buildDefenceRow() {
    const wrap = document.createElement('p');
    wrap.className = 'playbook-defence';

    const label = document.createElement('label');
    label.htmlFor = 'defence-select';
    label.textContent = 'Defence to face';
    wrap.appendChild(label);

    const select = document.createElement('select');
    select.id = 'defence-select';
    const random = document.createElement('option');
    random.value = '';
    random.textContent = 'Surprise me';
    select.appendChild(random);
    for (const slug of DEFENCES) {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = defenceLabel(slug);
        select.appendChild(opt);
    }
    select.value = settings.defence || '';
    select.addEventListener('change', () => {
        settings.defence = select.value;
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
    button.appendChild(canvas);

    const name = document.createElement('span');
    name.className = 'play-name';
    name.textContent = play.name;
    button.appendChild(name);

    const blurb = document.createElement('span');
    blurb.className = 'play-blurb';
    blurb.textContent = play.blurb;
    button.appendChild(blurb);

    if (settings.lastPlay === play.slug) {
        const last = document.createElement('span');
        last.className = 'play-last';
        last.textContent = 'Last play';
        button.appendChild(last);
    }

    button.addEventListener('click', () => choose(play.slug));
    item.appendChild(button);
    return item;
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
    if (onChoose) onChoose(slug, settings.defence);
}

// ---- Public surface --------------------------------------------------------

export function initPlaybook(handler) {
    onChoose = handler;
    load();

    const root = document.getElementById('playbook');
    if (!root) return;
    const body = root.querySelector('.playbook-body');
    if (!body) return;
    body.textContent = '';
    body.appendChild(buildDefenceRow());

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
