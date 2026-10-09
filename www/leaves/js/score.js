// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * score.js - where the leaves ended up, and what to say about it.
 *
 * ---- WHAT "CLEARED" MEANS ----
 *
 * A leaf is cleared once it is off the open lawn, wherever it went: onto the
 * tarp, into the street, or over the fence into the neighbor's yard. That is
 * the number on the HUD and on the share card, because it is the one a
 * visitor can see for themselves (the grass is showing or it is not).
 *
 * WHERE THEY WENT STILL MATTERS, and the end card says so. The tarp is the
 * proper job, and the pile on it is what the finale dives into (M3). The
 * street is the shortcut, and the end card notices. The neighbor's yard is
 * the bad-neighbor shortcut, and the neighbor notices (M2).
 *
 * Measured with a bot on 2026-10-06, for a sense of the numbers: sweeping
 * everything into the street cleared about 53% in sixty seconds (the round was a
 * minute then, three minutes since Steve's QA of 2026-10-08), and sweeping
 * toward the tarp in the corner about 16%, with a pile 1.3 meters high. A
 * visitor who knows what they are doing will beat both.
 *
 * ON THE PORCH IS NOT ON THE LAWN (M6 QA). The porch, its step and the
 * pumpkins stand inside the lawn's rectangle, and a leaf blown up onto one
 * cannot be blown back off (nobody can stand behind it), so it counted
 * against the lawn forever. A leaf on anything raised there (`sim.floor`)
 * is counted `porch`, off the lawn.
 *
 * A LEAF COUNTS WHERE IT LANDS (Steve's QA, 2026-10-08: blowing leaves
 * across the porch, the score "will jump from like 80% to 96% and then drop
 * back down to 85%"). It counted every leaf where it was that moment, so a
 * drift blown over the porch counted `porch` while it was in the air above
 * it (555 leaves at once in a measured sweep), and lawn again once it came
 * down on the far side. Now a leaf still moving counts where it last came to
 * rest (`landed`, kept by the page), so the score moves only when leaves
 * settle: a leaf blown into the street counts once it lands there, a moment
 * later, and one blown over the porch never counts until it stops.
 *
 * PURE: the copy lives here so the house style is tested (no em dashes, no
 * semicolons, American spelling).
 */

/** The regions, by the code tally() keeps in `landed` (0 is none yet). */
export const REGIONS = Object.freeze(['lawn', 'tarp', 'street', 'neighbor', 'porch']);

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** Which region a point is in: 'street' (the sidewalk and the street, in
 *  front of the yard, and anywhere down the block past the hedge or his
 *  side fence, which only the sidewalk leads to), 'neighbor' (past the
 *  picket fence), 'tarp', or 'lawn'. */
export function regionOf(x, z, yard) {
    if (z >= yard.lawn.maxZ || x < yard.lawn.minX) return 'street';
    if (yard.neighborYard && x > yard.neighborYard.maxX) return 'street';
    if (x > yard.lawn.maxX) return 'neighbor';
    if (inRect(yard.tarp, x, z)) return 'tarp';
    return 'lawn';
}

/** Whether the ground at (x, z) is raised: the porch, a step, a pumpkin. */
function raised(sim, x, z) {
    const b = sim.bounds;
    const ix = Math.min(sim.nx - 1, Math.max(0, Math.floor((x - b.minX) / sim.cell)));
    const iz = Math.min(sim.nz - 1, Math.max(0, Math.floor((z - b.minZ) / sim.cell)));
    return sim.floor[iz * sim.nx + ix] > 0;
}

/**
 * How many leaves are in each region: { lawn, tarp, street, neighbor,
 * porch, total }, plus where on the neighbor's lawn ours lie (`nearZ`, `farZ`
 * along the fence and `deepX` the farthest in, for him to aim at). Walks
 * every leaf, so call it a few times a second, not every frame.
 *
 * Leaves still hanging in a tree's crown (M5) are left out, total and all,
 * and so are leaves let go of by a crown and still on their way down (M6).
 * A leaf on the porch, its step or a pumpkin is `porch`.
 *
 * `sent`, if given, is one flag per leaf, set here for every leaf found on
 * the neighbor's lawn and never cleared, and its count comes back as
 * `sent`: every leaf that went over the fence this round, even the ones he
 * has since blown back.
 *
 * `landed`, if given, is one byte per leaf (zeroed with the yard): where it
 * last lay at rest, as 1 + its index in REGIONS, written here for every
 * sleeping leaf. A leaf still moving counts there, not where it is.
 */
export function tally(sim, yard, sent = null, landed = null) {
    const t = {
        lawn: 0, tarp: 0, street: 0, neighbor: 0, porch: 0, total: sim.count,
        sent: 0, nearZ: Infinity, farZ: -Infinity, deepX: -Infinity
    };
    for (let i = 0; i < sim.count; i++) {
        // A leaf still up in a tree's crown is not in the yard yet (M5).
        if ((sim.hanging && sim.hanging[i]) || (sim.falling && sim.falling[i])) {
            t.total--;
            continue;
        }
        const x = sim.px[i];
        const z = sim.pz[i];
        let where;
        if (landed && sim.awake[i] && landed[i]) {
            where = REGIONS[landed[i] - 1];
        } else {
            where = regionOf(x, z, yard);
            if (where === 'lawn' && sim.floor && raised(sim, x, z)) where = 'porch';
            if (landed && !sim.awake[i]) landed[i] = REGIONS.indexOf(where) + 1;
        }
        t[where]++;
        if (where === 'neighbor') {
            if (z < t.nearZ) t.nearZ = z;
            if (z > t.farZ) t.farZ = z;
            if (x > t.deepX) t.deepX = x;
            if (sent) sent[i] = 1;
        }
        if (sent && sent[i]) t.sent++;
    }
    if (!sent) t.sent = t.neighbor;
    return t;
}

/** The share of the leaves off the open lawn, 0 to 1. */
export function clearedShare(t) {
    return t.total > 0 ? 1 - t.lawn / t.total : 0;
}

/** A CLEAR LAWN HAS A SMALL MARGIN (Steve's QA, 2026-10-08: "1 single leaf
 *  will keep the score at 99%"). No more than this share of the yard's
 *  leaves left on it is clear: 24 of 24,000 on a desktop, 12 of 12,000 on a
 *  phone, scattered over 260 square meters. */
export const SPOTLESS_SHARE = 0.001;

/** How many leaves may still lie on a clear lawn, for a yard of `total`. */
export function leavesAllowed(total) {
    return Math.floor(Math.max(0, total) * SPOTLESS_SHARE);
}

/** Whether the lawn is clear, within the margin: 100%, the round's early
 *  finish and the free yard's celebration. */
export function isSpotless(t) {
    return t.total > 0 && t.lawn <= leavesAllowed(t.total);
}

/** How many more leaves must come off the lawn before it is clear. */
export function leavesToGo(t) {
    return t.total > 0 ? Math.max(0, t.lawn - leavesAllowed(t.total)) : 0;
}

/** The whole percent the HUD, the end card and the share show: 100 once
 *  the lawn is clear, and never 100 before. */
export function clearedPercent(t) {
    return isSpotless(t) ? 100 : Math.min(99, percent(clearedShare(t)));
}

/** At 99% the HUD counts down the last few (Steve's QA, 2026-10-08):
 *  "12 leaves to go". Empty otherwise. */
export function toGoText(t) {
    const n = leavesToGo(t);
    return n > 0 && clearedPercent(t) === 99 ? `${leaves(n)} to go` : '';
}

/** A share as a whole percent, rounded DOWN (clearedPercent adds the clear
 *  lawn's margin). */
export function percent(share) {
    return Math.max(0, Math.min(100, Math.floor(share * 100 + 1e-9)));
}

/** 4210 as "4,210". */
export function formatCount(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 180 as "3 minutes", 167 as "2 minutes and 47 seconds", 47 as "47
 *  seconds", for the share sentence. Whole seconds. */
export function durationText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const unit = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    if (!m) return unit(r, 'second');
    return r ? `${unit(m, 'minute')} and ${unit(r, 'second')}` : unit(m, 'minute');
}

/** "1 leaf", "312 leaves". */
export function leaves(n) {
    return n === 1 ? '1 leaf' : `${formatCount(n)} leaves`;
}

/** The clock as "1:00", "0:42", "0:05", counting whole seconds UP so it
 *  reads 0:01 until the very last moment and 0:00 only when time is up. */
export function clockText(seconds) {
    const s = Math.max(0, Math.ceil(seconds - 1e-9));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The end card's headline and its line, by how the round went. Each has a
 * `key` for the usage log. The neighbor comes first: sending him a quarter
 * of the yard is the story, however clean the lawn is.
 */
export function verdict(t) {
    const cleared = clearedShare(t);
    const share = (n) => (t.total > 0 ? n / t.total : 0);
    // EVERY LAST LEAF (Steve's QA, 2026-10-08: "We want the user to be able
    // to win"). A clear lawn is the headline, wherever the leaves went, and
    // the neighbor's share still gets its word.
    if (isSpotless(t)) {
        const line = share(t.neighbor) >= 0.25
            ? 'The lawn is clear, and a good share of it is in the yard next door. They noticed.'
            : 'The lawn is clear. The whole street will want to know your secret.';
        return { key: 'perfect', title: 'Not a leaf in sight', line };
    }
    if (share(t.neighbor) >= 0.25) {
        return { key: 'neighbor', title: 'The neighbors are talking', line: 'A good share of your yard is now in theirs. They noticed.' };
    }
    let base;
    if (cleared >= 0.9) base = { key: 'spotless', title: 'Yard of the month', line: 'The lawn is clear. Every neighbor on the street is a little jealous.' };
    else if (cleared >= 0.7) base = { key: 'great', title: 'Curb appeal restored', line: 'The grass can see the sky again. Well done.' };
    else if (cleared >= 0.45) base = { key: 'good', title: 'Respectable work', line: 'More lawn than leaves. That is a good afternoon.' };
    else if (cleared >= 0.2) base = { key: 'start', title: 'A solid start', line: 'The leaves are on notice. Another round should finish the job.' };
    else base = { key: 'leaves', title: 'The leaves win this round', line: 'They have the numbers. You have a leaf blower and another round.' };
    // The street shortcut, noticed kindly.
    if (t.street > t.tarp * 2 && share(t.street) >= 0.2) {
        base = { ...base, line: `${base.line} Most of it went into the street, which the street did not ask for.` };
    }
    return base;
}

/** The four rows of the end card, in the order a visitor reads them. */
export function resultRows(t) {
    return [
        { key: 'tarp', label: 'On the tarp', value: formatCount(t.tarp) },
        { key: 'street', label: 'In the street', value: formatCount(t.street) },
        { key: 'neighbor', label: 'Sent over the fence', value: formatCount(t.sent ?? t.neighbor) },
        { key: 'lawn', label: 'Still on the lawn', value: formatCount(t.lawn) }
    ];
}

/** The end card's line about the dive (M3): `landed` true, false, or null
 *  for no dive at all. */
export function diveLine(landed) {
    if (landed === null || landed === undefined) return '';
    return landed
        ? 'You took a running dive into the pile, and it caught you.'
        : 'You dove for the pile and found the lawn. Your back would like a word.';
}

/** "a", "a and b", "a, b, and c". */
export function listOf(names) {
    const list = (names || []).filter(Boolean);
    if (list.length <= 1) return list.join('');
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/** The end card's line about what turned up under the leaves (M6), by
 *  name, or nothing when nothing did. */
export function findsLine(names) {
    const list = listOf(names);
    return list ? `Under the leaves you found ${list}.` : '';
}

/** The sentence a visitor posts. The neighbor makes the better story when
 *  there is one, and the pile on the tarp otherwise. Then the dive, landed
 *  or not (`landed` null for none), and anything found under the leaves.
 *  `note` follows the time ("a new personal best", best.js). */
export function shareText(t, seconds, landed = null, found = [], note = '') {
    const head = `I cleared ${clearedPercent(t)}% of my yard in ${durationText(seconds)}${note ? `, ${note}` : ''}.`;
    const sent = t.sent ?? t.neighbor;
    let tail = '';
    if (sent > 0) tail = ` ${leaves(sent)} went to the neighbor.`;
    else if (t.tarp > 0 && landed !== true) tail = ` ${leaves(t.tarp)} made it onto the tarp.`;
    if (landed === true) tail += ` I landed the dive into a pile of ${leaves(t.tarp)}.`;
    if (landed === false) tail += ' I threw my back out diving into the pile.';
    const finds = listOf(found);
    if (finds) tail += ` I found ${finds} under the leaves.`;
    return `${head}${tail} A leaf blower game on SceneXP.`;
}

/** The result in one sentence, for a screen reader. */
export function resultSentence(t, landed = null, found = []) {
    const v = verdict(t);
    const dive = diveLine(landed);
    const finds = findsLine(found);
    return `${v.title}. ${clearedPercent(t)} percent of the lawn cleared, with ${leaves(t.tarp)} on the tarp, `
        + `${leaves(t.street)} in the street, and ${leaves(t.sent ?? t.neighbor)} sent over the fence.`
        + (dive ? ` ${dive}` : '') + (finds ? ` ${finds}` : '');
}
