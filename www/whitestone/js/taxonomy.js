// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * taxonomy.js - What a home is made of, per service type (PRD 11.4).
 *
 * A SERVICE TYPE IS DATA, NOT CODE. Each one names its levels (the stories of
 * a house, or the zones of a yard), its areas (the kinds of room, or the
 * features of a yard), and the care preferences a customer can tick. Its
 * tasks, options, presets, sizes and minimum live in its price sheet. A new
 * service type is a new entry here and a new sheet, and nothing else.
 *
 * KEYS ARE STABLE, NAMES ARE NOT. Saved checklists store keys only, so a
 * display name can change without a migration. A key is never reused for a
 * different thing.
 *
 * LAYOUT WEIGHTS (PLANNING 6.2) size each area's tile in the house model: a
 * kitchen takes three times a bathroom's share of its level, a closet half.
 *
 * Landscaping ships as data only. Nothing offers it, but it proves the shape
 * holds for a business that is not cleaning (PRD 11.4).
 *
 * Pure.
 */

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

export const KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

export const TAXONOMY = deepFreeze({
    cleaning: {
        name: 'Home cleaning',
        levelWord: 'level',
        areaWord: 'room',
        /** Bottom to top, which is the order the house model stacks them. The
         *  two garages are annexes beside the house rather than stories in
         *  it (PLANNING 6.2), and come last. */
        levels: [
            { key: 'basement', name: 'Basement' },
            { key: 'main', name: 'Main floor' },
            { key: 'second', name: 'Second floor' },
            { key: 'third', name: 'Third floor' },
            { key: 'attic', name: 'Attic' },
            { key: 'garage', name: 'Garage', annex: true },
            { key: 'detached-garage', name: 'Detached garage', annex: true }
        ],
        areas: [
            { key: 'entry', name: 'Entry', weight: 1 },
            { key: 'hallway', name: 'Hallway', weight: 1 },
            { key: 'stairs', name: 'Stairs', weight: 1 },
            { key: 'living', name: 'Living room', weight: 3 },
            { key: 'family', name: 'Family room', weight: 3 },
            { key: 'dining', name: 'Dining room', weight: 2 },
            { key: 'kitchen', name: 'Kitchen', weight: 3 },
            { key: 'pantry', name: 'Pantry', weight: 0.5 },
            { key: 'office', name: 'Office', weight: 2 },
            { key: 'primary-bedroom', name: 'Primary bedroom', weight: 3 },
            { key: 'bedroom', name: 'Bedroom', weight: 2 },
            { key: 'nursery', name: 'Nursery', weight: 1.5 },
            { key: 'primary-bathroom', name: 'Primary bathroom', weight: 1.5 },
            { key: 'bathroom', name: 'Bathroom', weight: 1 },
            { key: 'powder-room', name: 'Half bath', weight: 0.5 },
            { key: 'laundry', name: 'Laundry room', weight: 1 },
            { key: 'mudroom', name: 'Mudroom', weight: 1 },
            { key: 'closet', name: 'Closet', weight: 0.5 },
            { key: 'playroom', name: 'Playroom', weight: 2 },
            { key: 'gym', name: 'Gym', weight: 2 },
            { key: 'bonus', name: 'Bonus room', weight: 2 },
            { key: 'garage', name: 'Garage', weight: 3 },
            { key: 'patio', name: 'Patio', weight: 2 },
            { key: 'other', name: 'Other', weight: 1 }
        ],
        /** Kinds of residence (PRD 8.9), the first the default: what the
         *  customer lives in, and so which levels it can have. A townhome is
         *  joined to one neighbor or two (`attached`, the first the
         *  default). `levels` null means every level. `short` is how a
         *  line of text names it after the kind ("A townhome, end unit"). */
        residences: [
            { key: 'house', name: 'A house', levels: null },
            {
                key: 'townhome',
                name: 'A townhome',
                levels: ['basement', 'main', 'second', 'third', 'attic', 'garage'],
                attached: [
                    { key: 'end', name: 'An end unit', short: 'end unit' },
                    { key: 'middle', name: 'Between two neighbors', short: 'between two neighbors' }
                ]
            },
            { key: 'condo', name: 'A condo or apartment', levels: ['main', 'second'] }
        ],
        /** Bath types (PRD 8.10). A bathroom or a primary bathroom is a full
         *  bath (`tub`, a tub with its shower) or a shower bath (`shower`, a
         *  stall and no tub), the first by default. A half bath is an area of
         *  its own (`half.area`, its key kept from when it was the powder
         *  room), offered as a bathroom's third type. A task a type names
         *  comes with that type alone: in its standard tasks, after the task
         *  it names as `after`, and never in a room of another type. */
        baths: {
            areas: ['primary-bathroom', 'bathroom'],
            types: [
                { key: 'tub', name: 'Full bath', tasks: [{ task: 'bathtub', after: 'shower' }] },
                { key: 'shower', name: 'Shower bath', tasks: [] }
            ],
            half: { area: 'powder-room', of: 'bathroom' }
        },
        /** Care preferences for the whole visit (PRD 11.8). Optional, unticked
         *  by default, and about the work, never about anybody's health. */
        preferences: [
            {
                key: 'products',
                name: 'Products',
                items: [
                    { key: 'fragrance-free', name: 'Fragrance-free products' },
                    { key: 'no-bleach', name: 'No bleach' },
                    { key: 'no-ammonia', name: 'No ammonia' },
                    { key: 'eco-products', name: 'Plant-based or eco products' },
                    { key: 'pet-safe', name: 'Pet-safe products only' },
                    { key: 'own-products', name: 'Use our own products, left out for you' }
                ]
            },
            {
                key: 'home',
                name: 'Home',
                items: [
                    { key: 'shoe-covers', name: 'Shoe covers or shoes off' },
                    { key: 'pets-home', name: 'Pets at home' },
                    { key: 'leave-items', name: "Please don't move papers or personal items" }
                ]
            }
        ]
    },

    landscaping: {
        name: 'Landscaping',
        levelWord: 'zone',
        areaWord: 'feature',
        levels: [
            { key: 'front-yard', name: 'Front yard' },
            { key: 'back-yard', name: 'Back yard' },
            { key: 'side-yard', name: 'Side yard' },
            { key: 'driveway', name: 'Driveway' },
            { key: 'pool-area', name: 'Pool area' }
        ],
        areas: [
            { key: 'lawn', name: 'Lawn', weight: 3 },
            { key: 'garden-beds', name: 'Garden beds', weight: 2 },
            { key: 'hedges', name: 'Hedges', weight: 1 },
            { key: 'trees', name: 'Trees', weight: 1 },
            { key: 'walkways', name: 'Walkways', weight: 1 }
        ],
        preferences: []
    }
});

