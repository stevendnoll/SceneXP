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
            { key: 'powder-room', name: 'Powder room', weight: 0.5 },
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

/** The name a room shows: its own label, or its area's name. */
export function roomName(type, room) {
    if (room && typeof room.label === 'string' && room.label.trim()) return room.label.trim();
    const area = room && areaOf(type, room.area);
    return area ? area.name : '';
}
