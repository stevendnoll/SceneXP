// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * progress.js - A game in progress, kept where a reload cannot lose it.
 *
 * QA ITEM 10. Ten plays take a few minutes, and until now closing the tab or
 * pressing reload halfway through threw all of it away, which is a mean thing
 * to do to somebody who was seven plays into a good round.
 *
 * IT SAVES AT THE WHISTLE AND NOT DURING A PLAY. Restoring a play already in
 * flight would mean storing the whole simulation, which is nineteen objects of
 * physics state plus a recording, and the visitor would come back to a ball in
 * mid-air with no idea what they had chosen to do with it. Saving at play
 * boundaries means a reload during play four costs play four and nothing else,
 * and the visitor resumes by choosing it again, which is where they were.
 *
 * WHAT IS STORED IS THE SCOREBOARD, NOT THE GAME. Play number, running total,
 * and one line per play for the summary card. No coordinates, no formation, no
 * recording: everything here is already on screen in the HUD, so there is
 * nothing in it a visitor would be surprised to find written down.
 *
 * NAMED IN www/privacy.html, like every persistent key on this site, and
 * tests/privacy.test.mjs holds the list of files allowed to write one.
 */
import { XO_CONFIG as CFG } from './config.min.js';

/** Bumped when the shape below changes. An older or newer shape is discarded
 *  rather than half-read, because a game restored into the wrong fields is
 *  worse than a game not restored at all. */
const VERSION = 1;

/**
 * What is worth keeping about one finished play.
 *
 * The summary card reads `headline` and `points`, the result card reads
 * `detail` as well, and `result` is what `worthWatching` and the stats count.
 * Anything else scoring.js produces is derived and can be derived again.
 */
function trim(outcome) {
    return {
        headline: String(outcome.headline || ''),
        detail: String(outcome.detail || ''),
        points: Number(outcome.points) || 0,
        result: String(outcome.result || ''),
    };
}

/** Write the game so far. Silently does nothing in private mode, because
 *  nothing here is worth failing a play over. */
export function saveGame({ playNumber, total, results }) {
    try {
        localStorage.setItem(CFG.storage.game, JSON.stringify({
            v: VERSION,
            playNumber: Number(playNumber) || 0,
            total: Number(total) || 0,
            results: (results || []).map(trim),
        }));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * The game to resume, or null.
 *
 * NULL IS THE ANSWER FOR ANYTHING DOUBTFUL, including a finished game. Ten
 * plays are ten plays: somebody who reloads after the summary card wants a new
 * one, not to be handed a game with nothing left to play. Everything is checked
 * rather than trusted, because this is a string a visitor could have edited by
 * hand and a `results` that is not an array would take the summary card down.
 */
export function readGame() {
    try {
        const raw = localStorage.getItem(CFG.storage.game);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (!saved || saved.v !== VERSION) return null;
        if (!Array.isArray(saved.results)) return null;
        const playNumber = Number(saved.playNumber);
        if (!Number.isFinite(playNumber)) return null;
        if (playNumber < 1 || playNumber >= CFG.rules.playsPerGame) return null;
        // The count has to agree with the list, or the play number and the
        // scorecard are telling a visitor two different stories.
        if (saved.results.length !== playNumber) return null;
        return {
            playNumber,
            total: Number(saved.total) || 0,
            results: saved.results.map(trim),
        };
    } catch (e) {
        return null;
    }
}

export function clearGame() {
    try {
        localStorage.removeItem(CFG.storage.game);
        return true;
    } catch (e) {
        return false;
    }
}
