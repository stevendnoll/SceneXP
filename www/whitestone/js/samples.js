// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * samples.js - The example home (PRD 8.8, PLANNING 4.6).
 *
 * A first-time visitor arrives to find a complete home already built and
 * priced: four bedrooms on three levels, a dog and a home office, about 25
 * tasks with options, sizes, quantities, stars and notes, and care
 * preferences. The judges see the payoff before a single tap.
 *
 * BUILT THROUGH THE STORE'S OWN MUTATIONS, never written out as a finished
 * document, so the example can only ever be a shape the store accepts, and a
 * change to the store's rules is a change to the example too. Every record is
 * tagged `sample: true`, so "Clear the example" removes exactly this and
 * nothing of the visitor's (store.js clearSamples).
 *
 * Its ids are fixed, so the example is the same home on every visit and its
 * photos (Steve's close-ups, to come) can be matched to its tasks.
 *
 * Still to come: the finished visit report with a skip and an approved
 * add-on, once the store keeps reports (M5), and the photos.
 */

import { createChecklist, setPreferences, addRoom, addItem, setSettings } from './store.min.js';

export const EXAMPLE_ID = 'example-home-1';

/** The rooms, level by level, and each room's tasks as chosen, with a
 *  bathroom's type of bath last where it is not a full bath: the primary
 *  bath is a shower bath, the hall bath a full bath with its tub. */
const ROOMS = [
    ['main', 'entry', '', [
        { task: 'mop-floor', size: 'small' },
        { task: 'shoe-area' }
    ]],
    ['main', 'kitchen', '', [
        { task: 'stovetop', options: ['deep-clean'], important: true, notes: 'The grates can soak in the sink while you do the rest.' },
        { task: 'countertops', options: ['disinfect'] },
        { task: 'kitchen-sink', options: ['polish'] },
        { task: 'microwave' },
        { task: 'mop-floor', options: ['under-furniture'] }
    ]],
    ['main', 'living', '', [
        { task: 'tidy-room', size: 'large' },
        { task: 'vacuum-floor', size: 'large', avoid: 'Please skip the wool rug by the fireplace.' },
        { task: 'upholstery', quantity: 2, notes: 'Juniper sheds on the gray sofa.' }
    ]],
    ['main', 'dining', '', [
        { task: 'table-chairs' }
    ]],
    ['main', 'office', '', [
        { task: 'desk', notes: 'Please leave the papers where they are.' },
        { task: 'vacuum-floor', size: 'small' }
    ]],
    ['main', 'powder-room', '', [
        { task: 'toilet' },
        { task: 'bathroom-sink' }
    ]],
    ['second', 'primary-bedroom', '', [
        { task: 'change-linens', quantity: 1, important: true },
        { task: 'vacuum-floor' }
    ]],
    ['second', 'primary-bathroom', '', [
        { task: 'shower', options: ['descale'], important: true, avoid: 'No abrasives on the glass, please.' },
        { task: 'toilet', options: ['deep-clean'] },
        { task: 'bathroom-sink' },
        { task: 'mirrors', quantity: 2 }
    ], 'shower'],
    ['second', 'bedroom', "Emma's room", [
        { task: 'make-bed', quantity: 1 }
    ]],
    ['second', 'bedroom', "Noah's room", [
        { task: 'make-bed', quantity: 1 }
    ]],
    ['second', 'bedroom', 'Guest room', [
        { task: 'change-linens', quantity: 1 }
    ]],
    ['second', 'bathroom', 'Hall bath', [
        { task: 'toilet' },
        { task: 'bathtub' }
    ]],
    ['basement', 'family', 'Basement family room', [
        { task: 'vacuum-floor', size: 'large' }
    ]]
];

/**
 * A document with the example home added and on the plinth. `check` is the
 * sheet's rule (sheet.js checkChoice), so an example the current sheet cannot
 * price is refused here rather than shown. Returns { doc, error }.
 *
 * An example from before (removed, in a browser that saved it while the
 * page still had My checklists, and so kept for its undo with the same
 * fixed id) is replaced, never joined by a second record
 * of its id: the steps would find the removed one and refuse (QA,
 * 2026-10-14: a removed example would not come back).
 */
export function withExample(doc, config, now, check) {
    const start = { ...doc, checklists: doc.checklists.filter((c) => c.id !== EXAMPLE_ID) };
    const steps = [
        (d) => createChecklist(d, {
            title: 'Example home',
            levels: ['basement', 'main', 'second'],
            visitFrequency: 'biweekly',
            household: 'Parking in the driveway. Supplies are under the kitchen sink.'
        }, config, now, { id: EXAMPLE_ID, sample: true }),
        (d) => setPreferences(d, EXAMPLE_ID, {
            keys: ['pet-safe', 'pets-home'],
            note: 'Our dog, Juniper, is friendly and stays in the yard during visits.'
        }, config, now)
    ];
    ROOMS.forEach(([level, area, label, tasks, bath], r) => {
        const roomId = `example-room-${r + 1}`;
        steps.push((d) => addRoom(d, EXAMPLE_ID, { level, area, label, bath }, config, now, { id: roomId, sample: true }));
        tasks.forEach((t, i) => {
            steps.push((d) => addItem(d, EXAMPLE_ID, { ...t, roomId }, config, now,
                { id: `example-task-${r + 1}-${i + 1}`, sample: true, check }));
        });
    });
    let current = start;
    for (const step of steps) {
        const result = step(current);
        if (result.error) return { doc, error: result.error };
        current = result.doc;
    }
    return { doc: setSettings(current, { activeId: EXAMPLE_ID }).doc, error: null };
}

/** For tests: the example's shape, as written above. */
export const __test__ = { ROOMS };
