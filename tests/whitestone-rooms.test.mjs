// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * What furnishes each kind of room (www/whitestone/js/rooms.js, PRD 8.10):
 * a kitchen has its sink, range, refrigerator and dishwasher, and an island
 * where there is room; a bathroom has what its type has (a tub, a stall, or
 * neither); every kind of room has its own recognizable pieces. And every
 * kit fits its room: inside its side walls, before its task dots, nothing
 * standing in anything else, nothing hung on a wall that is not there.
 * Plain numbers: rooms.js has no three.js. How it looks is the preview's
 * (scripts/whitestone-model-preview.mjs) and Steve's.
 */
import { kitFor, kitExtent, KIT_OF, BATHS, SIDE } from '../www/whitestone/js/rooms.js';
import { TAXONOMY } from '../www/whitestone/js/taxonomy.js';
import { CONFIG } from '../www/whitestone/js/config.js';

const BAND = 0.45;
const roles = (pieces) => pieces.map((p) => p.role);
const count = (pieces, role) => pieces.filter((p) => p.role === role).length;

/** A usual size for each kind of room, model meters (the example home's,
 *  from layout.js, and a little either way). */
const USUAL = {
    kitchen: [0.56, 0.36], living: [0.56, 0.36], family: [0.6, 0.45], dining: [0.3, 0.45], office: [0.28, 0.45],
    entry: [0.28, 0.23], 'powder-room': [0.27, 0.23], 'primary-bedroom': [0.48, 0.43], bedroom: [0.31, 0.44],
    'primary-bathroom': [0.38, 0.27], bathroom: [0.25, 0.27], laundry: [0.25, 0.25], nursery: [0.3, 0.35],
    closet: [0.2, 0.2], pantry: [0.2, 0.2], mudroom: [0.25, 0.22], hallway: [0.3, 0.2], playroom: [0.35, 0.35],
    gym: [0.3, 0.35], bonus: [0.4, 0.4], garage: [0.45, 0.55], patio: [0.3, 0.3], stairs: [0.2, 0.3], other: [0.25, 0.25]
};

