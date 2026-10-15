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
    'not-with-bath': 'That task comes with a full bath. Make this room a full bath to add it.',
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
    taken: 'That time was just taken. Here are the next openings.',
    // The API's own refusals (api.js, standin.js).
    'already-booked': 'This checklist already has a visit booked.',
    'too-late': 'This visit is too close to change online. Please contact Whitestone.',
    'no-booking': 'This checklist has no visit booked.',
    expired: 'That took a while, so the reservation lapsed. Please choose your time again.',
    offline: 'Whitestone could not be reached. Please check your connection and try again.',
    denied: 'This checklist could not be updated. Please try again.',
    server: 'Something went wrong on our side. Please try again in a moment.',
    unpriced: 'Please add a task, or fix the ones the menu no longer offers, before choosing a time.',
    sample: 'The example home cannot be booked. Build your own to choose a time.',
    // Sending changes and moving a visit (sync.js republish, PRD 10.4).
    'no-longer-fits': 'With your changes, your visit no longer fits at its booked time. Please choose a new time, and your changes are sent with it.',
    'not-published': 'This checklist is not published yet. Please choose a time to publish it.'
});

/** The Choose a time card (booking.js, PRD 10.3). */
export const BOOKING = Object.freeze({
    title: 'Choose a time',
    summary: (money, time) => `Your visit takes about ${time}. Your quote is ${money}.`,
    times: (n) => (n === 1 ? '1 start time open' : `${n} start times open`),
    holiday: (name) => `closed for ${name}`,
    loading: 'Finding open times…',
    noneThisMonth: 'No openings this month. Please try the next.',
    startsOn: (day) => `Start times on ${day}`,
    until: (time) => `until about ${time}`,
    confirm: 'Book and publish',
    working: 'Booking your visit…',
    /** Moving a booked visit, or booking again after a cancel. */
    newTitle: 'Choose a new time',
    move: 'Move my visit',
    moving: 'Moving your visit…',
    bookAgain: 'Book my visit',
    nowAt: (when) => `Your visit is booked for ${when}. Choose another day or time to move it.`,
    prev: 'Previous month',
    next: 'Next month',
    nextOpenings: 'Next openings',
    weekdays: Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
});

/** The receipt (receipt.js, PRD 13.1). */
export const RECEIPT = Object.freeze({
    title: 'Your visit is booked',
    when: (day, start, end) => `${day}, ${start} to about ${end}`,
    addToCalendar: 'Add to calendar',
    quote: (money, time) => `${money} for about ${time}`,
    guarantee: 'You will never pay more than your quote without approving it first.',
    linkLabel: 'Link for your cleaner',
    copy: 'Copy',
    copied: 'Copied',
    share: 'Share',
    shareTitle: 'Whitestone cleaning checklist',
    shareText: 'Here is the checklist for our cleaning visit.',
    pinLabel: 'PIN',
    pinAdvice: 'Send the PIN separately, for example by text.',
    qrLabel: 'Scan to open the checklist',
    expires: (day) => `This checklist is kept until ${day}, and renewed whenever you change it.`,
    editLabel: 'Your private edit link',
    editAdvice: 'Keep this one to yourself. It lets you edit this checklist, approve add-ons, and read visit reports from any device.',
    standin: 'Until Whitestone\u2019s server is running, this checklist is kept in this browser, so the link opens here only.',
    done: 'Done',
    open: 'Your visit',
    /** A checklist opened by its edit link: this device never saw its PIN. */
    pinUnknown: 'Shown when you published.',
    pinUnknownAdvice: 'This device opened your checklist with its edit link, so it does not know the PIN. Set a new one to send your cleaner.',
    newPin: 'Set a new PIN',
    newPinTitle: 'Set a new PIN?',
    newPinDetail: 'The old PIN stops working, so your cleaner will need the new one.',
    newPinDone: 'Your new PIN is on the receipt.',

    /** Published, with no visit booked (after a cancel). */
    titlePublished: 'Your checklist is published',
    noVisit: 'No visit is booked. Choose a time whenever you are ready.',
    /** Changing things afterward (PRD 10.4). */
    unsent: 'You have changes your cleaner has not seen yet.',
    send: 'Send my changes',
    reschedule: 'Change the time',
    cancelVisit: 'Cancel my visit',
    book: 'Choose a time',
    locked: (hours) => `Your visit is less than ${hours} hours away, so it can no longer be changed online.`,
    unpublish: 'Unpublish this checklist'
});

