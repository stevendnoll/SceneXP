// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * beacons.js - What each tap in Whitestone says to the usage log (Steve,
 * 2026-10-16: "each button click/tap would trigger a telemetry signal").
 *
 * ONE LISTENER, ONE VOCABULARY. Both pages hand every click to
 * `installBeacons`, which finds the control it landed on (a button, a link,
 * a checkbox or a file picker) and asks `beaconOf` what it was. So a control
 * added later is named or caught by the guard test, never silently missed.
 *
 * THE NAMES ARE THE LOG'S (specs/nginx-config.txt keeps only action, kind,
 * outcome and a few others; anything else is dropped). `action` is what was
 * done. `kind` is the thing chosen when it comes from a fixed list (a kind
 * of room, a floor, a step), else where it was done (maya, panel, a card's
 * name, the house). `outcome` carries `via=...` when the same choice can be
 * made in more than one place.
 *
 * NOTHING THE VISITOR WROTE OR OWNS. Never typed words, prices, dates, or
 * record ids: an id's trailing record key is never part of a name.
 *
 * ONE ACTION, ONE BEACON (Steve, 2026-09-29). A tap whose page code reports
 * its own result (booking, the cleaner's PIN) is SKIP here, so it is counted
 * once, with what came of it. The calendar's days and month arrows and the
 * task stars are SKIP too, as too chatty to be worth a line each.
 *
 * Pure but for `installBeacons`, which only reads the clicked element.
 */

/** A tap deliberately not logged (or logged by the page itself). */
export const SKIP = Object.freeze({ skip: true });

const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Maya's buttons whose ids do not read well as an action. */
const MAYA_RENAMES = Object.freeze({ buildOwn: 'schedule-my-cleaning', visit: 'see-visit', portrait: 'meet-maya' });

/** The studio's cards, whose static controls are `<card>-<what>`. */
const CARDS = ['visit-report', 'setup', 'prefs', 'quote', 'booking', 'receipt', 'addons', 'checklist', 'room', 'task', 'meet'];

/** The cleaner's skip reasons (tasks/js/visit.js SKIP_REASONS). */
const REASONS = ['no-time', 'no-access', 'already-clean', 'customer-asked'];

/** `data-beacon="action"` or `"action:kind"`, for a control with no id. */
function parseOwn(text) {
    const [action, kind] = String(text).split(':');
    return kind ? { action, kind } : { action };
}

/**
 * The studio's beacon for a control: `{ id, className, tag, type, href,
 * beacon }` as read off the element (`beacon` its data-beacon). Returns
 * `{ action, kind?, outcome? }`, SKIP, or null for a control nobody named.
 */
export function studioBeacon({ id = '', className = '', beacon = '' } = {}) {
    if (beacon) return parseOwn(beacon);
    const classes = ` ${className} `;
    let m;
    if (/^booking-(day-|prev$|next$|confirm$)/.test(id) || /^(panel|checklist)-star-/.test(id)) return SKIP;
    if (id === 'explore-link') return { action: 'explore' };
    if (id === 'toast-undo') return { action: 'undo', kind: 'toast' };
    // Maya: her header, her foot, and what she draws.
    if (id === 'host-next') return classes.includes(' host-next ') ? { action: 'continue', kind: 'maya' } : { action: 'next', kind: 'maya' };
    if (id === 'host-back') return { action: 'back', kind: 'maya' };
    if (id === 'host-expand') return { action: 'need-a-hand', kind: 'maya' };
    if (id === 'host-reset') return { action: 'start-over', kind: 'maya' };
    if ((m = /^host-step-(\d+)$/.exec(id))) return { action: 'step', kind: `step-${Number(m[1]) + 1}` };
    if ((m = /^host-kind-([\w-]+)$/.exec(id))) return { action: 'home-type', kind: m[1] };
    if ((m = /^host-attached-([\w-]+)$/.exec(id))) return { action: 'attached', kind: m[1] };
    if ((m = /^host-floor-([\w-]+)$/.exec(id))) return { action: 'floor', kind: m[1] };
    if ((m = /^host-chip-([\w-]+)$/.exec(id))) return { action: 'add-room', kind: m[1], outcome: 'via=maya' };
    if (/^host-open-[\w-]+$/.test(id)) return { action: 'open-floor', kind: 'list' };
    if ((m = /^host-fact-([\w-]+)$/.exec(id))) return { action: 'fact', kind: m[1] };
    if ((m = /^host-([A-Za-z]+)$/.exec(id))) return { action: MAYA_RENAMES[m[1]] || kebab(m[1]), kind: 'maya' };
    // The panel beside the house.
    if (id === 'panel-back') return { action: 'back', kind: 'panel' };
    if ((m = /^panel-(floor|room|task)-/.exec(id))) return { action: `open-${m[1]}`, kind: 'panel' };
    if ((m = /^panel-chip-([\w-]+)$/.exec(id))) return { action: 'add-room', kind: m[1], outcome: 'via=panel' };
    if ((m = /^panel-bath-([\w-]+)$/.exec(id))) return { action: 'bath', kind: m[1] };
    if ((m = /^panel-([A-Za-z]+)$/.exec(id))) return { action: kebab(m[1]), kind: 'panel' };
    // The checklist's rows, and the add-ons list.
    if ((m = /^move-(up|down)-/.exec(id))) return { action: 'move-task', kind: m[1] };
    if ((m = /^addon-(approve|decline)-/.exec(id))) return { action: m[1], kind: 'list' };
    // A card's own controls: `<card>-<what>`.
    for (const card of CARDS) {
        if (id.startsWith(`${card}-`)) return { action: kebab(id.slice(card.length + 1)), kind: card };
    }
    return null;
}

/**
 * The cleaner's page's beacon for a control, each action `cleaner-...` (the
 * page shares the studio's scene, whitestone, being under /whitestone/).
 */
export function cleanerBeacon({ id = '', className = '', href = '', beacon = '' } = {}) {
    const named = cleanerName({ id, className, href, beacon });
    if (!named || named === SKIP) return named;
    return { ...named, action: `cleaner-${named.action}` };
}

function cleanerName({ id, className, href, beacon }) {
    if (beacon) return parseOwn(beacon);
    const classes = ` ${className} `;
    let m;
    if (id === 'pin-open') return SKIP;
    if (/^done-/.test(id)) return { action: 'done' };
    if (/^skip-words-/.test(id)) return { action: 'skip-with-words' };
    if (/^skip-cancel-/.test(id)) return { action: 'skip-cancel' };
    if (/^unskip-/.test(id)) return { action: 'unskip' };
    if (/^skip-/.test(id)) return { action: 'skip' };
    if ((m = /^reason-.+-([a-z-]+)$/.exec(id))) {
        const reason = REASONS.find((r) => id.endsWith(`-${r}`));
        return { action: 'skip-reason', kind: reason || m[1] };
    }
    if (/^addon-done-/.test(id)) return { action: 'addon-done' };
    if (/^addon-send-/.test(id)) return { action: 'addon-send' };
    if (/^addon-cancel-/.test(id)) return { action: 'addon-cancel' };
    if (/^propose-/.test(id)) return { action: 'propose' };
    if (/^proof-remove-/.test(id)) return { action: 'remove-photo' };
    if (/^proof-input-/.test(id)) return { action: 'add-photo' };
    if (id === 'tasks-print') return { action: 'print' };
    if (id === 'tasks-finish') return { action: 'finish' };
    if ((m = /^report-(send|back|retry)$/.exec(id))) return { action: `report-${m[1]}` };
    if (classes.includes(' task-photo ')) return { action: 'view-photo' };
    if (classes.includes(' photo-close ')) return { action: 'close-photo' };
    if (String(href).startsWith('#task-')) return { action: 'jump-to-task' };
    if (/\/privacy\.html$/.test(String(href))) return { action: 'privacy' };
    return null;
}

/** The control a click landed on: itself or the nearest button, link,
 *  checkbox or file picker it is inside. Null for anything else (a radio,
 *  a label: its own click reaches its input). */
export function controlOf(target) {
    for (let n = target; n && n.tagName !== undefined; n = n.parentNode || n.parentElement) {
        const tag = String(n.tagName || '').toUpperCase();
        if (tag === 'BUTTON' || tag === 'A') return n;
        if (tag === 'INPUT') return n.type === 'checkbox' || n.type === 'file' ? n : null;
        if (tag === 'LABEL' || tag === 'BODY') return null;
    }
    return null;
}

/** What `beaconOf` reads off an element. */
export function readControl(node) {
    const attr = (k) => (node && typeof node.getAttribute === 'function' ? node.getAttribute(k) : null) || '';
    return {
        id: (node && node.id) || '',
        className: String((node && node.className) || ''),
        href: attr('href'),
        beacon: attr('data-beacon')
    };
}

/**
 * Every click on `doc` becomes at most one beacon: `beaconOf` names the
 * control, `send(action, params)` sends it, and `leave` (trackFinal) sends a
 * link's that takes the visitor off the page, which an image beacon would
 * not outlive. Returns the listener, for a test.
 */
export function installBeacons(doc, { beaconOf, send, leave = send, signal } = {}) {
    const listener = (event) => {
        const node = controlOf(event && event.target);
        if (!node || node.disabled) return;
        const named = beaconOf(readControl(node));
        if (!named || named === SKIP) return;
        const { action, ...params } = named;
        const href = readControl(node).href;
        const leaving = String(node.tagName || '').toUpperCase() === 'A' && href && !href.startsWith('#');
        (leaving ? leave : send)(action, params);
    };
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('click', listener, signal ? { signal } : undefined);
    return listener;
}