/** A service type's taxonomy, or null. */
export function serviceType(key) {
    return Object.prototype.hasOwnProperty.call(TAXONOMY, key) ? TAXONOMY[key] : null;
}

export function levelOf(type, key) {
    const t = serviceType(type);
    return (t && t.levels.find((l) => l.key === key)) || null;
}

export function areaOf(type, key) {
    const t = serviceType(type);
    return (t && t.areas.find((a) => a.key === key)) || null;
}

/** Every preference key a service type offers, in display order. */
export function preferenceKeys(type) {
    const t = serviceType(type);
    return t ? t.preferences.flatMap((g) => g.items.map((i) => i.key)) : [];
}

export function preferenceOf(type, key) {
    const t = serviceType(type);
    if (!t) return null;
    for (const group of t.preferences) {
        const item = group.items.find((i) => i.key === key);
        if (item) return { ...item, group: group.key };
    }
    return null;
}

// ---- Kinds of residence (PRD 8.9) ------------------------------------------------

/** A service type's kinds of residence, or none (a yard has none). */
export function residencesOf(type) {
    const t = serviceType(type);
    return (t && t.residences) || [];
}

/**
 * A residence rebuilt from untrusted input: `{ kind, attached }`, `kind` a
 * known key (else the first, a house), and `attached` a townhome's (else
 * its first) and null for any other kind. Null for a service type without
 * kinds of residence.
 */