/** Sending changes, moving, cancelling and unpublishing (PLANNING 10.2, PRD
 *  10.4 and 13.2): the confirmations and what is said after. */
export const CHANGES = Object.freeze({
    priceTitle: 'Your quote changes',
    priceDetail: (from, to) => `With your changes, your quote goes from ${from} to ${to}. Your link and PIN stay the same.`,
    priceConfirm: 'Send my changes',
    sending: 'Sending your changes…',
    sent: 'Your changes are sent. Your link and PIN stay the same.',
    nothingToSend: 'Your cleaner already has everything. There is nothing new to send.',
    tooLateLonger: (hours) => `Your visit is less than ${hours} hours away, so changes that make it longer can no longer be sent online.`,
    moved: (when) => `Your visit is moved to ${when}.`,
    cancelTitle: 'Cancel your visit?',
    cancelDetail: (when) => `Your visit on ${when} is canceled and the time is given back. Your checklist stays published, so you can choose a new time.`,
    cancelConfirm: 'Cancel my visit',
    keep: 'Keep it',
    notNow: 'Not now',
    cancelled: 'Your visit is canceled. Your checklist is still published, ready for a new time.',
    unpublishTitle: 'Unpublish this checklist?',
    unpublishDetail: 'The link and PIN stop working now, and the copy kept for your cleaner is deleted. Your checklist stays here as a draft.',
    unpublishDetailBooked: (when) => `The link and PIN stop working now, the copy kept for your cleaner is deleted, and your visit on ${when} is canceled. Your checklist stays here as a draft.`,
    unpublishConfirm: 'Unpublish',
    unpublished: (title) => `${title} is unpublished. It is a draft on this device again.`,
    /** Removing a published checklist from My checklists unpublishes it. */
    removePublished: 'It goes from this browser, and is unpublished first, so the link and PIN stop working.',
    removeBooked: (when) => `It goes from this browser, and is unpublished first, so the link and PIN stop working and your visit on ${when} is canceled.`,
    removeLocked: (hours) => `This checklist has a visit less than ${hours} hours away, so it cannot be removed until after the visit.`
});

