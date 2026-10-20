// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * family.js - the visitor's own family (M6.3, D5): a grown-up and a kid who
 * cheer at the front by the finish, the kid holding a sign with the car's
 * name, each dressed on the family card with the shared cast part's
 * choices (shared/js/cast-1.0.0.js: shirt, pants, skin tone, hair color and
 * hair length).
 *
 * KEPT IN THIS BROWSER under its own key, `derby-family`, through the cast
 * part's store, so a refused storage simply means the default family every
 * visit. Disclosed in www/privacy.html with the rest of Derby Day's garage,
 * and Forget my cars forgets them too.
 *
 * THE CARD IS A SECTION OF THE BENCH, and opening it turns the bench camera
 * to the two of them, standing beside the table (main.js).
 */

import { DERBY_CONFIG } from './config.min.js';
import { SHIRTS, PANTS, SKINS, HAIR_COLORS, HAIR_LENGTHS, normalizeChoice, createCastStore, outfitWords } from '../../shared/js/cast-1.0.0.min.js';
import { lookOf } from './crowd.min.js';
import { UI } from './copy.min.js';

export const FAMILY_KEY = 'derby-family';

/** The family a first visit finds: a grown-up in navy, a kid in mustard. */
export const DEFAULT_FAMILY = Object.freeze({
    grownUp: Object.freeze({ shirt: 'navy', pants: 'khaki', skin: 'fair', hair: 'darkBrown', length: 'short' }),
    kid: Object.freeze({ shirt: 'mustard', pants: 'denim', skin: 'fair', hair: 'brown', length: 'long' })
});

/** Anything stored made a whole family, each of the two made valid. */
export function normalizeFamily(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { grownUp: normalizeChoice(r.grownUp, DEFAULT_FAMILY.grownUp), kid: normalizeChoice(r.kid, DEFAULT_FAMILY.kid) };
}

export function createFamilyStore() {
    return createCastStore(FAMILY_KEY, { defaults: DEFAULT_FAMILY, normalize: normalizeFamily });
}

/** The two of them as crowd members: the grown-up, and the kid with the
 *  sign. `carName` is the car's own name. Pure. */
export function familyMembers(family, carName, C = DERBY_CONFIG) {
    const f = normalizeFamily(family);
    const words = `GO ${String(carName || '').toUpperCase()}!`;
    return [
        { look: lookOf(f.grownUp, {}, C), prop: null, sign: null },
        { look: lookOf(f.kid, { kid: true }, C), prop: 'sign', sign: words.length > 18 ? 'GO GO GO!' : words }
    ];
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** The section's summary: "Navy and mustard shirts". */
export function familySummary(family) {
    const f = normalizeFamily(family);
    const a = SHIRTS.find((o) => o.id === f.grownUp.shirt).label;
    const b = SHIRTS.find((o) => o.id === f.kid.shirt).name;
    return a.toLowerCase() === b ? `Both in ${b}` : `${a} and ${b} shirts`;
}

/** The card's line under the choices: what each wears. */
export function familyLine(family) {
    const f = normalizeFamily(family);
    return `The grown-up in ${outfitWords(f.grownUp)}, the kid in ${outfitWords(f.kid)}.`;
}

/**
 * The family card in `body` (a bench section). `kit` is bench.js's { h,
 * choice, group, listen }. `store` keeps the choice, `onChange(family)`
 * redraws them. Returns { update(), family() }.
 */
export function createFamilyCard(body, kit, store, onChange) {
    const { h, choice, group } = kit;
    let family = store.load();
    let who = 'grownUp';

    const whoChips = [['grownUp', UI.grownUp], ['kid', UI.kid]].map(([id, label]) => choice('radio', 'bench-who', id, label, null, (input) => {
        if (!input.checked) return;
        who = id;
        update();
    }, 'chip'));
    body.appendChild(group(UI.dressing, whoChips.map((c) => c.wrap), 'chips'));

    const rows = {};
    const row = (key, legend, list, swatches) => {
        rows[key] = list.map((o) => {
            const c = choice('radio', `bench-${key}`, o.id, o.label, null, (input) => {
                if (!input.checked) return;
                family = { ...family, [who]: { ...family[who], [key]: o.id } };
                store.save(family);
                family = normalizeFamily(family);
                update();
                onChange(family);
            }, swatches ? 'swatch' : 'chip');
            if (swatches) {
                c.text.classList.add('sr-only');
                const dot = h('span', 'swatch-dot');
                dot.style.backgroundColor = hex(o.color);
                dot.setAttribute('aria-hidden', 'true');
                c.wrap.insertBefore(dot, c.text);
                c.wrap.setAttribute('title', o.label);
            }
            return c;
        });
        body.appendChild(group(legend, rows[key].map((c) => c.wrap), swatches ? 'swatches' : 'chips'));
    };
    row('shirt', UI.shirt, SHIRTS, true);
    row('pants', UI.pants, PANTS, true);
    row('skin', UI.skin, SKINS, true);
    row('hair', UI.hairColor, HAIR_COLORS, true);
    row('length', UI.hairLength, HAIR_LENGTHS, false);
    const line = h('p', 'bench-help', '');
    body.appendChild(line);

    function update() {
        for (const c of whoChips) c.input.checked = c.input.value === who;
        const mine = family[who];
        for (const [key, list] of Object.entries(rows)) for (const c of list) c.input.checked = c.input.value === mine[key];
        line.textContent = familyLine(family);
    }
    update();
    return { update, family: () => family, reset() { family = store.load(); update(); } };
}
