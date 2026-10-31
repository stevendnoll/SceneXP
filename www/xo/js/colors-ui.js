// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * colors-ui.js - The Team colors card: a jersey, its letter, a helmet, pants
 * and shoes for each team, a stripe over the helmet and stripes down the pants
 * (each a switch with a picker beside it once it is on), a field, the
 * warnings, Reset and Done.
 *
 * THE PICKERS ARE THE BROWSER'S OWN, `<input type="color">`, so there is no
 * library and every platform gets the picker its visitors already know.
 *
 * A STRIPE SWITCHED ON GETS A COLOR DECIDED FOR IT (colors.js `accentFor`),
 * and its picker appears beside the switch showing that color, so a visitor
 * who wants their own goes straight to it. Switched off, the picker goes and
 * the choice of color with it: switching on again is the decided color again.
 *
 * EVERY CHANGE SHOWS AT ONCE AND IS KEPT WHEN A PICKER CLOSES. A picker fires
 * `input` continuously while it is dragged and `change` once when it is let go,
 * so the colors are put on the field on `input` (coalesced to one paint a
 * frame, and the field's texture to one every `repaintEvery` seconds) and saved
 * on `change`, on Reset and on Done.
 *
 * The markup is static in index.html. This file only wires it and keeps it
 * truthful. What the colors ARE lives in colors.js, and what they are put ON is
 * main.js's business, handed in as `apply`.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import {
    teamColors, setColors, resetColors, saveColors, jerseyOf, helmetOf, markOf, pantsOf, shoesOf,
    helmetStripeOf, pantsStripeOf, fieldColor, warningsFor,
} from './colors.min.js';

const TEAMS = [[0, 'x'], [1, 'o']];
/** The plain pickers on a team's section: the tail of the input's id, the part
 *  of the kit it sets, and what that part is now. */
const PICKERS = [
    ['jersey', 'jersey', jerseyOf],
    ['letter', 'mark', markOf],
    ['helmet', 'helmet', helmetOf],
    ['pants', 'pants', pantsOf],
    ['shoes', 'shoes', shoesOf],
];
/** The stripes: a switch at the id, and a picker at the id plus `-color`. */
const STRIPES = [
    ['helmet-stripe', 'helmetStripe', helmetStripeOf],
    ['pants-stripe', 'pantsStripe', pantsStripeOf],
];

let hooks = { apply() {}, report() {}, announce() {} };
let wired = false;
let session = null;
let armedUntil = -Infinity;
const due = { teams: false, field: false, frame: false, fieldAt: -Infinity, fieldTimer: 0 };

const el = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextFrame = (fn) => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(fn) : setTimeout(fn, 16));

/**
 * Wire the card once. `apply({ teams, field })` puts the current colors on the
 * game (the kits, rings and fans when `teams`, the turf when `field`),
 * `report(action, detail)` is telemetry, and `announce(text)` the HUD's live
 * region.
 */
export function initColorsCard({ apply, report, announce } = {}) {
    hooks = {
        apply: apply || (() => {}),
        report: report || (() => {}),
        announce: announce || (() => {}),
    };
    if (wired) return;
    wired = true;
    if (typeof document !== 'undefined') document.addEventListener('click', swallowEarlyTap, true);

    for (const [team, id] of TEAMS) {
        for (const [tail, part] of PICKERS) wirePicker(el(`colors-${id}-${tail}`), team, part);
        const helmet = el(`colors-${id}-helmet`);
        const match = el(`colors-${id}-match`);
        if (match) {
            // Back to following the jersey. The button hides itself, so focus
            // goes to the helmet picker it was about rather than to nowhere.
            match.addEventListener('click', () => {
                setColors({ teams: { [team]: { helmet: null } } });
                changed({ teams: true });
                keep();
                if (helmet) helmet.focus();
            });
        }
        for (const [tail, part] of STRIPES) {
            const on = el(`colors-${id}-${tail}`);
            if (on) {
                // On, in the color decided for it (null), or off (false).
                on.addEventListener('change', () => {
                    setColors({ teams: { [team]: { [part]: on.checked ? null : false } } });
                    changed({ teams: true });
                    keep();
                });
            }
            wirePicker(el(`colors-${id}-${tail}-color`), team, part);
        }
    }
    const field = el('colors-field');
    if (field) {
        field.addEventListener('input', () => {
            setColors({ field: field.value });
            changed({ field: true });
        });
        field.addEventListener('change', () => {
            // The last position the picker was let go at is always painted.
            setColors({ field: field.value });
            changed({ field: true, now: true });
            keep();
        });
    }
    const reset = el('colors-reset');
    if (reset) {
        reset.addEventListener('click', () => {
            resetColors();
            changed({ teams: true, field: true, now: true });
            keep();
            hooks.announce('The original colors are back.');
        });
    }
    const done = el('colors-done');
    if (done) done.addEventListener('click', () => closeColorsCard());
}

/**
 * A color picker that sets `part` of `team`'s kit. `change` reads the value as
 * well as keeping it: a picker's last `input` is not promised to carry the
 * value it was let go at.
 */
function wirePicker(input, team, part) {
    if (!input) return;
    const take = () => setColors({ teams: { [team]: { [part]: input.value } } });
    input.addEventListener('input', () => { take(); changed({ teams: true }); });
    input.addEventListener('change', () => { take(); changed({ teams: true }); keep(); });
}

/** Whether `node` is `root` or inside it. */
function within(root, node) {
    for (let n = node; n; n = n.parentElement || n.parentNode) {
        if (n === root) return true;
    }
    return false;
}

