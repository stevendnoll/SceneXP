// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * copy.js - Every sentence a visitor reads in Whitestone Home Care, in one
 * place (PLANNING 3.1), so a single test can hold all of it to house style:
 * no em dashes, no semicolons, American spelling, and the voice of a calm,
 * precise host who states facts rather than adjectives (PRD 4).
 *
 * The modules return CODES (sheet.js `checkChoice`, schedule.js
 * `checkBooking`, guards.js), and this file turns each code into words. A
 * code with no sentence is a test failure, not a blank on screen.
 *
 * Lines that need a number are functions. `allCopy` calls each one with a
 * sample so the sweep reads the finished sentence.
 *
 * Pure.
 */

export const BRAND = Object.freeze({
    name: 'Whitestone Home Care',
    tagline: 'Bright homes, kept with care.',
    promise: 'You will never pay more than your quote without approving it first. Anything we skip comes off your bill.',
    /** Until Whitestone takes real customers (PRD 4). */
    honesty: 'Whitestone Home Care is a SceneXP concept studio. Prices and bookings are examples.',
    exampleBooking: 'This is an example booking. No one will arrive.'
});

/** sheet.js `checkChoice` and pricing.js codes. */
export const ITEM_ERRORS = Object.freeze({
    'unknown-task': 'That task is not on the current service menu.',
    'not-offered': 'That task is not offered in this kind of room.',
    'bad-options': 'Those options could not be read. Please choose them again.',
    'unknown-option': 'That option is not available for this task.',
    'repeated-option': 'That option is already chosen.',
    'size-not-allowed': 'This task is not priced by room size.',
    'bad-size': 'Please choose small, medium or large.',
    'quantity-not-allowed': 'This task is priced once, not per item.',
    'bad-quantity': 'Please choose a quantity from 1 to 50.',
    'unknown-room': 'That room is no longer on the checklist.',
    'unknown-item': 'That task is no longer on the checklist.',
    'empty-upgrade': 'Please choose an option to add.',
    'wrong-sheet': 'This report was priced on a different service menu.'
});

/** schedule.js `checkBooking` codes. */
export const BOOKING_ERRORS = Object.freeze({
    'bad-request': 'Please choose a day and a start time.',
    closed: 'Whitestone is closed that day.',
    holiday: 'Whitestone is closed that day for a holiday.',
    'too-far': 'That day is further ahead than visits can be booked.',
    'before-open': 'That time is before opening.',
    'off-step': 'Please choose one of the listed start times.',
    'no-such-time': 'That time does not happen that day, because the clocks change.',
    'too-soon': 'That time is too soon to book. Please choose a later one.',
    'after-close': 'The visit would run past closing. Please choose an earlier time.',
    taken: 'That time was just taken. Here are the next openings.'
});

/** schedule.js `monthView` statuses, as the calendar labels a day. */
export const DAY_STATUS = Object.freeze({
    open: 'Open',
    full: 'Fully booked',
    closed: 'Closed',
    holiday: 'Closed for a holiday',
    'too-soon': 'Too soon to book',
    'too-far': 'Not yet bookable'
});

/** store.js refusals. */
export const STORE = Object.freeze({
    noChecklist: 'That checklist is no longer here.',
    checklistRemoved: 'That checklist was removed. Please restore it first.',
    tooManyChecklists: (n) => `You can keep up to ${n} checklists on this device.`,
    noRoom: 'That room is no longer on the checklist.',
    roomRemoved: 'That room was removed. Please restore it first.',
    tooManyRooms: (n) => `A checklist can have up to ${n} rooms.`,
    badLevel: 'Please choose a level for this room.',
    badArea: 'Please choose what kind of room this is.',
    levelInUse: 'That level still has rooms. Please move or remove them first.',
    noLevels: 'A home needs at least one level.',
    noItem: 'That task is no longer on the checklist.',
    itemRemoved: 'That task was removed. Please restore it first.',
    tooManyItems: (n) => `A checklist can have up to ${n} tasks.`,
    tooManyPhotos: (n) => `A task can have up to ${n} photos.`,
    tooManyChecklistPhotos: (n) => `A checklist can have up to ${n} photos.`,
    roomOfRemovedRoom: 'Its room was removed too. Please restore the room first.',
    copyOf: (title) => `Copy of ${title}`
});

