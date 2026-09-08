// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * summary.js - How the ten plays went.
 *
 * The card at the end of a game: the total, a line about it, a play-by-play,
 * and the best score this browser has seen.
 *
 * THE BEST SCORE IS THE ONLY THING THAT OUTLIVES THE VISIT, and because it
 * does, it is named in www/privacy.html along with how to clear it, the way
 * every persistent key on this site has to be. `tests/privacy.test.mjs` holds
 * the list of files allowed to write persistent storage and fails the moment a
 * new one joins them, which is the reminder rather than the rule.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';
import { summarise, verdictFor } from './scoring.min.js';

const el = (id) => document.getElementById(id);

export function readBest() {
    try {
        const raw = localStorage.getItem(CFG.storage.best);
        const n = raw === null ? 0 : Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : 0;
    } catch (e) {
        return 0;   // private mode. A best score is not worth an exception.
    }
}

export function writeBest(total) {
    try {
        localStorage.setItem(CFG.storage.best, String(total));
    } catch (e) { /* nothing here is worth failing a game over */ }
}

/**
 * Show the end card.
 *
 * `plays` is the list of per-play outcomes in order. `onAgain` is called when
 * the visitor wants another ten.
 */
export function showSummary(plays, onAgain) {
    const card = el('summary');
    if (!card) return;

    const stats = summarise(plays);
    const previousBest = readBest();
    const isRecord = stats.total > previousBest;
    if (isRecord) writeBest(stats.total);

    el('summary-total').textContent = `${stats.total}`;
    el('summary-verdict').textContent = verdictFor(stats.total);

    el('summary-line').textContent =
        `${stats.scored} of ${stats.plays} plays scored`
        + (stats.gaveAway ? `, and ${stats.gaveAway} cost you.` : '.');

    const bestLine = el('summary-best');
    bestLine.textContent = isRecord
        ? (previousBest > 0 ? `A new best, past ${previousBest}.` : 'A new best.')
        : `Your best is ${previousBest}.`;

    // The play-by-play, as a real list so it reads correctly out loud.
    const list = el('summary-plays');
    list.textContent = '';
    plays.forEach((p, i) => {
        const row = document.createElement('li');
        row.className = 'summary-row';

        const n = document.createElement('span');
        n.className = 'summary-n';
        n.textContent = `${i + 1}`;
        row.appendChild(n);

        const what = document.createElement('span');
        what.className = 'summary-what';
        what.textContent = p.headline;
        row.appendChild(what);

        const pts = document.createElement('span');
        pts.className = `summary-pts ${p.points > 0 ? 'is-good' : p.points < 0 ? 'is-bad' : 'is-neutral'}`;
        pts.textContent = `${p.points > 0 ? '+' : ''}${p.points}`;
        row.appendChild(pts);

        list.appendChild(row);
    });

    const box = el('summary-actions');
    box.textContent = '';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'hud-btn hud-btn-primary';
    again.textContent = 'Play again';
    again.addEventListener('click', () => { hideSummary(); if (onAgain) onAgain(); });
    box.appendChild(again);

    card.hidden = false;
    again.focus();
    return stats;
}

export function hideSummary() {
    const card = el('summary');
    if (card) card.hidden = true;
}