/**
 * THE CARD IS ARMED FOR A MOMENT AFTER IT OPENS.
 *
 * On a phone the tap on Team colors was opening the X's jersey picker too: a
 * card that opens where a finger already is gets pressed by that finger, by the
 * click a touch screen sends after the touch, or by a second tap from somebody
 * who has not seen it arrive. For `colors.armFor` seconds a pointer click inside
 * the card is swallowed, in the capture phase, ahead of the picker it would
 * open. Nobody reads a new card and picks a color that fast, so nothing meant is
 * lost. The keyboard is exempt: Enter and Space arrive as a click with `detail`
 * 0, and a keyboard is never under a finger.
 */
function swallowEarlyTap(event) {
    if (!session || now() >= armedUntil || !event.detail) return;
    const card = el('colors');
    if (!card || !within(card, event.target)) return;
    event.preventDefault();
    event.stopPropagation();
}

/** Keep what is chosen for next time. */
function keep() {
    saveColors();
}

/**
 * Something changed: bring the inputs, the Match jersey buttons and the warning
 * up to date at once, and put the colors on the game at the next frame. The
 * field's texture is a 2048-pixel upload, so it is repainted at most every
 * `repaintEvery` seconds while a picker is dragged, and at once when `now`.
 */
function changed({ teams = false, field = false, now: immediate = false } = {}) {
    refresh();
    due.teams = due.teams || teams;
    due.field = due.field || field;
    if (immediate) {
        flush(true);
        return;
    }
    if (due.frame) return;
    due.frame = true;
    nextFrame(() => {
        due.frame = false;
        flush(false);
    });
}

function flush(force) {
    const teams = due.teams;
    let field = false;
    if (due.field) {
        const wait = CFG.colors.repaintEvery * 1000 - (now() - due.fieldAt);
        if (force || wait <= 0) {
            field = true;
            due.field = false;
            due.fieldAt = now();
            if (due.fieldTimer) { clearTimeout(due.fieldTimer); due.fieldTimer = 0; }
        } else if (!due.fieldTimer) {
            due.fieldTimer = setTimeout(() => {
                due.fieldTimer = 0;
                flush(false);
            }, wait);
        }
    }
    due.teams = false;
    if (teams || field) hooks.apply({ teams, field });
}

/** The card, saying what is chosen now. */
function refresh() {
    const colors = teamColors();
    for (const [team, id] of TEAMS) {
        // Never written back while the visitor is dragging that very picker's
        // value: it already says it, and some browsers restart the drag.
        for (const [tail, , now] of PICKERS) {
            const input = el(`colors-${id}-${tail}`);
            if (input && input.value !== now(team)) input.value = now(team);
        }
        // Only offered once the helmet has a color of its own.
        const match = el(`colors-${id}-match`);
        if (match) match.hidden = !colors.teams[team].helmet;
        // A stripe's switch says whether it is on, and its picker is there
        // only while it is, saying its color.
        for (const [tail, , now] of STRIPES) {
            const stripe = now(team);
            const on = el(`colors-${id}-${tail}`);
            const color = el(`colors-${id}-${tail}-color`);
            if (on && on.checked !== !!stripe) on.checked = !!stripe;
            if (color) {
                color.hidden = !stripe;
                if (stripe && color.value !== stripe) color.value = stripe;
            }
        }
    }
    const field = el('colors-field');
    if (field && field.value !== fieldColor()) field.value = fieldColor();

    // THE WARNING IS A LIVE REGION, so it is only rewritten when what it says
    // changes: dragging a picker through fifty shades of the same problem must
    // not read the same sentence fifty times.
    const note = el('colors-warning');
    if (note) {
        const text = warningsFor().map((w) => w.text).join(' ');
        if (note.textContent !== text) note.textContent = text;
        note.hidden = !text;
    }
}

/**
 * OPEN THE CARD over the field, with `back` to call when it closes. Escape and
 * Done both close it. Whether a browser's own open picker swallows the Escape
 * that closes it, or lets it through to close the card as well, differs by
 * platform and is a thing to check on real devices.
 */
export function showColorsCard(back) {
    const card = el('colors');
    if (!card) { if (back) back(); return; }
    session = { back, startedAs: JSON.stringify(teamColors()), onEscape: null };
    refresh();
    session.onEscape = (event) => {
        if (event.key !== 'Escape' || card.hidden) return;
        event.preventDefault();
        closeColorsCard();
    };
    document.addEventListener('keydown', session.onEscape);
    card.hidden = false;
    armedUntil = now() + CFG.colors.armFor * 1000;
    hooks.report('team-colors', {});
    // THE CARD TAKES FOCUS, NOT ITS FIRST PICKER. Focusing a color input from
    // inside the tap that opened the card opened the picker on a phone. The
    // dialog is announced by its title and description, and Tab goes to the
    // X's jersey next.
    const panel = el('colors-panel');
    if (panel) panel.focus();
}

/** Close it: finish any paint still waiting, keep the choice, and go back. */
export function closeColorsCard() {
    const card = el('colors');
    if (!session || !card || card.hidden) return;
    const { back, startedAs, onEscape } = session;
    session = null;
    if (due.field || due.teams) flush(true);
    keep();
    card.hidden = true;
    if (onEscape) document.removeEventListener('keydown', onEscape);
    hooks.report('set-colors', {
        kind: JSON.stringify(teamColors()) === startedAs ? 'unchanged' : 'changed',
    });
    if (back) back();
}

/** Whether the card is open, for the suite and the frame loop. */
export function colorsCardOpen() {
    return !!session;
}
