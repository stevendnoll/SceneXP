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
 * everything into the street cleared about 53% in sixty seconds, and sweeping
 * toward the tarp in the corner about 16%, with a pile 1.3 meters high. A
 * visitor who knows what they are doing will beat both.
 *
 * PURE: the copy lives here so the house style is tested (no em dashes, no
 * semicolons, American spelling).
 */

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** Which region a point is in: 'street' (the sidewalk and the street, in
 *  front of the yard), 'neighbor' (past the picket fence), 'tarp', or
 *  'lawn'. */
export function regionOf(x, z, yard) {
    if (z >= yard.lawn.maxZ) return 'street';
    if (x > yard.lawn.maxX) return 'neighbor';
    if (inRect(yard.tarp, x, z)) return 'tarp';
    return 'lawn';
}

/** How many leaves are in each region: { lawn, tarp, street, neighbor,
 *  total }. Walks every leaf, so call it a few times a second, not every
 *  frame. */
export function tally(sim, yard) {
    const t = { lawn: 0, tarp: 0, street: 0, neighbor: 0, total: sim.count };
    for (let i = 0; i < sim.count; i++) t[regionOf(sim.px[i], sim.pz[i], yard)]++;
    return t;
}

/** The share of the leaves off the open lawn, 0 to 1. */
export function clearedShare(t) {
    return t.total > 0 ? 1 - t.lawn / t.total : 0;
}

/** A share as a whole percent, rounded DOWN, so 100% means every leaf. */
export function percent(share) {
    return Math.max(0, Math.min(100, Math.floor(share * 100 + 1e-9)));
}

/** 4210 as "4,210". */
export function formatCount(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
    if (share(t.neighbor) >= 0.25) {
        return { key: 'neighbor', title: 'The neighbors are talking', line: 'A good share of your yard is now in theirs. They noticed.' };
    }
    let base;
    if (cleared >= 0.9) base = { key: 'spotless', title: 'Yard of the month', line: 'The lawn is clear. Every neighbor on the street is a little jealous.' };
    else if (cleared >= 0.7) base = { key: 'great', title: 'Curb appeal restored', line: 'The grass can see the sky again. Well done.' };
    else if (cleared >= 0.45) base = { key: 'good', title: 'Respectable work', line: 'More lawn than leaves. That is a good afternoon.' };
    else if (cleared >= 0.2) base = { key: 'start', title: 'A solid start', line: 'The leaves are on notice. Another round should finish the job.' };
    else base = { key: 'leaves', title: 'The leaves win this round', line: 'They have the numbers. You have a leaf blower and another minute.' };
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
        { key: 'neighbor', label: 'Over the fence', value: formatCount(t.neighbor) },
        { key: 'lawn', label: 'Still on the lawn', value: formatCount(t.lawn) }
    ];
}

/** The sentence a visitor posts. The neighbor makes the better story when
 *  there is one, and the pile on the tarp otherwise. */
export function shareText(t, seconds) {
    const head = `I cleared ${percent(clearedShare(t))}% of my yard in ${seconds} seconds.`;
    let tail = '';
    if (t.neighbor > 0) tail = ` ${leaves(t.neighbor)} went to the neighbor.`;
    else if (t.tarp > 0) tail = ` ${leaves(t.tarp)} made it onto the tarp.`;
    return `${head}${tail} A leaf blower game on SceneXP.`;
}

/** The result in one sentence, for a screen reader. */
export function resultSentence(t) {
    const v = verdict(t);
    return `${v.title}. ${percent(clearedShare(t))} percent of the lawn cleared, with ${leaves(t.tarp)} on the tarp, `
        + `${leaves(t.street)} in the street, and ${leaves(t.neighbor)} over the fence.`;
}