export function residenceOf(type, raw) {
    const kinds = residencesOf(type);
    if (!kinds.length) return null;
    const kind = kinds.find((k) => raw && k.key === raw.kind) || kinds[0];
    const sides = kind.attached || [];
    const attached = sides.length ? (sides.find((a) => raw && a.key === raw.attached) || sides[0]).key : null;
    return { kind: kind.key, attached };
}

/** The level keys a residence can have, in the taxonomy's order. */
export function levelsAllowed(type, residence) {
    const t = serviceType(type);
    if (!t) return [];
    const all = t.levels.map((l) => l.key);
    const kind = residencesOf(type).find((k) => residence && k.key === residence.kind);
    return kind && kind.levels ? all.filter((key) => kind.levels.includes(key)) : all;
}

/** "A townhome, end unit": a residence in a line of text, or ''. */
export function residenceLine(type, residence) {
    const kind = residencesOf(type).find((k) => residence && k.key === residence.kind);
    if (!kind) return '';
    const side = (kind.attached || []).find((a) => a.key === residence.attached);
    return side ? `${kind.name}, ${side.short}` : kind.name;
}

// ---- Bath types (PRD 8.10) ------------------------------------------------------

const NO_BATHS = Object.freeze({ areas: [], types: [], half: null });

function bathsOf(type) {
    const t = serviceType(type);
    return (t && t.baths) || NO_BATHS;
}

/** A room's bath type: its own when it names one, else the first, in an
 *  area that has bath types; null in any other area. */
export function bathOf(type, area, bath) {
    const b = bathsOf(type);
    if (!b.areas.includes(area)) return null;
    return (b.types.find((t) => t.key === bath) || b.types[0]).key;
}

/** Whether a task can be in a room of `area` with bath type `bath`: false
 *  only for a task that another bath type brings (a bathtub in a shower
 *  bath). Every other rule is the price sheet's. */
export function bathAllows(type, area, bath, taskKey) {
    const kind = bathOf(type, area, bath);
    if (!kind) return true;
    return !bathsOf(type).types.some((t) => t.key !== kind && t.tasks.some((x) => x.task === taskKey));
}

/** The tasks a room's bath type brings to its standard tasks, each as
 *  `{ task, after }`. */
export function bathTasks(type, area, bath) {
    const kind = bathOf(type, area, bath);
    const t = kind && bathsOf(type).types.find((x) => x.key === kind);
    return t ? t.tasks : [];
}

/**
 * The types of bath a room of `area` can be, as the room card and the panel
 * offer them: `[{ key, area, bath, name }]`. A bathroom, or a half bath, has
 * Full bath, Shower bath and Half bath; a primary bathroom the first two;
 * any other room none.
 */
export function bathChoices(type, area) {
    const b = bathsOf(type);
    const head = b.half && area === b.half.area ? b.half.of : area;
    if (!b.areas.includes(head)) return [];
    const out = b.types.map((t) => ({ key: t.key, area: head, bath: t.key, name: t.name }));
    if (b.half && b.half.of === head) {
        const half = areaOf(type, b.half.area);
        out.push({ key: 'half', area: b.half.area, bath: null, name: half ? half.name : b.half.area });
    }
    return out;
}

/** Which of its `bathChoices` a room is now, by key, or null. */
export function bathChoiceOf(type, room) {
    if (!room) return null;
    const b = bathsOf(type);
    if (b.half && room.area === b.half.area) return 'half';
    return bathOf(type, room.area, room.bath);
}

/** The area a half bath counts as, for the kinds of room a form lists: a
 *  half bath is chosen as a bathroom's type, not as a room of its own. */
export function listedArea(type, area) {
    const b = bathsOf(type);
    return b.half && area === b.half.area ? b.half.of : area;
}

/** The name a room shows: its own label, or its area's name. */
export function roomName(type, room) {
    if (room && typeof room.label === 'string' && room.label.trim()) return room.label.trim();
    const area = room && areaOf(type, room.area);
    return area ? area.name : '';
}
