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
