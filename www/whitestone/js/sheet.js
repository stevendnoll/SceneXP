// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * sheet.js - The price sheet: what makes one valid, how to load one, and
 * how to look things up in it (PRD 11.5, PLANNING 5.4).
 *
 * ONE DEFINITION OF VALID, USED TWICE. The build script runs `validateSheet`
 * before it writes a version, and the pages run it again on every sheet they
 * load, so a sheet the build accepted is exactly a sheet the studio and the
 * cleaner's page accept.
 *
 * `checkChoice` is the rule for a single task as chosen (its options, size and
 * quantity, in a given area). The validator holds every preset to it, and
 * pricing.js holds every checklist item to it, so a preset can never build an
 * item the quote would refuse.
 *
 * AMOUNTS ARE INTEGER CENTS AND INTEGER MINUTES. Size factors are integer
 * percents. Nothing here is ever a floating-point dollar.
 *
 * Pure, apart from `loadSheet` and `currentVersion`, which take their fetch
 * as an argument.
 */

import { serviceType, bathAllows, bathTasks, KEY_PATTERN } from './taxonomy.min.js';

export const SHEET_FORMAT = 1;
export const UNITS = Object.freeze(['each', 'count', 'room']);
export const SIZES = Object.freeze(['small', 'medium', 'large']);

/** Bounds no real sheet comes near, so a typo ("1000" for "10.00", or
 *  minutes typed as seconds) is a validation problem, not a quote. */
export const SHEET_LIMITS = Object.freeze({
    maxCents: 100000,          // $1,000 for a single task
    maxMinutes: 600,           // ten hours for a single task
    maxVisitMinimumCents: 100000,
    minSizePercent: 10,
    maxSizePercent: 1000,
    maxQuantity: 50,
    maxTasks: 300,
    maxNameLength: 60,
    maxDescriptionLength: 160
});

/** `cleaning-2026-10`, or with a suffix for a second version in one month:
 *  `cleaning-2026-10-b`. Never a path: no slash, no dot. */
export const VERSION_PATTERN = /^[a-z][a-z-]*-\d{4}-\d{2}(?:-[a-z0-9]+)?$/;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCount(n, min, max) {
    return Number.isInteger(n) && n >= min && n <= max;
}

