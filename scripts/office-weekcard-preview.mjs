// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * office-weekcard-preview.mjs - the Corner Office's week card (weekcard.js),
 * drawn for a handful of sample weeks, to judge by eye before it is wired
 * into the scene (the "a preview renderer beats guessing" lesson).
 *
 *   npm run build && node scripts/office-weekcard-preview.mjs
 *
 * Writes specs/office/weekcard-preview.html (git-ignored), which opens
 * straight from the disk. weekcard.js is inlined with its `export`s removed,
 * so the cards are drawn by the browser's own canvas in its own fonts,
 * exactly as the scene will draw them. The models are built here, by the
 * office's real store and whiteboard code.
 *
 * Each sample is drawn twice: over a busy stand-in for the office window
 * (the hard case for legibility; the real frame comes in step 2) and over
 * the evening sky a browser gets when the office cannot be rendered.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, setSettings } from '../www/office/js/store.js';
import { weekCardModel } from '../www/office/js/whiteboard.js';
import { addDays, formatDate, weekStart } from '../www/office/js/dates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'office', 'weekcard-preview.html');
const NOW = new Date(2026, 9, 21, 12, 0, 0);

/** Eight weeks, oldest first, the last one this week (sent Monday to today). */
const SAMPLES = [
    { title: 'A first week', goal: 5, weeks: [0, 0, 0, 0, 0, 0, 0, 1] },
    { title: 'Short of the goal', goal: 5, weeks: [2, 4, 5, 3, 6, 5, 4, 3] },
    { title: 'Right on the goal', goal: 5, weeks: [3, 5, 4, 6, 5, 2, 5, 5] },
    { title: 'Well past the goal', goal: 5, weeks: [4, 6, 5, 7, 8, 6, 9, 12] },
    { title: 'A bigger goal', goal: 20, weeks: [12, 18, 22, 19, 25, 21, 17, 23] },
    { title: 'The largest numbers', goal: 100, weeks: [80, 95, 100, 100, 90, 100, 100, 100] }
];

function docFor(sample) {
    let doc = setSettings(emptyDoc(CONFIG, NOW), { weeklyGoal: sample.goal }, CONFIG).doc;
    const thisMonday = weekStart(NOW);
    sample.weeks.forEach((n, i) => {
        const monday = addDays(thisMonday, -7 * (sample.weeks.length - 1 - i));
        const days = i === sample.weeks.length - 1 ? 3 : 5;
        for (let k = 0; k < n; k++) {
            const fields = { company: `Sample Company ${i}-${k}`, role: 'Sample Role', appliedOn: formatDate(addDays(monday, k % days)) };
            doc = addApplication(doc, fields, CONFIG, NOW).doc;
        }
    });
    return doc;
}

const models = SAMPLES.map((s) => {
    const m = weekCardModel(docFor(s), CONFIG, NOW);
    return { title: s.title, lines: m.lines, chart: m.chart };
});

const painter = (await readFile(path.join(ROOT, 'www', 'office', 'js', 'weekcard.js'), 'utf8'))
    .replace(/^export /gm, '');

const { width: W, height: H } = CONFIG.weekCard;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Week card preview</title>
<style>
    body { margin: 0; padding: 24px; background: #15110e; color: #f2e6d8; font: 15px system-ui, sans-serif; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { margin: 0 0 20px; color: #bfae9c; }
    section { display: flex; flex-wrap: wrap; gap: 28px; }
    figure { margin: 0; }
    figcaption { margin-bottom: 8px; font-weight: 600; }
    canvas { width: 324px; height: auto; margin-right: 10px; border-radius: 6px; }
</style>
</head>
<body>
<h1>Week card preview</h1>
<p>Drawn ${NOW.toDateString()}. Left of each pair: over a stand-in for the office window (the real frame comes in step 2). Right: the evening sky a browser gets when the office cannot be rendered. Click a card to see it full size.</p>
<section id="cards"></section>
<script>
${painter}

const MODELS = ${JSON.stringify(models)};

/** A busy stand-in for the office at golden hour: sky, sun, towers with lit
 *  windows, the window's frame and the desk. Landscape, so the crop shows. */
function standIn() {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const g = c.getContext('2d');
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sky = g.createLinearGradient(0, 0, 0, 900);
    sky.addColorStop(0, '#5d86c4');
    sky.addColorStop(0.55, '#f2c49a');
    sky.addColorStop(1, '#ffdfa8');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.arc(1080, 560, 70, 0, Math.PI * 2);
    g.fill();
    for (let x = -20; x < 1600; x += 60 + rand() * 90) {
        const w = 70 + rand() * 110;
        const top = 300 + rand() * 420;
        g.fillStyle = rand() < 0.5 ? '#3c4660' : '#56607a';
        g.fillRect(x, top, w, 1200 - top);
        for (let y = top + 16; y < 1100; y += 26) {
            for (let wx = x + 10; wx < x + w - 12; wx += 20) {
                if (rand() < 0.35) {
                    g.fillStyle = rand() < 0.5 ? '#ffd68a' : '#fbe7c2';
                    g.fillRect(wx, y, 9, 12);
                }
            }
        }
    }
    g.fillStyle = '#22252b';
    for (const x of [0, 520, 1060, 1580]) g.fillRect(x, 0, 24, 1200);
    g.fillRect(0, 0, 1600, 24);
    g.fillRect(0, 880, 1600, 18);
    const desk = g.createLinearGradient(0, 980, 0, 1200);
    desk.addColorStop(0, '#d8d4cc');
    desk.addColorStop(1, '#9a958c');
    g.fillStyle = desk;
    g.fillRect(0, 1000, 1600, 200);
    return c;
}

const photo = standIn();
const holder = document.getElementById('cards');
for (const m of MODELS) {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = m.title;
    fig.appendChild(cap);
    for (const p of [photo, null]) {
        const c = document.createElement('canvas');
        c.width = ${W};
        c.height = ${H};
        drawWeekCard(c.getContext('2d'), c.width, c.height, { lines: m.lines, chart: m.chart, photo: p });
        c.title = 'Open full size';
        c.style.cursor = 'zoom-in';
        c.addEventListener('click', () => c.toBlob((b) => window.open(URL.createObjectURL(b))));
        fig.appendChild(c);
    }
    holder.appendChild(fig);
}
</script>
</body>
</html>
`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, page);
console.log(`Wrote ${path.relative(ROOT, OUT)} (${models.length} samples).`);