/** schedule.js `monthView` statuses, as the calendar labels a day. */
export const DAY_STATUS = Object.freeze({
    open: 'Open',
    full: 'Fully booked',
    closed: 'Closed',
    holiday: 'Closed for a holiday',
    'too-soon': 'Too soon to book',
    'too-far': 'Not yet bookable',
    'beyond-quote': 'After your quote\u2019s 90 days',
    yours: 'Your visit is on this day'
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
    notABath: 'Only a bathroom has a type of bath.',
    sampleNotPublished: 'The example home cannot be booked. Build your own to choose a time.',
    residenceLevelInUse: (level) => `Your ${String(level).toLowerCase()} still has rooms. Please move or remove them before changing the kind of home.`,
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
    published: 'Published',
    booked: (day) => `Visit booked for ${day}`,
    withUnsent: (status) => `${status}, changes not sent`,
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
        bathChanged: 'Changed a type of bath',
        roomRemoved: 'Removed a room',
        taskAdded: 'Added a task',
        taskChanged: 'Changed a task',
        taskRemoved: 'Removed a task',
        moved: 'Moved a task',
        clearedExample: 'Cleared the example'
    }),
    exampleCleared: 'The example home is cleared. Your own checklists are untouched.',
    editLinkFailed: 'That edit link did not open a checklist. It may have expired, or been unpublished.',

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
    /** A bathroom's new type, and the tasks that came off or came with it,
     *  named: "The bathroom is now a shower bath. Took off the bathtub." */
    bathChanged: (room, kind, gone = [], added = []) => [
        `${room} is now ${withArticle(kind)}.`,
        gone.length ? `Took off ${theList(gone)}.` : '',
        added.length ? `Added ${theList(added)}.` : ''
    ].filter(Boolean).join(' '),

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

    // The booked visit, at a glance in Maya's bubble (PRD 8.6)
    visitChipSpoken: (day, time) => `Your visit, ${day} at ${time}. Show the link, the PIN and the ways to change it.`,
    visitChipNone: 'Published, no visit booked',
    visitChipUnsent: 'Changes not sent',

    // The quote (PRD 8.5)
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
    progress: Object.freeze(['Home type', 'Floors', 'First room', 'Your rooms', 'Review']),
    progressStep: (n, total, name) => `Step ${n} of ${total}: ${name}`,
    goToStep: (name) => `Go to ${name}`,

    hello: "Hi, I'm Maya with Whitestone Home Care. Let's build a cleaning checklist for your home, room by room. It takes about two minutes.",
    helloAgain: "Tap Let's start and I'll walk you through it, one step at a time.",
    start: "Let's start",
    example: 'Show me an example',

    /** What kind of home (ONBOARDING Scene 2a), and a townhome's neighbors. */
    home: 'First, what kind of home is it?',
    homeAgainAsked: 'Of course. What kind of home is it? Your answer so far is marked.',
    homeAgain: 'Choose the one closest to your home. You can change it later.',
    homeLegend: 'Kind of home',
    attached: 'Is it an end unit, or between two neighbors?',
    attachedAgain: 'An end unit has one neighbor, and a unit between two has neighbors on both sides.',

    floors: 'Next, which floors does your home have?',
    floorsAgain: 'Tick each floor your home has. You can change them later.',
    floorsTaking: "That's your house taking shape.",
    floorsLegend: 'Floors in your home',
    titleLabel: 'Name this checklist',
    next: 'Next',
    back: 'Back',

    firstRoom: 'Most people start with the kitchen. Shall we add it?',
    firstRoomAgain: 'Adding the kitchen brings its standard tasks with it. You can change any of them.',
    addKitchen: 'Add the kitchen',
    otherRoom: 'Another kind of room',
    roomsLegend: 'Add a room',

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
    saved: 'All set. Your checklist is saved in this browser, so you can come back and change it anytime. When you are ready, choose a time for your visit.',
    chooseTime: 'Choose a time',
    lookAround: 'Look around',

    example1: 'This is a four-bedroom home with a home office.',
    example2: 'Each room has its tasks, and every task has a price.',
    example3: 'Want to build yours?',
    buildOwn: 'Build my own',
    look: 'Take your time. Drag to turn the house, and tap a floor to open it.',

    welcome: 'Welcome back. Your home is just as you left it.',
    /** A returning visitor's home base (QA, 2026-10-14): where the home
     *  stands, then the choices. */
    welcomeBack: 'Welcome back.',
    /** Standing by, after Skip or I'll look around (QA, 2026-10-14). */
    skipped: 'No problem. Explore at your own pace, and I\u2019m right here when you need me.',
    standbyPlain: 'I\u2019m right here when you need me.',
    noHome: 'There\u2019s no home here yet.',
    expand: 'Need a hand?',
    expandLabel: 'Maya, your host: need a hand?',
    startOwn: 'Build my own',
    welcomeEditLink: 'Welcome, with your private edit link.',
    homeDraft: (title, rooms, tasks, money) => `${title} has ${rooms} and ${tasks}${money ? `, ${money} so far` : ''}.`,
    homeEmpty: (title) => `${title} has no rooms yet.`,
    homeBooked: (day, time) => `Your visit is booked for ${day} at ${time}.`,
    homePublished: (title) => `${title} is published, with no visit booked yet.`,
    homeUnsent: 'You have changes your cleaner has not seen yet.',
    sendChanges: 'Send my changes',
    seeLink: 'See my link and PIN',
    returningLegend: 'What would you like to do?',
    seeVisit: 'See my visit',
    editRooms: 'Add or change rooms',
    changeChecklist: 'Change my checklist',
    reviewChecklist: 'Review my checklist',
    /** The home at a glance, under her name (Steve, 2026-10-14). */
    factsLabel: 'Your home at a glance',
    factQuote: 'Your quote',
    factExample: 'Example quote',
    factVisit: 'Your visit',
    factWhen: (day, time) => `${day}, ${time}`,
    factNoVisit: 'Not booked yet',
    /** Back from one of her choices (a short loop, QA 2026-10-14): what
     *  came of it, then what next. */
    whatNext: 'What would you like to do next?',
    afterBooked: (day, time) => `You’re all set for ${day} at ${time}. Your cleaner will open your checklist with the link and PIN. Tap Your visit to see it again anytime.`,
    afterMoved: (day, time) => `Done. Your visit is now ${day} at ${time}.`,
    afterCanceled: 'Your visit is canceled. Your checklist is still published, so you can choose a new time whenever you like.',
    afterUnpublished: 'Your checklist is unpublished, so its link and PIN no longer work. It’s still saved here as a draft.',
    afterSent: 'Your changes are sent. Your cleaner will see them the next time they open your checklist.',
    afterNoTime: 'No problem, the time can wait.',
    afterNotSent: 'Your changes are still saved here, ready to send whenever you like.',
    /** Saved through the guide, a published checklist (Change my checklist). */
    savedUnsent: 'Saved. Your cleaner won’t see these changes until you send them.',
    savedSame: 'Saved. Your checklist matches the one your cleaner has.',
    welcomeResume: 'Welcome back. Your home is just as you left it. Shall we pick up where we stopped?',
    keepGoing: 'Keep going',
    illLook: "I'll look around",

    hint: 'Tap a floor of the house to open it, and tap a blue dot to see a task. I’m right here whenever you’d like a hand.',
    about: 'Whitestone Home Care builds your cleaning checklist room by room. Every task shows its price and its time as you add it, and your quote keeps up.',
    close: 'Close'
});

