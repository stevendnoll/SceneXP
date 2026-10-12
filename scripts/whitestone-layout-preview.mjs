// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-layout-preview.mjs - A page of generated homes, drawn from
 * above, for reviewing the house model's layout by eye (TASKS M2).
 *
 *   node scripts/whitestone-layout-preview.mjs
 *
 * Writes specs/whitestone/previews/layouts.html (git-ignored): the example
 * home and a dozen others, from a studio apartment to forty rooms, each
 * level drawn top-down at the same scale with its room names and a pin per
 * task (starred tasks darker). One self-contained file of inline SVG, no
 * scripts, so it opens straight from the disk.
 *
 * Run `npm run build` first: layout.js imports the built taxonomy.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutHome } from '../www/whitestone/js/layout.js';
import { TAXONOMY, roomName } from '../www/whitestone/js/taxonomy.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { CONFIG } from '../www/whitestone/js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'whitestone', 'previews', 'layouts.html');
const SCALE = 300;   // pixels per model meter
const AREAS = TAXONOMY.cleaning.areas;

const escape = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A home from a list of [level, area, label, tasks, starred]. */
function home(title, levels, rooms) {
    const out = { title, serviceType: 'cleaning', levels, rooms: [], items: [] };
    rooms.forEach(([level, area, label, tasks = 3, starred = 0], r) => {
        const id = `room-${r}`;
        out.rooms.push({ id, level, area, label });
        for (let i = 0; i < tasks; i++) out.items.push({ id: `${id}-task-${i}`, roomId: id, order: i + 1, important: i < starred });
    });
    return out;
}

function seeded(n) {
    let a = (n * 2654435761) >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomHome(n) {
    const r = seeded(n);
    const levels = ['main', 'second', 'basement'].filter((l, i) => i === 0 || r() < 0.6);
    const rooms = [];
    const count = 4 + Math.floor(r() * 18);
    for (let i = 0; i < count; i++) {
        rooms.push([levels[Math.floor(r() * levels.length)], AREAS[Math.floor(r() * AREAS.length)].key, '',
            Math.floor(r() * 9), Math.floor(r() * 2)]);
    }
    return home(`Random home ${n} (${count} rooms)`, levels, rooms);
}

const NOW = new Date('2026-10-12T16:00:00Z');
const example = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];

const HOMES = [
    { ...example, title: 'The example home' },
    home('A studio apartment', ['main'], [['main', 'living', '', 4, 1], ['main', 'bathroom', '', 3]]),
    home('One room, no tasks yet', ['main'], [['main', 'kitchen', '', 0]]),
    home('Levels with nothing on them yet', ['basement', 'main', 'second', 'attic'], []),
    home('A garage and a detached garage', ['main', 'garage', 'detached-garage'],
        [['main', 'kitchen', '', 5], ['main', 'living', '', 4], ['garage', 'garage', '', 2], ['detached-garage', 'garage', 'Workshop', 1]]),
    home('Every kind of room on one floor', ['main'], AREAS.map((a) => ['main', a.key, '', 3])),
    home('A big kitchen task list', ['main'], [['main', 'kitchen', '', 40, 5], ['main', 'pantry', '', 3]]),
    home('Four bedrooms, a closet each', ['second'], [
        ['second', 'primary-bedroom', '', 3], ['second', 'closet', 'Primary closet', 1],
        ['second', 'bedroom', 'Emma', 2], ['second', 'closet', 'Emma closet', 1],
        ['second', 'bedroom', 'Noah', 2], ['second', 'closet', 'Noah closet', 1],
        ['second', 'bedroom', 'Guest', 1], ['second', 'closet', 'Guest closet', 1]]),
    home('Forty rooms, three floors', ['basement', 'main', 'second'],
        Array.from({ length: 40 }, (_, i) => [['basement', 'main', 'second'][i % 3], AREAS[i % AREAS.length].key, '', 2])),
    randomHome(1), randomHome(2), randomHome(3), randomHome(4)
];

function drawHome(h) {
    const lay = layoutHome(h);
    const rooms = new Map(h.rooms.map((r) => [r.id, r]));
    const levelName = (key) => (TAXONOMY.cleaning.levels.find((l) => l.key === key) || { name: key }).name;
    const svgs = lay.slabs.map((s) => {
        const w = s.width * SCALE;
        const d = s.depth * SCALE;
        const X = (x) => (x - (s.x - s.width / 2)) * SCALE;
        const Z = (z) => (z - (s.z - s.depth / 2)) * SCALE;
        const parts = [`<rect x="0" y="0" width="${w}" height="${d}" rx="6" fill="#E9E5DD" stroke="#B9B3A9"/>`];
        for (const t of lay.tiles.filter((x) => x.level === s.level)) {
            const room = rooms.get(t.roomId);
            parts.push(`<rect x="${X(t.x - t.width / 2)}" y="${Z(t.z - t.depth / 2)}" width="${t.width * SCALE}" height="${t.depth * SCALE}" fill="#FFFFFF" stroke="#3E5C76" stroke-width="1"/>`);
            parts.push(`<text x="${X(t.x)}" y="${Z(t.z - t.depth / 2) + 13}" text-anchor="middle" font-size="10" fill="#22252A">${escape(roomName('cleaning', room))}</text>`);
            const asp = Math.max(t.width / t.depth, t.depth / t.width);
            if (asp > 3) parts.push(`<text x="${X(t.x)}" y="${Z(t.z + t.depth / 2) - 4}" text-anchor="middle" font-size="9" fill="#9B2C1F">${asp.toFixed(1)} to 1</text>`);
        }
        for (const m of lay.markers.filter((x) => lay.tiles.find((t) => t.roomId === x.roomId).level === s.level)) {
            const size = Math.max(m.size * SCALE, 1);
            parts.push(`<rect x="${X(m.x) - size / 2}" y="${Z(m.z) - size / 2}" width="${size}" height="${size}" rx="${size / 3}" fill="${m.important ? '#22252A' : '#3E5C76'}"/>`);
        }
        return `<figure><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${d}" viewBox="0 0 ${w} ${d}">${parts.join('')}</svg>`
            + `<figcaption>${escape(levelName(s.level))}${s.kind === 'story' ? '' : ` (${s.kind})`}</figcaption></figure>`;
    });
    const count = `${h.rooms.length} rooms, ${h.items.length} tasks`;
    return `<section><h2>${escape(h.title)}</h2><p>${count}</p><div class="levels">${svgs.join('') || '<p>No levels</p>'}</div></section>`;
}

const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Whitestone layouts</title>
<style>
body { margin: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #22252A; background: #F4F2EE; }
section { margin: 0 0 40px; padding: 16px 20px; background: #FFFFFF; border-radius: 12px; }
h2 { margin: 0; font-size: 18px; } p { margin: 4px 0 12px; color: #5E5952; font-size: 13px; }
.levels { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
figure { margin: 0; } figcaption { margin-top: 4px; font-size: 12px; color: #5E5952; }
</style></head><body>
<h1>House model layouts</h1>
<p>Generated by scripts/whitestone-layout-preview.mjs. Each level from above at the same scale. Pins are tasks, darker pins are starred. A red note marks any room stretched past 3 to 1.</p>
${HOMES.map(drawHome).join('\n')}
</body></html>
`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, page);
console.log(`Wrote ${path.relative(ROOT, OUT)} with ${HOMES.length} homes.`);