describe('every kind of room', () => {
    test('every kind the taxonomy has has a kit, and its usual size', () => {
        const areas = TAXONOMY.cleaning.areas.map((a) => a.key);
        expect(Object.keys(KIT_OF).sort()).toEqual(areas.slice().sort());
        expect(Object.keys(USUAL).sort()).toEqual(areas.slice().sort());
        for (const area of areas) expect(kitFor(area, ...USUAL[area]).length).toBeGreaterThan(0);
        expect(kitFor('nowhere', 0.3, 0.3)).toEqual([]);
    });

    test.each(Object.keys(USUAL))('%s fits its usual room nearly at full size: inside its walls, before its dots', (area) => {
        const [w, d] = USUAL[area];
        for (const bath of BATHS) {
            const kit = kitFor(area, w, d, { bath, band: BAND });
            const { half, deep } = kitExtent(kit);
            // Built for the room's width: inside its side walls as it is.
            expect(half).toBeLessThanOrEqual(w / 2 - SIDE + 1e-9);
            // model.js shrinks a kit evenly to fit before the dots: in a
            // room of its usual size, by no more than a quarter, so its
            // pieces stay about their real size.
            const k = Math.min(1, (d * BAND - 0.006) / deep);
            expect(`${area}/${bath} ${k >= 0.75}`).toBe(`${area}/${bath} true`);
            for (const p of kit) {
                expect(p.up).toBeGreaterThanOrEqual(0);
                expect(p.z - p.d / 2).toBeGreaterThanOrEqual(-1e-9);
                expect(p.w).toBeGreaterThan(0);
                expect(p.h).toBeGreaterThan(0);
            }
        }
    });

    test.each(Object.keys(USUAL))('%s: nothing that stands on the floor stands in anything else', (area) => {
        const [w, d] = USUAL[area];
        for (const bath of BATHS) {
            // What stands on the floor, rugs and mats aside (they lie under
            // things), each with the footprint it takes.
            const floor = kitFor(area, w, d, { bath, band: BAND })
                .filter((p) => p.up === 0 && !['rug', 'mat', 'shower', 'tub'].includes(p.role) && p.h > 0.004)
                .map((p) => ({ ...p, rect: [p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2] }));
            for (let i = 0; i < floor.length; i++) {
                for (let j = i + 1; j < floor.length; j++) {
                    const a = floor[i];
                    const b = floor[j];
                    if (a.role === b.role) continue;
                    const ox = Math.min(a.rect[2], b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
                    const oz = Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
                    expect(`${area}/${bath}: ${a.role} and ${b.role} ${ox > 1e-6 && oz > 1e-6 ? 'overlap' : 'apart'}`).toBe(`${area}/${bath}: ${a.role} and ${b.role} apart`);
                }
            }
        }
    });

    test('what hangs on a wall goes where the back wall is only a low partition', () => {
        const high = kitFor('kitchen', 0.56, 0.36);
        const low = kitFor('kitchen', 0.56, 0.36, { wall: 0.05 });
        expect(count(high, 'hood')).toBe(2);
        expect(count(low, 'hood')).toBe(0);
        expect(roles(low)).toContain('range');
        expect(count(kitFor('powder-room', 0.27, 0.23, { wall: 0.05 }), 'mirror')).toBe(0);
        expect(count(kitFor('powder-room', 0.27, 0.23, { wall: 0.17 }), 'mirror')).toBe(1);
        for (const p of low) expect(Boolean(p.wall) && p.up + p.h > 0.05).toBe(false);
    });
});

describe('a kitchen', () => {
    test('a run of cabinets under a counter, the sink and its faucet, a dishwasher, a range with four burners, the refrigerator, an island with stools', () => {
        const k = kitFor('kitchen', 0.56, 0.36);
        for (const role of ['cabinets', 'counter', 'sink', 'faucet', 'dishwasher', 'range', 'cooktop', 'oven-door', 'fridge', 'island', 'island-top']) {
            expect(`${role}: ${roles(k).includes(role)}`).toBe(`${role}: true`);
        }
        expect(count(k, 'burner')).toBe(4);
        expect(count(k, 'stool')).toBe(6);   // three stools, each a stem and a seat
        // The refrigerator at the end of the run, taller than the counter.
        const fridge = k.find((p) => p.role === 'fridge');
        const counter = k.filter((p) => p.role === 'counter');
        expect(fridge.x).toBeGreaterThan(Math.max(...counter.map((c) => c.x)));
        expect(fridge.h).toBeGreaterThan(2 * k.find((p) => p.role === 'cabinets').h);
        // The sink and the range are apart, the dishwasher beside the sink.
        const sink = k.find((p) => p.role === 'sink');
        const range = k.find((p) => p.role === 'range');
        const dish = k.find((p) => p.role === 'dishwasher');
        expect(Math.abs(sink.x - range.x)).toBeGreaterThan(0.08);
        expect(Math.abs(dish.x - sink.x)).toBeLessThan(0.06);
        // The counter is level with the range's top, and the burners on it.
        expect(counter[0].up + counter[0].h).toBeCloseTo(range.up + range.h, 9);
        for (const b of k.filter((p) => p.role === 'burner')) expect(b.up).toBeGreaterThanOrEqual(range.h);
    });

    test('a small kitchen: no island, and a short one only a counter with its sink', () => {
        const small = kitFor('kitchen', 0.3, 0.25);
        expect(roles(small)).not.toContain('island');
        expect(roles(small)).toEqual(expect.arrayContaining(['sink', 'range', 'fridge']));
        const tiny = kitFor('kitchen', 0.12, 0.2);
        expect(roles(tiny)).toEqual(expect.arrayContaining(['counter', 'sink']));
        expect(roles(tiny)).not.toContain('range');
        expect(roles(tiny)).not.toContain('fridge');
    });
});

describe('a bathroom, by its type', () => {
    test('a full bath: a tub, a toilet, a vanity and its basin', () => {
        const b = kitFor('bathroom', 0.25, 0.27, { bath: 'tub' });
        expect(roles(b)).toEqual(expect.arrayContaining(['tub', 'toilet', 'vanity', 'basin']));
        expect(roles(b)).not.toContain('shower');
    });

    test('a shower bath: a stall with its frame, and no tub', () => {
        const b = kitFor('bathroom', 0.25, 0.27, { bath: 'shower' });
        expect(roles(b)).toEqual(expect.arrayContaining(['shower', 'glass', 'toilet', 'vanity']));
        expect(roles(b)).not.toContain('tub');
    });

    test('a half bath: a toilet and a pedestal sink, nothing to bathe in', () => {
        for (const b of [kitFor('powder-room', 0.27, 0.23), kitFor('bathroom', 0.25, 0.27, { bath: 'half' })]) {
            expect(roles(b)).toEqual(expect.arrayContaining(['toilet', 'pedestal', 'basin']));
            expect(roles(b)).not.toContain('tub');
            expect(roles(b)).not.toContain('shower');
        }
    });

    test('a primary bath: two basins at a wide vanity, and its tub or stall by its type', () => {
        const full = kitFor('primary-bathroom', 0.38, 0.27, { bath: 'tub' });
        expect(count(full, 'basin')).toBe(2);
        expect(roles(full)).toContain('tub');
        const shower = kitFor('primary-bathroom', 0.38, 0.27, { bath: 'shower' });
        expect(roles(shower)).toContain('shower');
        expect(roles(shower)).not.toContain('tub');
        // A narrow one has one basin.
        expect(count(kitFor('primary-bathroom', 0.24, 0.27), 'basin')).toBe(1);
    });

    test('an unknown type is a full bath', () => {
        expect(kitFor('bathroom', 0.25, 0.27, { bath: 'jacuzzi' })).toEqual(kitFor('bathroom', 0.25, 0.27, { bath: 'tub' }));
    });
});

describe('the other rooms say what they are', () => {
    test.each([
        ['bedroom', ['bed', 'mattress', 'pillow', 'nightstand', 'lamp', 'shade']],
        ['primary-bedroom', ['bed', 'bench', 'dresser']],
        ['living', ['sofa', 'cushion', 'coffee-table', 'rug']],
        ['bonus', ['sofa', 'console', 'tv']],
        ['dining', ['table', 'chair', 'pendant', 'sideboard']],
        ['office', ['desk', 'screen', 'chair']],
        ['laundry', ['washer', 'dryer', 'door']],
        ['nursery', ['crib', 'crib-mattress']],
        ['garage', ['car', 'wheel']],
        ['closet', ['shelves', 'clothes']],
        ['pantry', ['shelves', 'jar']],
        ['entry', ['console', 'lamp']],
        ['mudroom', ['bench']],
        ['playroom', ['shelf', 'bin', 'beanbag']],
        ['gym', ['treadmill']],
        ['patio', ['table', 'umbrella']],
        ['stairs', ['stairs']]
    ])('%s has its %j', (area, want) => {
        const kit = kitFor(area, ...USUAL[area], { wall: 0.17 });
        for (const role of want) expect(`${area} ${role}: ${roles(kit).includes(role)}`).toBe(`${area} ${role}: true`);
    });

    test("a dining table has a chair on every side, a washer's door faces the room, and a wide garage two cars", () => {
        const dining = kitFor('dining', 0.3, 0.45).filter((p) => p.role === 'chair' && p.h < 0.03);
        expect(dining.length).toBeGreaterThanOrEqual(4);
        const doors = kitFor('laundry', 0.25, 0.25).filter((p) => p.role === 'door');
        expect(doors).toHaveLength(2);
        for (const door of doors) expect(door.rot).toEqual([Math.PI / 2, 0, 0]);
        expect(count(kitFor('garage', 0.45, 0.55), 'car')).toBe(4);   // two cars, each a body and a cabin
        expect(count(kitFor('garage', 0.3, 0.55), 'car')).toBe(2);
    });

    test('every piece is painted from the palette or the room\'s own two colors', () => {
        const pal = CONFIG.model.palette;
        for (const area of Object.keys(KIT_OF)) {
            for (const bath of [...BATHS, 'half']) {
                for (const p of kitFor(area, 0.5, 0.45, { bath })) {
                    expect(`${area} ${p.role} ${p.color}: ${p.color in pal || ['accent', 'accent2'].includes(p.color)}`).toBe(`${area} ${p.role} ${p.color}: true`);
                }
            }
        }
    });

    test('the same room is furnished the same way every time', () => {
        for (const area of Object.keys(KIT_OF)) expect(kitFor(area, 0.33, 0.31)).toEqual(kitFor(area, 0.33, 0.31));
    });
});