function isRealDate(text) {
    const m = DATE_PATTERN.exec(String(text));
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// ---- Lookups ----------------------------------------------------------------

const indexes = new WeakMap();

function indexOf(sheet) {
    let ix = indexes.get(sheet);
    if (!ix) {
        ix = {
            tasks: new Map((sheet.tasks || []).map((t) => [t.key, t])),
            options: new Map((sheet.options || []).map((o) => [o.key, o]))
        };
        indexes.set(sheet, ix);
    }
    return ix;
}

/** A task by key, or null. */
export function taskOf(sheet, key) {
    return indexOf(sheet).tasks.get(key) || null;
}

/** An option's name and description by key, or null. */
export function optionOf(sheet, key) {
    return indexOf(sheet).options.get(key) || null;
}

/** The options a task accepts, each with its name and its amounts for that
 *  task, in the sheet's order. */
export function optionsFor(sheet, taskKey) {
    const task = taskOf(sheet, taskKey);
    if (!task) return [];
    return task.options.map((o) => ({ ...optionOf(sheet, o.key), cents: o.cents, minutes: o.minutes }));
}

/** Every task offered in an area (and, for a bathroom, its type of bath),
 *  in the sheet's order. */
export function tasksFor(sheet, area, bath) {
    return (sheet.tasks || []).filter((t) => t.areas.includes(area) && bathAllows(sheet.serviceType, area, bath, t.key));
}

/**
 * A room's standard tasks: a list of { task, options, size, quantity }. The
 * sheet's preset for its area, as its type of bath has it (taxonomy.js): a
 * full bath's bathtub added after its shower, a shower bath without one. A
 * bathroom with no type given is a full bath. The sheet itself is unchanged.
 */
export function presetFor(sheet, area, bath) {
    const presets = sheet.presets || {};
    const type = sheet.serviceType;
    const base = Object.prototype.hasOwnProperty.call(presets, area) ? presets[area] : [];
    const out = base.filter((p) => bathAllows(type, area, bath, p.task));
    for (const extra of bathTasks(type, area, bath)) {
        const task = taskOf(sheet, extra.task);
        if (!task || !task.areas.includes(area) || out.some((p) => p.task === extra.task)) continue;
        const at = out.findIndex((p) => p.task === extra.after);
        out.splice(at < 0 ? out.length : at + 1, 0, { task: extra.task, options: [] });
    }
    return out;
}

/**
 * The standard tasks a room gains when its type of bath changes, `from` and
 * `to` each `{ area, bath }`: those of the new type the old type did not
 * have, and the room does not have already (`have`, its task keys). A
 * shower bath made full gains its bathtub; a half bath made full, its
 * shower and bathtub. A task taken off by hand is never put back.
 */
export function presetGains(sheet, from, to, have = []) {
    const before = new Set(presetFor(sheet, from.area, from.bath).map((p) => p.task));
    const owned = new Set(have);
    return presetFor(sheet, to.area, to.bath).filter((p) => !before.has(p.task) && !owned.has(p.task));
}

// ---- One task as chosen -----------------------------------------------------

/**
 * Whether a task can be ordered as chosen, in an area: null if so, or the
 * reason it cannot, as a stable code. `area` may be omitted to skip the area
 * rule (an add-on upgrade of an item already placed, for instance). `bath`
 * is a bathroom's type (taxonomy.js), a full bath when omitted.
 *
 *   unknown-task          no such task in this sheet
 *   not-offered           the task is not offered in this kind of room
 *   not-with-bath         the task comes with another type of bath
 *   bad-options           options is not a list
 *   unknown-option        an option this task does not accept
 *   repeated-option       the same option twice
 *   size-not-allowed      a size on a task not priced by room size
 *   bad-size              a size that is not small, medium or large
 *   quantity-not-allowed  a quantity other than 1 on a task not priced per unit
 *   bad-quantity          a quantity that is not a whole number from 1 to 50
 */
export function checkChoice(sheet, choice, area, bath) {
    const task = taskOf(sheet, choice && choice.task);
    if (!task) return 'unknown-task';
    if (area !== undefined && !task.areas.includes(area)) return 'not-offered';
    if (area !== undefined && !bathAllows(sheet.serviceType, area, bath, task.key)) return 'not-with-bath';

    const options = choice.options === undefined ? [] : choice.options;
    if (!Array.isArray(options)) return 'bad-options';
    const accepted = new Set(task.options.map((o) => o.key));
    if (options.some((o) => !accepted.has(o))) return 'unknown-option';
    if (new Set(options).size !== options.length) return 'repeated-option';

    if (choice.size !== undefined && choice.size !== null) {
        if (task.unit !== 'room') return 'size-not-allowed';
        if (!SIZES.includes(choice.size)) return 'bad-size';
    }

    if (choice.quantity !== undefined && choice.quantity !== null) {
        if (!isCount(choice.quantity, 1, SHEET_LIMITS.maxQuantity)) return 'bad-quantity';
        if (task.unit !== 'count' && choice.quantity !== 1) return 'quantity-not-allowed';
    }
    return null;
}

// ---- The whole sheet --------------------------------------------------------

/**
 * Every problem with a sheet, as plain sentences naming where each one is.
 * An empty list means the sheet is valid.
 */
export function validateSheet(sheet) {
    const problems = [];
    const add = (where, what) => problems.push(`${where}: ${what}`);

    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return ['the sheet is not an object'];
    if (sheet.format !== SHEET_FORMAT) add('format', `must be ${SHEET_FORMAT}`);

    const type = serviceType(sheet.serviceType);
    if (!type) add('serviceType', `"${sheet.serviceType}" is not a service type`);
    if (typeof sheet.version !== 'string' || !VERSION_PATTERN.test(sheet.version)) {
        add('version', `"${sheet.version}" is not a version such as cleaning-2026-10`);
    } else if (type && !sheet.version.startsWith(`${sheet.serviceType}-`)) {
        add('version', `must begin with ${sheet.serviceType}-`);
    }
    if (!isRealDate(sheet.effective)) add('effective', `"${sheet.effective}" is not a date such as 2026-10-01`);
    if (sheet.currency !== 'USD') add('currency', 'must be USD');
    if (typeof sheet.taxIncluded !== 'boolean') add('taxIncluded', 'must be true or false');
    if (!isCount(sheet.visitMinimumCents, 0, SHEET_LIMITS.maxVisitMinimumCents)) {
        add('visitMinimumCents', 'must be whole cents from 0 to 100000');
    }

    const sizes = sheet.sizes || {};
    for (const size of SIZES) {
        if (!isCount(sizes[size], SHEET_LIMITS.minSizePercent, SHEET_LIMITS.maxSizePercent)) {
            add(`sizes.${size}`, 'must be a whole percent from 10 to 1000');
        }
    }
    if (isCount(sizes.small, 1, 1e6) && isCount(sizes.medium, 1, 1e6) && isCount(sizes.large, 1, 1e6)
        && !(sizes.small <= sizes.medium && sizes.medium <= sizes.large)) {
        add('sizes', 'small, medium and large must not shrink as the room grows');
    }

    const named = (where, entry) => {
        if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > SHEET_LIMITS.maxNameLength) {
            add(where, `needs a name of 1 to ${SHEET_LIMITS.maxNameLength} characters`);
        }
        if (typeof entry.description !== 'string' || entry.description.length > SHEET_LIMITS.maxDescriptionLength) {
            add(where, `needs a description of at most ${SHEET_LIMITS.maxDescriptionLength} characters`);
        }
    };

    const options = Array.isArray(sheet.options) ? sheet.options : [];
    if (!Array.isArray(sheet.options)) add('options', 'must be a list');
    const optionKeys = new Set();
    for (const o of options) {
        const where = `option ${o && o.key}`;
        if (!o || !KEY_PATTERN.test(o.key)) { add('options', `"${o && o.key}" is not a key`); continue; }
        if (optionKeys.has(o.key)) add(where, 'appears twice');
        optionKeys.add(o.key);
        named(where, o);
    }

    const tasks = Array.isArray(sheet.tasks) ? sheet.tasks : [];
    if (!Array.isArray(sheet.tasks) || !tasks.length) add('tasks', 'must be a list of at least one task');
    if (tasks.length > SHEET_LIMITS.maxTasks) add('tasks', `at most ${SHEET_LIMITS.maxTasks}`);
    const taskKeys = new Set();
    const usedOptions = new Set();
    for (const t of tasks) {
        const where = `task ${t && t.key}`;
        if (!t || !KEY_PATTERN.test(t.key)) { add('tasks', `"${t && t.key}" is not a key`); continue; }
        if (taskKeys.has(t.key)) add(where, 'appears twice');
        taskKeys.add(t.key);
        named(where, t);
        if (!UNITS.includes(t.unit)) add(where, `unit "${t.unit}" must be each, count or room`);
        if (!isCount(t.cents, 0, SHEET_LIMITS.maxCents)) add(where, 'price must be whole cents from 0 to 100000');
        if (!isCount(t.minutes, 1, SHEET_LIMITS.maxMinutes)) add(where, 'minutes must be a whole number from 1 to 600');
        if (!Array.isArray(t.areas) || !t.areas.length) {
            add(where, 'must be offered in at least one area');
        } else {
            for (const a of t.areas) {
                if (type && !type.areas.some((x) => x.key === a)) add(where, `"${a}" is not an area`);
            }
            if (new Set(t.areas).size !== t.areas.length) add(where, 'names an area twice');
        }
        if (!Array.isArray(t.options)) {
            add(where, 'options must be a list');
        } else {
            const seen = new Set();
            for (const o of t.options) {
                if (!o || !optionKeys.has(o.key)) { add(where, `option "${o && o.key}" is not in the options list`); continue; }
                if (seen.has(o.key)) add(where, `option ${o.key} appears twice`);
                seen.add(o.key);
                usedOptions.add(o.key);
                if (!isCount(o.cents, 0, SHEET_LIMITS.maxCents)) add(`${where} option ${o.key}`, 'price must be whole cents from 0 to 100000');
                if (!isCount(o.minutes, 0, SHEET_LIMITS.maxMinutes)) add(`${where} option ${o.key}`, 'minutes must be a whole number from 0 to 600');
            }
        }
    }
    for (const key of optionKeys) {
        if (!usedOptions.has(key)) add(`option ${key}`, 'is not attached to any task');
    }

    if (type) {
        for (const area of type.areas) {
            if (!tasks.some((t) => Array.isArray(t.areas) && t.areas.includes(area.key))) {
                add(`area ${area.key}`, 'has no tasks');
            }
        }
    }

    const presets = sheet.presets;
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
        add('presets', 'must be an object of areas');
    } else if (!problems.length) {
        // Presets are checked against a sheet already known to be sound, so
        // every problem found here is the preset's own.
        for (const [area, list] of Object.entries(presets)) {
            const where = `preset ${area}`;
            if (type && !type.areas.some((x) => x.key === area)) { add(where, 'is not an area'); continue; }
            if (!Array.isArray(list) || !list.length) { add(where, 'must list at least one task'); continue; }
            const seen = new Set();
            for (const p of list) {
                const why = checkChoice(sheet, p, area);
                if (why) add(`${where} task ${p && p.task}`, why);
                else if (seen.has(p.task)) add(`${where} task ${p.task}`, 'appears twice');
                seen.add(p && p.task);
            }
        }
    }
    return problems;
}

// ---- Loading ----------------------------------------------------------------

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

/**
 * Fetch, validate and freeze one sheet version. `fetchJson(url)` resolves to
 * parsed JSON. Throws an Error listing the problems if the sheet is not
 * valid, or if the file is not the version it was asked for.
 */
export async function loadSheet(version, fetchJson, base = 'data/prices/') {
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
        throw new Error(`"${version}" is not a price sheet version`);
    }
    const sheet = await fetchJson(`${base}${version}.json`);
    const problems = validateSheet(sheet);
    if (!problems.length && sheet.version !== version) problems.push(`version: the file says ${sheet.version}`);
    if (problems.length) throw new Error(`Price sheet ${version} is not valid. ${problems.join('. ')}`);
    return deepFreeze(sheet);
}

/** The version a service type currently sells, from `index.json`. */
export async function currentVersion(type, fetchJson, base = 'data/prices/') {
    const index = await fetchJson(`${base}index.json`);
    const version = index && Object.prototype.hasOwnProperty.call(index, type) ? index[type] : null;
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version) || !version.startsWith(`${type}-`)) {
        throw new Error(`No current price sheet for ${type}`);
    }
    return version;
}
