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
import { XO_CONFIG as CFG } from './config.min.js';
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

    // SHARING IS THE POINT OF A SCORE. A number nobody else ever sees is a
    // number that stops mattering the moment the card closes, and this is the
    // one screen in the game where a visitor has something to say.
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'hud-btn';
    share.id = 'summary-share';
    share.textContent = 'Share';
    share.setAttribute('aria-label', 'Share your score');
    share.addEventListener('click', () => shareScore(stats.total));
    box.appendChild(share);

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

/**
 * What a visitor sends, which carries the score and nothing else.
 *
 * Exported and pure so the wording can be asserted without a share sheet: it
 * has to name the game, the number and the perfect score, because a bare "230"
 * arriving in somebody's messages means nothing at all.
 */
export function shareText(total) {
    const perfect = CFG.rules.playsPerGame * CFG.rules.crossing;
    return `I scored ${total} out of a possible ${perfect} in X's and O's, `
        + 'a browser football game on SceneXP.';
}

/**
 * The device's own share sheet, a clipboard copy, or an email, in that order.
 *
 * The same ladder every other scene on this site uses. The URL is derived from
 * where the page is actually being served rather than written down, so a share
 * is correct on localhost, on a staging host and in production without anybody
 * remembering to change a constant.
 */
export async function shareScore(total) {
    const url = new URL('.', window.location.href).href;
    const data = { title: "X's and O's", text: shareText(total), url };
    try {
        if (navigator.share) {
            await navigator.share(data);
            return 'native';
        }
    } catch (e) {
        // Backing out of the sheet is not a failure and must not fall through
        // to a clipboard copy the visitor did not ask for.
        if (e && e.name === 'AbortError') return 'cancelled';
    }
    try {
        await navigator.clipboard.writeText(`${data.text} ${url}`);
        flashShared('Link copied');
        return 'copy';
    } catch (e) {
        window.location.href = `mailto:?subject=${encodeURIComponent(data.title)}`
            + `&body=${encodeURIComponent(`${data.text} ${url}`)}`;
        return 'mail';
    }
}

/** Say so on the button itself, because a copy with no acknowledgement reads
 *  as a button that did nothing. */
function flashShared(message) {
    const btn = el('summary-share');
    if (!btn) return;
    const was = btn.textContent;
    btn.textContent = message;
    btn.disabled = true;
    window.setTimeout(() => { btn.textContent = was; btn.disabled = false; }, 1800);
}

export function hideSummary() {
    const card = el('summary');
    if (card) card.hidden = true;
}