/** "the shower and the bathtub": task names in a sentence. */
export function theList(names) {
    const words = names.map((n) => `the ${String(n).toLowerCase()}`);
    return words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

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
    bathHeading: 'Type of bath',
    editTask: 'Edit this task',
    star: 'Star it',
    unstar: 'Unstar it',
    starLabel: (name) => `Star ${name}`,
    removeTask: 'Remove this task',
    notes: (text) => `Notes: ${text}`,
    avoid: (text) => `Please avoid: ${text}`,
    checklist: 'Your checklist',
    home: 'Your home',
    book: 'Choose a time',
    visit: 'Your visit',
    link: 'Link and PIN',
    send: 'Send my changes',
    starred: (name) => `Starred ${name}. We start there.`,
    unstarred: (name) => `${name} is no longer starred.`,
    starStep: 'Starred a task'
});

/** The Help menu, top right (main.js). */
export const HELP = Object.freeze({
    button: 'Help',
    label: 'Help',
    /** Start over: everything cleared, after the confirmation card. */
    reset: 'Start over',
    resetTitle: 'Start over from the beginning?',
    resetDetail: 'This clears your checklists, photos and answers from this browser, and Maya will greet you as on your first visit. It cannot be undone.',
    resetConfirm: 'Clear and start over',
    /** With checklists published from this browser: they are unpublished
     *  first (Steve, 2026-10-14). */
    resetDetailPublished: 'This unpublishes what you published, so its links and PINs stop working and any booked visit is canceled. Then it clears your checklists, photos and answers from this browser, and Maya will greet you as on your first visit. It cannot be undone.',
    resetLocked: (hours) => `You have a visit less than ${hours} hours away, so Start over has to wait until after it.`,
    resetDone: 'Everything is cleared. You are back at the beginning.',
    about: 'About Whitestone'
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
    walk({ BRAND, ITEM_ERRORS, BOOKING_ERRORS, BOOKING, RECEIPT, CHANGES, DAY_STATUS, STORE, FREQUENCIES, UI, MODEL_LINES, GUIDE, HELP, PANEL, STORAGE_NOTES, GUARDS, TASKS_PAGE, CALENDAR }, 'copy');
    return out;
}
