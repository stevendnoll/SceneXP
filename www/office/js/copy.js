// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * copy.js - The sentences the office says, built from numbers.
 *
 * Pure, so every line can be read and tested in one place. House style
 * applies to all of it: a host's tone, American spelling, and no em-dashes
 * or semicolons (tests/office-copy.test.mjs holds that).
 */

/** "1 follow-up" or "3 follow-ups". */
export function count(n, one, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
}

/**
 * The welcome card's second line, for a visitor who has been here before.
 * Leads with what is waiting today, because that is the reason to come back.
 */
export function welcomeLine(s) {
    const waiting = s.dueToday + s.overdue;
    if (waiting > 0) {
        return `Welcome back. ${count(waiting, 'follow-up')} ${waiting === 1 ? 'is' : 'are'} waiting for you today.`;
    }
    if (s.upcoming > 0) {
        return `Welcome back. The desk is clear today, and ${count(s.upcoming, 'event')} ${s.upcoming === 1 ? 'is' : 'are'} on the calendar this week.`;
    }
    if (s.applications > 0) {
        return 'Welcome back. The desk is clear today.';
    }
    return 'Welcome back. The office is ready whenever you are.';
}

/** The page title, which carries the count waiting today so a pinned tab
 *  shows it at a glance. */
export function pageTitle(name, s) {
    const waiting = s.dueToday + s.overdue;
    return waiting > 0 ? `(${waiting}) ${name}` : name;
}

/**
 * The week card's words (weekcard.js draws them). The visitor posts the card
 * as their own, so where it speaks it speaks as them ("my goal"). A week
 * short of the goal says how close it is, never how far behind.
 *
 * COUNTS ONLY: nothing here can name a company or a role, which is what
 * makes every card safe to share.
 *
 * @param {{count: number, goal: number}} week  from derive.weekly
 * @param {string} weekOf  the week's Monday, written out ("October 19, 2026")
 * @param {string} url     the address at the card's foot
 */
export function weekCardLines(week, weekOf, url) {
    const extra = week.count - week.goal;
    let goal;
    if (extra > 0) goal = `Weekly goal of ${week.goal} reached, plus ${extra} more!`;
    else if (extra === 0) goal = `Weekly goal of ${week.goal} reached!`;
    else goal = `${-extra} to go toward my goal of ${week.goal}`;
    return {
        label: 'CORNER OFFICE',
        headline: `${count(week.count, 'application')} sent this week`,
        goal,
        met: extra >= 0,
        date: `Week of ${weekOf}`,
        chart: 'Applications sent each week',
        footer: `Track your own job search at ${url}`
    };
}

/** The words that go with the week card into the share sheet: the card's
 *  own headline and goal, and the way to the office as a link to follow. */
export function weekCardShareText(lines, url) {
    return `${lines.headline}. ${lines.goal} Track your own job search at ${url}`;
}

/** The week card's button, named for what it will do before it is pressed:
 *  Share where the device's share sheet takes a picture, Save where not. */
export function weekCardButton(canShare) {
    return canShare ? 'Share my week' : 'Save a picture of my week';
}

/** What is said once the week card's button has done its work (main.js
 *  shareWeekCard's result), or '' for a share sheet the visitor closed,
 *  which was their decision and needs no comment. */
export function weekCardDone(how) {
    if (how === 'shared') return 'Thank you for sharing your week!';
    if (how === 'saved') return 'A picture of your week is in your downloads.';
    if (how === 'failed') return 'Sorry, the picture could not be made. Please try again in a moment.';
    return '';
}

/** Why the office cannot save, or '' when it can. */
export function storageNote(status, use) {
    switch (status) {
    case 'unavailable':
        return 'This browser is not letting the office save, so anything you enter will be gone when the tab closes. A private window is the usual reason.';
    case 'newer':
        return 'Your office was saved by a newer version of this page, so it has been left exactly as it was. Reloading the page should open it.';
    case 'unreadable':
        return 'The saved office could not be read, so it has been left untouched and nothing will be saved over it.';
    default:
        if (use && use.warn) {
            return 'Your office is using most of the space this browser allows. Saving a backup soon would be wise.';
        }
        return '';
    }
}

/** "6:40 AM": a clock time, for the day going by at the window. */
export function clockTime(date) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** What is said when a day starts going by at the window. */
export function dayStartLine(date) {
    return `A day is going by at the window, starting from ${clockTime(date)}. Stop the day ends it whenever you like.`;
}

/** What is said when it ends: the whole day, or stopped early. */
export function dayEndLine(date, whole) {
    return whole
        ? `A whole day has gone by. It is ${clockTime(date)} again.`
        : `Back to the present. It is ${clockTime(date)}.`;
}
