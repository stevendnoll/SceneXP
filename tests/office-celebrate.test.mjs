// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * What the office celebrates (celebrate.js) and the fireworks it sets off
 * (fireworks.js): every application sent, the week's goal, an offer; never
 * the samples, a restore or a record back out of the wastebasket.
 */
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, setStatus, deleteRecord, restoreRecord, setSettings } from '../www/office/js/store.js';
import { stockSamples } from '../www/office/js/samples.js';
import { celebrationFor, champagneToday } from '../www/office/js/celebrate.js';
import { FIREWORKS, MAX_SHELLS, SHELL_SECONDS, showFor, shellLights } from '../www/office/js/fireworks.js';

const NOW = new Date(2026, 8, 30, 10, 0);
const add = (doc, fields) => addApplication(doc, { company: 'Acme', role: 'Designer', ...fields }, CONFIG, NOW);

describe('what is celebrated', () => {
    test('an application sent, with the week\'s count and what is left of the goal', () => {
        const before = emptyDoc(CONFIG, NOW);
        const one = add(before, {});
        const party = celebrationFor(before, one.doc, CONFIG, NOW);
        expect(party.kind).toBe('applied');
        expect(party.line).toBe("Application sent. That's your first this week.");
        const two = add(one.doc, { company: 'Globex' });
        expect(celebrationFor(one.doc, two.doc, CONFIG, NOW).line).toBe("Application sent. That's 2 this week, 3 to go.");
        // House style: no em dashes, no semicolons.
        expect(party.line).not.toMatch(/[—;]/);
    });

    test('saved is not sent; sending it later is', () => {
        const before = emptyDoc(CONFIG, NOW);
        const saved = add(before, { status: 'saved' });
        expect(celebrationFor(before, saved.doc, CONFIG, NOW)).toBeNull();
        const sent = setStatus(saved.doc, saved.record.id, 'applied', CONFIG, NOW);
        expect(celebrationFor(saved.doc, sent.doc, CONFIG, NOW).kind).toBe('applied');
    });

    test('the week\'s goal, reached', () => {
        let doc = setSettings(emptyDoc(CONFIG, NOW), { weeklyGoal: 2 }, CONFIG).doc;
        doc = add(doc, {}).doc;
        const next = add(doc, { company: 'Globex' });
        const party = celebrationFor(doc, next.doc, CONFIG, NOW);
        expect(party.kind).toBe('goal');
        expect(party.line).toBe('That makes 2 this week, your weekly goal. Wonderful work!');
        // Past the goal, an application is an application again.
        const third = add(next.doc, { company: 'Initech' });
        expect(celebrationFor(next.doc, third.doc, CONFIG, NOW).kind).toBe('applied');
    });

    test('an offer, and an offer accepted, above all', () => {
        const doc = add(emptyDoc(CONFIG, NOW), {});
        const offer = setStatus(doc.doc, doc.record.id, 'offer', CONFIG, NOW);
        expect(celebrationFor(doc.doc, offer.doc, CONFIG, NOW)).toMatchObject({ kind: 'offer', line: 'An offer from Acme. Congratulations!' });
        const accepted = setStatus(offer.doc, doc.record.id, 'accepted', CONFIG, NOW);
        // From an offer to accepting it: already celebrated.
        expect(celebrationFor(offer.doc, accepted.doc, CONFIG, NOW)).toBeNull();
        const straight = setStatus(doc.doc, doc.record.id, 'accepted', CONFIG, NOW);
        expect(celebrationFor(doc.doc, straight.doc, CONFIG, NOW).line).toBe('You accepted the offer from Acme. Congratulations!');
    });

    test('never the samples, nor a record back out of the wastebasket, nor a rejection', () => {
        const before = emptyDoc(CONFIG, NOW);
        const stocked = stockSamples(before, CONFIG, NOW);
        expect(celebrationFor(before, stocked.doc, CONFIG, NOW)).toBeNull();
        const one = add(before, {});
        const binned = deleteRecord(one.doc, 'applications', one.record.id, CONFIG, NOW);
        const back = restoreRecord(binned.doc, 'applications', one.record.id, CONFIG, NOW);
        expect(celebrationFor(binned.doc, back.doc, CONFIG, NOW)).toBeNull();
        const no = setStatus(one.doc, one.record.id, 'rejected', CONFIG, NOW);
        expect(celebrationFor(one.doc, no.doc, CONFIG, NOW)).toBeNull();
    });

    test('champagne the day an offer comes in, and not the day after', () => {
        const doc = add(emptyDoc(CONFIG, NOW), {});
        expect(champagneToday(doc.doc, NOW)).toBe(false);
        const offer = setStatus(doc.doc, doc.record.id, 'offer', CONFIG, NOW);
        expect(champagneToday(offer.doc, NOW)).toBe(true);
        expect(champagneToday(offer.doc, new Date(2026, 9, 1, 10, 0))).toBe(false);
    });
});