/** How often a visit happens (config.frequencies), as the setup card says it. */
export const FREQUENCIES = Object.freeze({
    '': 'Not sure yet',
    once: 'Just this once',
    weekly: 'Every week',
    biweekly: 'Every other week',
    monthly: 'Every month'
});

/** The studio's own lines: toasts, the live region, list text. */
export const UI = Object.freeze({
    started: (title) => `Started ${title}. Next, add a room.`,
    homeSaved: 'Your home details are saved.',
    preferencesSaved: 'Your care preferences are saved.',
    preferencesNone: 'No care preferences. That is fine.',
    opened: (title) => `Opened ${title}.`,
    duplicated: (title) => `Made ${title}.`,
    removedChecklist: (title) => `Removed ${title}.`,
    undone: (label) => `Undone. ${label}`,
    nothingToUndo: 'There is nothing to undo.',
    levelsNeeded: 'Please tick at least one level.',
    sheetFailed: 'The service menu could not be loaded. Please check your connection and reload the page.',
    noChecklists: 'No checklists yet. Start your own and it is kept here, in this browser.',
    draft: 'Draft',
    example: 'Example home',
    rooms: (n) => `${n} ${n === 1 ? 'room' : 'rooms'}`,
    tasks: (n) => `${n} ${n === 1 ? 'task' : 'tasks'}`,
    open: 'Open',
    current: 'Open now',
    duplicate: 'Duplicate',
    remove: 'Remove',
    removeTitle: (title) => `Remove ${title}?`,
    removeDetail: 'It goes from this browser. You can bring it back with Undo until you leave the page.',
    notSaving: 'Not saving',
    otherTab: 'Your checklists were updated in another tab.',
    labels: Object.freeze({
        started: 'Started a checklist',
        home: 'Changed your home details',
        preferences: 'Changed care preferences',
        duplicated: 'Duplicated a checklist',
        removed: 'Removed a checklist',
        roomAdded: 'Added a room',
        roomChanged: 'Changed a room',
        roomRemoved: 'Removed a room',
        taskAdded: 'Added a task',
        taskChanged: 'Changed a task',
        taskRemoved: 'Removed a task',
        moved: 'Moved a task',
        clearedExample: 'Cleared the example'
    }),
    exampleCleared: 'The example home is cleared. Your own checklists are untouched.',

    // Rooms
    addRoomTitle: 'Add a room',
    editRoomTitle: 'Edit this room',
    addRoomSave: 'Add room',
    saveChanges: 'Save changes',
    roomAdded: (name, n) => (n ? `Added ${name} with ${n} standard ${n === 1 ? 'task' : 'tasks'}.` : `Added ${name}.`),
    roomChanged: (name) => `Saved ${name}.`,
    roomRemoved: (name) => `Removed ${name} and its tasks.`,
    presetAdds: (names) => `Adds ${names}.`,
    presetWaiting: 'The standard tasks appear once the service menu has loaded.',

    // The checklist view
    noRooms: 'No rooms yet. Add your first room to begin.',
    emptyLevel: 'No rooms on this level yet.',
    emptyRoom: 'No tasks in this room yet.',
    addTask: 'Add a task',
    editRoom: 'Edit room',
    edit: 'Edit',
    important: 'Important',
    photos: (n) => `${n} ${n === 1 ? 'photo' : 'photos'}`,
    hasNotes: 'Has notes',
    quantity: (n) => `Quantity ${n}`,
    sizes: Object.freeze({ small: 'Small room', medium: 'Medium room', large: 'Large room' }),
    sizeChoices: Object.freeze({ small: 'Small', medium: 'Medium', large: 'Large' }),
    priceAndTime: (money, time) => `${money}, ${time}`,
    sheetLoading: 'The service menu is still loading. Please try again in a moment.',
    sheetMissing: 'Prices appear once the service menu has loaded.',

    // Tasks
    addTaskTitle: (room) => `Add a task to ${room}`,
    editTaskTitle: (task) => `Edit ${task}`,
    addTaskSave: 'Add task',
    taskAdded: (task, room) => `Added ${task} to ${room}.`,
    taskChanged: (task) => `Saved ${task}.`,
    taskRemoved: (task) => `Removed ${task}.`,
    optionLine: (name, money, minutes) => `${name}, plus ${money} and ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
    optionFree: (name) => `${name}, no extra charge`,

    // Photos
    photoUnreadable: 'That file could not be read as a photo. Please choose a JPEG, PNG or HEIC picture.',
    photoFailed: 'That photo could not be saved. Please try another.',
    photosFull: (n) => `A task can have up to ${n} photos.`,
    photosInMemory: 'This browser is not keeping photos, so they last only until you leave the page.',
    photoAdded: 'Photo added.',
    photoRemoved: 'Photo removed.',
    removePhoto: (n) => `Remove photo ${n}`,
    photoAlt: (task, n) => `Photo ${n} for ${task}`,

    // The quote (PRD 8.5)
    quoteChip: (money, time) => `Your quote: ${money}, ${time}`,
    quoteChipSpoken: (money, time) => `Your quote, ${money}, ${time}. Example prices. Show the breakdown.`,
    examplePrices: 'Example prices',
    quoteTotal: (money) => `Your quote: ${money}`,
    quoteTime: (time) => `The visit takes ${time}.`,
    minimumNudge: (minimum, more) => `Visit minimum ${minimum}. Add ${more} more to reach it, or it rounds up to ${minimum}.`,
    minimumMet: (minimum) => `The visit minimum of ${minimum} is met.`,
    topUpLine: 'Minimum top-up',
    subtotalLine: 'Tasks',
    totalLine: 'Total',
    taxIncluded: 'Tax is included.',
    taxExtra: 'Prices are before any sales tax.',
    cannotPrice: (n) => `${n} ${n === 1 ? 'task is' : 'tasks are'} not on the current service menu, so ${n === 1 ? 'it is' : 'they are'} not in the quote. Please edit or remove ${n === 1 ? 'it' : 'them'}.`,
    sheetVersion: (version) => `Priced on service menu ${version}.`,

    // The service menu
    menuEach: (money) => `${money} each time`,
    menuCount: (money) => `${money} each`,
    menuRoom: (small, medium, large) => `${small} small room, ${medium} medium, ${large} large`,
    menuMinutes: (minutes) => `about ${minutes} minutes`,
    menuOption: (name, money) => `${name} adds ${money}`,
    menuAddTo: (room) => `Add to ${room}`,
    // No article, so the sentence reads right for every kind of room (an entry, a kitchen).
    menuNoRoom: (kind) => `Your checklist has no ${String(kind).toLowerCase()} yet. Add one to order these.`,
    menuNoChecklist: 'Start your own checklist to order from the menu.',

    // Reordering, filtering, printing
    moveUp: 'Move up',
    moveDown: 'Move down',
    moved: (task) => `Moved ${task}.`,
    filterAll: 'Everything',
    filterImportant: 'Important tasks only',
    filterLevel: (level) => `${level} only`,
    filterNone: 'Nothing matches this filter.',
    filterShowing: (shown, total) => `Showing ${shown} of ${total} tasks.`
});

/** The plan board and the service menu's display in the studio (boards.js),
 *  and the room labels on the house model (main.js). */
export const BOARDS = Object.freeze({
    emptyTitle: 'Your plan appears here',
    emptyDetail: 'Start your own checklist at the desk, and your quote, the time and your starred tasks gather on this board.',
    noTasks: 'Add a room and its tasks, and your quote appears here.',
    quoteLabel: 'Your quote',
    starredHeading: 'Starred first',
    noStarred: 'Star the tasks that matter most, and they lead this list.',
    moreStarred: (n) => `and ${n} more`,
    levelsHeading: 'Tasks by level',
    minimumShort: (more) => `Add ${more} more to reach the visit minimum.`,
    menuHeading: 'Service menu',
    menuFrom: (money) => `from ${money}`,
    menuEach: (money) => `${money} each`,
    menuMinutes: (minutes) => `about ${minutes} min`,
    menuMore: (n) => `and ${n} more in the service menu`,
    menuFooter: (version) => `Service menu ${version}`,
    menuLoading: 'The service menu is loading.',
    roomsOn: (level) => `Rooms of the ${String(level).toLowerCase()}`,
    lifted: (level) => `Lifted the ${String(level).toLowerCase()} out of the model.`,
    setDown: 'The model is back together.'
});

/** The arrival panel (intro.js), the halos and the stations list (marks.js
 *  and main.js). */
export const STUDIO = Object.freeze({
    body: 'Build your cleaning checklist room by room. Every task shows its price and its time as you add it, and your quote keeps up. Star what matters most, and we start there.',
    start: 'Start your own',
    explore: 'Explore the example',
    hintTouch: 'Tap a glowing marker to begin. Drag to look around, and pinch to look closer.',
    hintPointer: 'Click a glowing marker to begin. Drag to look around, and scroll to look closer.',
    collapse: 'Collapse this introduction',
    handle: 'About Whitestone',
    /** The stations list's rows: the place, said plainly. */
    places: Object.freeze({
        overview: 'The whole studio',
        desk: 'The concierge',
        model: 'The house model',
        menu: 'The service menu',
        board: 'The plan board',
        printer: 'The printer'
    }),
    /** Each halo's spoken name: the place and what it does. */
    halos: Object.freeze({
        desk: 'The concierge. Start your own checklist, or open your checklists.',
        model: 'The house model. Lift a level to see its rooms.',
        menu: 'The service menu. Every task, with its price and time.',
        board: 'The plan board. Your checklist in full.',
        printer: 'The printer. Print your checklist.'
    }),
    printerEmpty: 'Add a task to your checklist, and the printer prints it for you.',
    listHeading: 'Places in the studio',
    listNote: 'Choose a place to go there. Keys 1 to 6 go to them from anywhere in the studio. The arrow keys move through this list, and Tab or Escape puts it away.'
});

/** What the page says about saving, under the studio's storage note. */
export const STORAGE_NOTES = Object.freeze({
    unavailable: 'This browser is not saving, perhaps because it is a private window. Your checklist will be gone when you leave.',
    newer: 'Your saved checklists were made by a newer version of this page, so they are left untouched. Please reload for the latest version.',
    unreadable: 'Your saved checklists could not be read, so they are left untouched.',
    nearlyFull: 'This browser is nearly out of room for saved checklists. Removing an old one makes space.'
});

/** guards.js hints: gentle, and never blocking. */
export const GUARDS = Object.freeze({
    code: 'For your safety, please share door, alarm and gate codes with your cleaner directly rather than here.',
    'hidden-key': 'For your safety, please tell your cleaner where a spare key is directly rather than here.',
    health: 'There is no need to share health details. A preference such as fragrance-free products is enough, and anything written here is shared with your cleaner.'
});

/** The cleaner's page. */
export const TASKS_PAGE = Object.freeze({
    incomplete: 'Please enter all 6 digits of the PIN.',
    preview: 'Thank you. Shared checklists open here once Whitestone Home Care is live. This page is a preview.'
});

/** The calendar file for a booked visit (ics.js). */
export const CALENDAR = Object.freeze({
    summary: 'Whitestone Home Care visit',
    description: 'Your cleaning visit from Whitestone Home Care.'
});

/** Every string above, with each function called on a sample, for the
 *  house-style sweep. */
export function allCopy() {
    const out = [];
    const walk = (value, where) => {
        if (typeof value === 'string') out.push({ where, text: value });
        else if (typeof value === 'function') out.push({ where, text: value(12) });
        else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, `${where}.${k}`));
    };
    walk({ BRAND, ITEM_ERRORS, BOOKING_ERRORS, DAY_STATUS, STORE, FREQUENCIES, UI, BOARDS, STUDIO, STORAGE_NOTES, GUARDS, TASKS_PAGE, CALENDAR }, 'copy');
    return out;
}
