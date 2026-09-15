// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * colors-ui.js - The Team colors card: a jersey and a helmet for each team, a
 * field, the warnings, Reset and Done.
 *
 * THE PICKERS ARE THE BROWSER'S OWN, `<input type="color">`, so there is no
 * library and every platform gets the picker its visitors already know.
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
    teamColors, setColors, resetColors, saveColors, jerseyOf, helmetOf, fieldColor, warningsFor,
} from './colors.min.js';

const TEAMS = [[0, 'x'], [1, 'o']];

let hooks = { apply() {}, report() {}, announce() {} };
let wired = false;
let session = null;
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

    for (const [team, id] of TEAMS) {
        const jersey = el(`colors-${id}-jersey`);
        const helmet = el(`colors-${id}-helmet`);
        const match = el(`colors-${id}-match`);
        // `change` reads the value as well as keeping it: a picker's last
        // `input` is not promised to carry the value it was let go at.
        if (jersey) {
            const take = () => setColors({ teams: { [team]: { jersey: jersey.value } } });
            jersey.addEventListener('input', () => { take(); changed({ teams: true }); });
            jersey.addEventListener('change', () => { take(); changed({ teams: true }); keep(); });
        }
        if (helmet) {
            const take = () => setColors({ teams: { [team]: { helmet: helmet.value } } });
            helmet.addEventListener('input', () => { take(); changed({ teams: true }); });
            helmet.addEventListener('change', () => { take(); changed({ teams: true }); keep(); });
        }
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
        const jersey = el(`colors-${id}-jersey`);
        const helmet = el(`colors-${id}-helmet`);
        const match = el(`colors-${id}-match`);
        // Never written back while the visitor is dragging that very picker's
        // value: it already says it, and some browsers restart the drag.
        if (jersey && jersey.value !== jerseyOf(team)) jersey.value = jerseyOf(team);
        if (helmet && helmet.value !== helmetOf(team)) helmet.value = helmetOf(team);
        // Only offered once the helmet has a color of its own.
        if (match) match.hidden = !colors.teams[team].helmet;
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
    hooks.report('team-colors', {});
    const first = el('colors-x-jersey');
    if (first) first.focus();
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