describe('the fireworks', () => {
    test('one shell for an application, a volley for the goal, the whole show for an offer, its finale gold and biggest', () => {
        expect(showFor('applied')).toHaveLength(1);
        expect(showFor('goal')).toHaveLength(FIREWORKS.shows.goal.shells);
        const show = showFor('offer', 3);
        expect(show).toHaveLength(MAX_SHELLS);
        const finale = show.at(-1);
        expect(finale.color).toEqual(FIREWORKS.colors[0]);
        expect(finale.speed).toBeGreaterThan(Math.max(...show.slice(0, -1).map((s) => s.speed)));
        expect(finale.at).toBeGreaterThan(show.at(-2).at);
        // No two shows alike.
        expect(showFor('offer', 4).map((s) => s.x)).not.toEqual(show.map((s) => s.x));
    });

    test('over the bay down the office\'s street, a little above the office\'s height', () => {
        for (const s of showFor('offer', 1)) {
            const bearing = (Math.atan2(s.x, -s.z) * 180) / Math.PI;
            expect(Math.abs(bearing - FIREWORKS.site.bearing)).toBeLessThan(7);
            expect(Math.hypot(s.x, s.z)).toBeGreaterThan(1400);
            expect(s.height).toBeGreaterThan(195);
            expect(s.height).toBeLessThan(400);
        }
    });

    test('a rocket climbs, then bursts into stars that spread, fall, fade and are gone', () => {
        const [shell] = showFor('applied');
        const n = 1 + FIREWORKS.burst.count;
        const out = new Float32Array(n * 3);
        const rgba = new Float32Array(n * 4);
        const at = (t) => {
            shellLights(shell, t, -195, out, rgba, 0);
            return { rocket: [out[0], out[1], out[2], rgba[3]], stars: Array.from({ length: n - 1 }, (_, i) => [out[(i + 1) * 3], out[(i + 1) * 3 + 1], out[(i + 1) * 3 + 2], rgba[(i + 1) * 4 + 3]]) };
        };
        const early = at(0.5);
        const later = at(1.2);
        expect(later.rocket[1]).toBeGreaterThan(early.rocket[1]);
        expect(early.rocket[3]).toBe(1);
        expect(early.stars.every((s) => s[3] === 0)).toBe(true);
        const burst = at(FIREWORKS.rise + 0.8);
        expect(burst.rocket[3]).toBe(0);
        const top = -195 + shell.height;
        const spread = Math.max(...burst.stars.map((s) => Math.hypot(s[0] - shell.x, s[1] - top, s[2] - shell.z)));
        expect(spread).toBeGreaterThan(40);
        // Round: every star about as far out as every other (and falling alike).
        const reaches = burst.stars.map((s) => Math.hypot(s[0] - shell.x, s[1] - top + 0.5 * 9.8 * 0.64 * 0.6, s[2] - shell.z));
        expect(Math.max(...reaches) - Math.min(...reaches)).toBeLessThan(1);
        expect(at(FIREWORKS.rise + 2).stars[0][1]).toBeLessThan(at(FIREWORKS.rise + 1).stars[0][1] + 60);
        const gone = at(SHELL_SECONDS + 0.01);
        expect(gone.stars.every((s) => s[3] === 0)).toBe(true);
    });
});
