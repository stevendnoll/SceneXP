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

/** What the house model says as a floor opens and closes, and the name of
 *  its room labels (main.js). */
export const MODEL_LINES = Object.freeze({
    roomsOn: (level) => `Rooms of the ${String(level).toLowerCase()}`,
    lifted: (level) => `Opened the ${String(level).toLowerCase()} of the house.`,
    setDown: 'The house is back together.'
});

/** A count said as a word, as Maya would say it: "nine standard tasks". */
export function countWord(n) {
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    return Number.isInteger(n) && n >= 0 && n < words.length ? words[n] : String(n);
}

/**
 * Maya, the host, and everything she says (guide.js, host.js; ONBOARDING
 * section 5). One or two short sentences a bubble. Each scene's `...Again`
 * line is what she says once, in other words, if nothing happens for a
 * while. Lines that state a price take it from the price sheet at run time.
 */
export const GUIDE = Object.freeze({
    name: 'Maya',
    role: 'Whitestone Home Care',
    label: 'Maya, your host',
    portrait: 'M',
    defaultTitle: 'Our home',
    skip: 'Skip the guide',
    progressLabel: 'Your progress',
    progress: Object.freeze(['Floors', 'First room', 'Your rooms', 'Review']),
    progressStep: (n, total, name) => `Step ${n} of ${total}: ${name}`,

    hello: "Hi, I'm Maya with Whitestone Home Care. Let's build a cleaning checklist for your home, room by room. It takes about two minutes.",
    helloAgain: "Tap Let's start and I'll walk you through it, one step at a time.",
    start: "Let's start",
    example: 'Show me an example',

    floors: 'First, which floors does your home have?',
    floorsAgain: 'Tick each floor your home has. You can change them later.',
    floorsTaking: "That's your house taking shape.",
    floorsLegend: 'Floors in your home',
    titleLabel: 'Name this checklist',
    next: 'Next',

    firstRoom: 'Most people start with the kitchen. Shall we add it?',
    firstRoomAgain: 'Adding the kitchen brings its standard tasks with it. You can change any of them.',
    addKitchen: 'Add the kitchen',
    otherRoom: 'Choose another room',

    /** Said once the first room is in, from the price sheet. */
    added: (room, count, money) => `There's your ${room} with its ${countWord(count)} standard ${count === 1 ? 'task' : 'tasks'}, ${money} so far.`,
    addedMinimum: (money) => `Every visit starts at ${money}, so your next rooms fit inside that.`,
    addedPlain: (room) => `There's your ${room}.`,

    dots: "Each blue dot is a task. Tap one to see what's included, or star the ones that matter most.",
    dotsAgain: 'Tap any blue dot on the open floor to see that task.',
    gotIt: 'Got it',

    rooms: 'Now add your other rooms. Tap a floor to open it, or add a room here.',
    roomsAgain: "Add as many rooms as you like. When you're done, review your checklist.",
    roomsMore: "Looking good. Add as many as you like, or review when you're ready.",
    addRoom: 'Add a room',
    reviewIt: 'Review my checklist',

    review: "Here's your home and your quote. One last thing: is there anything we should avoid, like strong scents or bleach?",
    reviewAgain: 'Save your checklist when it looks right. Care preferences are optional.',
    preferences: 'Choose preferences',
    save: 'Save my checklist',
    saved: 'All set. Your checklist is saved in this browser, so you can come back and change it anytime.',
    lookAround: 'Look around',

    example1: 'This is a four-bedroom home with a home office.',
    example2: 'Each room has its tasks, and every task has a price.',
    example3: 'Want to build yours?',
    buildOwn: 'Build my own',
    look: 'Take your time. Drag to turn the house, and tap a floor to open it.',

    welcome: 'Welcome back. Your home is just as you left it.',
    welcomeResume: 'Welcome back. Your home is just as you left it. Shall we pick up where we stopped?',
    keepGoing: 'Keep going',
    illLook: "I'll look around",

    hint: 'Tap a floor of the house to open it, and tap a blue dot to see a task. Your checklist is in the Help menu at the top.',
    about: 'Whitestone Home Care builds your cleaning checklist room by room. Every task shows its price and its time as you add it, and your quote keeps up.',
    close: 'Close'
});

/** "a kitchen", "an office": a room's kind with its article. */
export function withArticle(name) {
    const word = String(name || '');
    return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word.toLowerCase()}`;
}

/** The panel beside the house (panel.js) and the Rooms chip that opens it. */
export const PANEL = Object.freeze({
    label: 'Your home, floor by floor',
    rooms: (n) => (n === 1 ? '1 room' : `${n} rooms`),
    tasks: (n) => (n === 1 ? '1 task' : `${n} tasks`),
    about: (time) => `about ${time}`,
    back: (name) => `Back to ${name}`,
    wholeHouse: 'the whole house',
    close: 'Close',
    floorsHeading: 'Floors',
    roomsHeading: 'Rooms',
    tasksHeading: 'Tasks',
    noRooms: 'No rooms on this floor yet. Add one below.',
    noTasks: 'No tasks in this room yet. Add one below.',
    addRoom: 'Add a room',
    chipLabel: (name) => `Add ${withArticle(name)} with its standard tasks`,
    anotherRoom: 'Another kind of room',
    addTask: 'Add a task',
    editRoom: 'Edit this room',
    editTask: 'Edit this task',
    star: 'Star it',
    unstar: 'Unstar it',
    starLabel: (name) => `Star ${name}`,
    removeTask: 'Remove this task',
    notes: (text) => `Notes: ${text}`,
    avoid: (text) => `Please avoid: ${text}`,
    checklist: 'Your checklist',
    home: 'Your home',
    open: 'Rooms',
    openLabel: 'Your home, floor by floor: its floors, rooms and tasks',
    starred: (name) => `Starred ${name}. We start there.`,
    unstarred: (name) => `${name} is no longer starred.`,
    starStep: 'Starred a task'
});

/** The Help menu and Undo, top right (main.js). */
export const HELP = Object.freeze({
    button: 'Help',
    label: 'Help and your checklist',
    again: 'Show me again',
    restart: 'Start over with the guide',
    checklist: 'Your checklist',
    menu: 'Service menu',
    prefs: 'Care preferences',
    home: 'Your home',
    mine: 'My checklists',
    about: 'About Whitestone',
    undo: 'Undo'
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
    walk({ BRAND, ITEM_ERRORS, BOOKING_ERRORS, DAY_STATUS, STORE, FREQUENCIES, UI, MODEL_LINES, GUIDE, HELP, PANEL, STORAGE_NOTES, GUARDS, TASKS_PAGE, CALENDAR }, 'copy');
    return out;
}
