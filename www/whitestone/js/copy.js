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
    honesty: 'Whitestone Home Care is a demo by SceneXP, not a real company. Prices and bookings are examples.',
    /** The notice at the top of the quote, the calendar and the receipt
     *  (Steve, 2026-10-16: the small print at their foot went unseen, and
     *  Whitestone is not a real company). Static in index.html, the same
     *  words held here for its test. */
    demoTitle: 'Just a demo',
    demoQuote: 'Whitestone Home Care is not a real company. These prices are examples, and nothing is ever charged.',
    demoBooking: 'Whitestone Home Care is not a real company. Choosing a time books nothing, and no cleaner will come.',
    demoReceipt: 'Whitestone Home Care is not a real company. This visit is not real, and no cleaner will come.',
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
    started: 'Your cleaner has already started this visit, so it can’t be moved or canceled now.',
    'no-booking': 'This checklist has no visit booked.',
    expired: 'That took a while, so the reservation lapsed. Please choose your time again.',
    offline: 'Whitestone could not be reached. Please check your connection and try again.',
    denied: 'This checklist could not be updated. Please try again.',
    server: 'Something went wrong on our side. Please try again in a moment.',
    unpriced: 'Please add a task, or fix the ones the menu no longer offers, before choosing a time.',
    sample: 'The example home cannot be booked. Please schedule a cleaning for your own home instead.',
    // Sending changes and moving a visit (sync.js republish, PRD 10.4).
    'no-longer-fits': 'With your changes, your visit no longer fits at its booked time. Please choose a new time, and your changes are sent with it.',
    'not-published': 'This checklist has no visit yet. Please choose a time first.'
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
    confirm: 'Book my visit',
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
    pinUnknown: 'Shown when you booked.',
    pinUnknownAdvice: 'This device opened your checklist with its edit link, so it does not know the PIN. Set a new one to send your cleaner.',
    newPin: 'Set a new PIN',
    newPinTitle: 'Set a new PIN?',
    newPinDetail: 'The old PIN stops working, so your cleaner will need the new one.',
    newPinDone: 'Your new PIN is on the receipt.',

    /** Published, with no visit booked (after a cancel). Customer copy
     *  never says publish (QA, 2026-10-16): the link and PIN are what the
     *  customer knows. */
    titlePublished: 'Your link and PIN',
    noVisit: 'No visit is booked. Choose a time whenever you are ready.',
    /** Changing things afterward (PRD 10.4). */
    unsent: 'You have changes your cleaner has not seen yet.',
    send: 'Send my changes',
    reschedule: 'Change the time',
    cancelVisit: 'Cancel my visit',
    book: 'Choose a time',
    locked: (hours) => `Your visit is less than ${hours} hours away, so it can no longer be changed online.`,
    /** Begun by the cleaner (QA, 2026-10-15): when, and why the visit
     *  stays as it is. `when` is startedToday's or startedOn's. */
    started: (when) => `Your cleaner started this visit ${when}, so it can’t be moved or canceled now.`,
    startedToday: (time) => `today at ${time}`,
    startedOn: (day, time) => `on ${day} at ${time}`,
    startedSoon: 'Your cleaner has started this visit, so it can’t be moved or canceled now.',
    unpublish: 'Stop sharing this checklist'
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
    /** A visit under way (QA, 2026-10-16): add, never take away (held.js). */
    held: 'Your cleaner is working on your home now, so what they already have can’t be removed or changed until the visit is done. You can still add tasks and rooms.',
    heldSend: 'Some of your changes remove or change tasks your cleaner already has. Please put those back (Undo works), or send them after the visit.',
    moved: (when) => `Your visit is moved to ${when}.`,
    cancelTitle: 'Cancel your visit?',
    cancelDetail: (when) => `Your visit on ${when} is canceled and the time is given back. Your link and PIN keep working, so you can choose a new time.`,
    cancelConfirm: 'Cancel my visit',
    keep: 'Keep it',
    notNow: 'Not now',
    cancelled: 'Your visit is canceled. Your link and PIN still work, ready for a new time.',
    unpublishTitle: 'Stop sharing this checklist?',
    unpublishDetail: 'The link and PIN stop working now, and the copy kept for your cleaner is deleted. Your checklist stays here as a draft.',
    unpublishDetailBooked: (when) => `The link and PIN stop working now, the copy kept for your cleaner is deleted, and your visit on ${when} is canceled. Your checklist stays here as a draft.`,
    unpublishConfirm: 'Stop sharing',
    unpublished: (title) => `${title} is no longer shared. It is a draft on this device again.`
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
    sampleNotPublished: 'The example home cannot be booked. Please schedule a cleaning for your own home instead.',
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
    undone: (label) => `Undone. ${label}`,
    nothingToUndo: 'There is nothing to undo.',
    levelsNeeded: 'Please tick at least one level.',
    sheetFailed: 'The service menu could not be loaded. Please check your connection and reload the page.',
    rooms: (n) => `${n} ${n === 1 ? 'room' : 'rooms'}`,
    tasks: (n) => `${n} ${n === 1 ? 'task' : 'tasks'}`,
    remove: 'Remove',
    notSaving: 'Not saving',
    otherTab: 'Your checklists were updated in another tab.',
    labels: Object.freeze({
        started: 'Started a checklist',
        home: 'Changed your home details',
        preferences: 'Changed care preferences',
        roomAdded: 'Added a room',
        roomChanged: 'Changed a room',
        bathChanged: 'Changed a type of bath',
        roomRemoved: 'Removed a room',
        taskAdded: 'Added a task',
        taskChanged: 'Changed a task',
        taskRemoved: 'Removed a task',
        moved: 'Moved a task'
    }),
    editLinkFailed: 'That edit link did not open a checklist. It may have expired, or no longer be shared.',

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
    visitChipNone: 'No visit booked yet',
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
    progressLabel: 'Your progress',
    progress: Object.freeze(['Home type', 'Floors', 'First room', 'Your rooms', 'Review']),
    progressStep: (n, total, name) => `Step ${n} of ${total}: ${name}`,
    /** A step's name, spoken and in its tooltip: its shown words first (the
     *  accessibility sweep, 2026-10-16, WCAG 2.5.3), so a voice saying what
     *  it sees finds it. The same rule for every name below that adds to
     *  the words on its button. */
    goToStep: (name) => `${name}: go to this step`,
    /** Back's hover title: where it goes. */
    backTo: (name) => `Back to ${name}`,
    backToStart: 'Back to the start',

    /** What the visitor came for is a cleaning (QA, 2026-10-16): the
     *  checklist is how, never the goal. */
    hello: "Hi, I'm Maya with Whitestone Home Care. Let's schedule your cleaning: tell me what to clean, room by room, then choose a time. It takes about two minutes.",
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
    /** Under the floors: why the main floor cannot be unticked. */
    mainAlways: 'Every home has a main floor, so it is always ticked.',
    floorsLegend: 'Floors in your home',
    next: 'Next',
    back: 'Back',

    firstRoom: 'Most people start with the kitchen. Shall we add it?',
    firstRoomAgain: 'Adding the kitchen brings its standard tasks with it. You can change any of them.',
    addKitchen: 'Add the kitchen',
    otherRoom: 'Another kind of room',
    roomsLegend: 'Add a room',
    /** With a floor open, the chips add to it (QA, 2026-10-16). */
    roomsLegendOn: (floor) => `Add a room to the ${String(floor).toLowerCase()}`,
    /** Your rooms' list of floors, each opening as a tap on it does (QA,
     *  2026-10-16: a floor was reached only from the house). */
    floorsHeading: 'Floors',

    /** Said once the first room is in, from the price sheet. */
    added: (room, count, money) => `There's your ${room} with its ${countWord(count)} standard ${count === 1 ? 'task' : 'tasks'}, ${money} so far.`,
    addedMinimum: (money) => `Every visit starts at ${money}, so your next rooms fit inside that.`,
    addedPlain: (room) => `There's your ${room}.`,
    /** The blue dots, on the room just added (QA, 2026-10-16: they are
     *  not tapped, so the room is). */
    addedDots: (room, count) => (count === 1
        ? `The blue dot is that task. Tap the ${room} to see it, or star it if it matters most.`
        : `Each blue dot is one of them. Tap the ${room} to see them all, or star the ones that matter most.`),

    gotIt: 'Got it',

    rooms: "Now add your other rooms here, or tap a floor to open it. If that's everything, review your checklist.",
    roomsAgain: "Add as many rooms as you like. When you're done, review your checklist.",
    roomsMore: "Looking good. Add as many as you like, or review when you're ready.",
    addRoom: 'Add a room',
    reviewIt: 'Review my checklist',

    review: "Here's your home and your quote. One last thing: is there anything we should avoid, like strong scents or bleach?",
    /** Review's main button is the next step itself (QA, 2026-10-16: a
     *  Save button saved nothing, since every change is kept as it is
     *  made): Choose a time, or for a checklist the cleaner has, Send my
     *  changes or See my visit (`label`). */
    reviewAgain: (label) => `Tap ${label} when everything looks right. Care preferences are optional.`,
    preferences: 'Choose preferences',
    /** Review's quote as a button too, for those who go by her buttons (QA,
     *  2026-10-16); Your quote at a glance opens it as well. */
    reviewQuote: 'Review my quote',
    chooseTime: 'Choose a time',

    example1: 'This is a four-bedroom home with a home office.',
    example2: 'Each room has its tasks, and every task has a price.',
    /** The dots, shown and not tapped (Example mode, QA 2026-10-15), named
     *  by one task and its room, since none is ringed (QA, 2026-10-16). */
    example3: (task, room) => `Each blue dot is a task, like the ${String(task).toLowerCase()}${room ? ` in the ${String(room).toLowerCase()}` : ''}. In your own home, you can tap a room to see what’s included, or star the tasks that matter most.`,
    example3Plain: 'Each blue dot is a task. In your own home, you can tap a room to see what’s included, or star the tasks that matter most.',
    /** The example's last visit (M5): the report on the house, and its bill. */
    exampleReport: (billed, quote) => `After each visit, your cleaner’s report lights up the house. Green is done, amber was skipped, and gray wasn’t reached. This visit came to ${billed} of the ${quote} quote, since skipped work comes off the bill.`,
    exampleReportPlain: 'After each visit, your cleaner’s report lights up the house. Green is done, amber was skipped, and gray wasn’t reached. Skipped work comes off the bill.',
    exampleTotal: (money, time) => `Cleaned as listed, this home comes to ${money}, ${time}.`,
    examplePrices: 'These are example prices.',
    example4: 'Ready to schedule a cleaning of your own?',
    backOneStep: 'Back one step',
    /** Beside Next on the example's beats (QA, 2026-10-16): straight to the
     *  build's first step, as Schedule my cleaning on the last. */
    skipTour: 'Skip the tour',
    buildOwn: 'Schedule my cleaning',

    welcome: 'Welcome back. Your home is just as you left it.',
    /** A returning visitor's home base (QA, 2026-10-14): where the home
     *  stands, then the choices. */
    welcomeBack: 'Welcome back.',
    /** Standing by, after Skip or I'll look around (QA, 2026-10-14). */
    standbyPlain: 'I\u2019m right here when you need me.',
    noHome: 'There\u2019s no home here yet.',
    expand: 'Need a hand?',
    expandLabel: 'Need a hand? Ask Maya, your host.',
    welcomeEditLink: 'Welcome, with your private edit link.',
    homeDraft: (title, rooms, tasks, money) => `${title} has ${rooms} and ${tasks}${money ? `, ${money} so far` : ''}.`,
    homeEmpty: (title) => `${title} has no rooms yet.`,
    homeBooked: (day, time) => `Your visit is booked for ${day} at ${time}.`,
    homePublished: (title) => `${title} has no visit booked yet. Its link and PIN still work.`,
    homeUnsent: 'You have changes your cleaner has not seen yet.',
    /** After a visit (QA, 2026-10-15): how it went, then the next cleaning. */
    homeVisited: (day) => `Your cleaning on ${day} is complete.`,
    homeVisitedPlain: 'Your last cleaning is complete.',
    homeBilled: (money) => `You were billed ${money}.`,
    nextCleaning: 'Plan my next cleaning',
    lastReport: 'See my last report',
    roomsNextVisit: 'Here is your home from last time. Change anything you like, then review your checklist to choose a time.',
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
    afterCanceled: 'Your visit is canceled. Your link and PIN still work, so you can choose a new time whenever you like.',
    afterUnpublished: 'Done. Your link and PIN no longer work, and your checklist is still saved here as a draft.',
    afterSent: 'Your changes are sent. Your cleaner will see them the next time they open your checklist.',
    afterNoTime: 'No problem. Your checklist is saved in this browser, so you can choose a time whenever you like.',
    afterNotSent: 'Your changes are still saved here, ready to send whenever you like.',
    /** Review, for a checklist the cleaner has (Change my checklist). */
    reviewUnsent: 'Your cleaner won’t see these changes until you send them.',
    reviewSame: 'Your checklist matches the one your cleaner has.',
    welcomeResume: 'Welcome back. Your home is just as you left it. Shall we pick up where we stopped?',
    keepGoing: 'Keep going',
    /** Start over: beside Keep going, and at the foot of her bubble. */
    startOver: 'Start over',

    /** A cleaner's add-on, put to the customer (M5, PRD 9.5): where, what
     *  and what it adds, their words, the question, and the promise. */
    addOnAsk: (where, what) => `Your cleaner would like to add something ${where}. ${what}.`,
    addOnInRoom: (room) => `in the ${String(room).toLowerCase()}`,
    addOnInHome: 'while they are there',
    /** Two or more waiting (QA, 2026-10-15: "2 waiting" read as one): how
     *  many, then the first, and after an answer, the next. `place` is
     *  addOnInRoom's, else addOnForHome. */
    addOnAskMany: (n, place, what) => `Your cleaner would like to add ${n} things. The first is ${place}. ${what}.`,
    addOnAskNext: (place, what) => `The next one is ${place}. ${what}.`,
    addOnForHome: 'for your home',
    addOnMoreWaiting: (n) => `${n} more are waiting.`,
    addOnAnswered: (status, name) => (status === 'declined' ? `Declined: ${name}.` : `Approved: ${name}.`),
    seeAllAddOns: (n) => `See all ${n}`,
    addOnPriced: (name, money, time) => `${name}, for ${money} more, ${time}`,
    addOnWords: (words) => `They say, “${words}”`,
    addOnQuestion: 'Shall they go ahead?',
    addOnPlain: 'Your cleaner would like to add something. Shall they go ahead?',
    addOnAgain: 'Tap Approve and your cleaner can go ahead, or Decline and they will leave it.',
    addOnPromise: 'You only pay for it if you approve it and it’s done.',
    approve: 'Approve',
    decline: 'Decline',
    afterApproved: (name) => `Approved: ${name}. Your cleaner will see it in a moment and can go ahead.`,
    afterDeclined: (name) => `Declined: ${name}. Your cleaner will see it in a moment, and you won’t be charged for it.`,
    addOnOffline: 'I couldn’t reach Whitestone, so your answer isn’t sent yet. Please try again in a moment.',
    addOnTrouble: 'Your answer didn’t go through. Please try again in a moment.',
    /** At a glance while the visit is open, a tap away from the list:
     *  how many wait, else that every one is answered. */
    factAddOns: 'Add-ons',
    /** The visit at a glance, once the cleaner has begun. */
    factUnderWay: 'In progress',
    factWaiting: (n) => `${n} waiting`,
    factAnswered: (n) => `${n} answered`,
    factAddOnsSpoken: (n) => `${n} ${n === 1 ? 'add-on' : 'add-ons'} from your cleaner, waiting for your answer.`,
    factAnsweredSpoken: (n) => `${n} ${n === 1 ? 'add-on' : 'add-ons'} from your cleaner, all answered.`,

    /** A visit's report come in (M5 piece 3): the bill, what was skipped
     *  and why, what was not reached, and what next. */
    reportPlain: 'Your visit report is in.',
    reportLead: 'Your visit report is in.',
    reportBilled: (billed, quote) => `You were billed ${billed} of your ${quote} quote.`,
    reportNothing: 'Nothing was done, so there is no charge.',
    reportAllDone: 'Everything on your checklist was done.',
    reportSkipped: (list) => `Skipped: ${list}.`,
    reportSkipItem: (name, why, off) => `${name}${why || off ? ` (${[String(why).toLowerCase(), off].filter(Boolean).join(', ')})` : ''}`,
    reportMore: (n) => `and ${n} more`,
    reportNotReached: (n) => `${n} ${n === 1 ? 'task was' : 'tasks were'} not reached.`,
    reportHasNote: 'Your cleaner left you a note.',
    reportColors: 'On the house, green is done, amber is skipped, and gray was not reached.',
    fullReport: 'See the full report',
    reportLater: 'Done',
    factLastVisit: 'Last visit',
    factBilled: (money) => `Billed ${money}`,
    factReportIn: 'Report in',
    factNew: 'New',
    factLastVisitSpoken: (value, isNew) => `Last visit: ${value}.${isNew ? ' A new report.' : ''}`,

    hint: 'Tap a floor of the house to open it, and tap a room to see its tasks. I’m right here whenever you’d like a hand.',
    /** The → by her name: her bubble's main step, from the top (QA,
     *  2026-10-15: on a phone the buttons can sit below the fold). */
    continueTo: (label) => `Continue: ${label}`
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
    /** A floor's row, in the panel and in Maya's Your rooms (QA, 2026-10-16). */
    floorRooms: (n) => (n ? (n === 1 ? '1 room' : `${n} rooms`) : 'No rooms yet'),
    floorOpen: (floor, rooms) => `${floor}, ${String(rooms).toLowerCase()}: open it`,
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
    chipLabel: (name) => `${name}: add it with its standard tasks`,
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
    /** Start over (her bubble's foot, or beside Keep going): everything
     *  cleared, after the confirmation card. */
    reset: 'Start over',
    resetTitle: 'Start over from the beginning?',
    resetDetail: 'This clears your checklists, photos and answers from this browser, and Maya will greet you as on your first visit. It cannot be undone.',
    resetConfirm: 'Clear and start over',
    /** With checklists published from this browser: they are unpublished
     *  first (Steve, 2026-10-14). */
    resetDetailPublished: 'This stops sharing your checklists, so their links and PINs stop working and any booked visit is canceled. Then it clears your checklists, photos and answers from this browser, and Maya will greet you as on your first visit. It cannot be undone.',
    resetLocked: (hours) => `You have a visit less than ${hours} hours away, so Start over has to wait until after it.`,
    resetStarted: 'Your cleaner is working on your home now, so Start over has to wait until the visit is done.',
    resetDone: 'Everything is cleared. You are back at the beginning.',
    /** Start over's hover title. */
    resetHover: 'Clear everything and start from the beginning'
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

/** "in the kitchen": a room as a place, for the tasks page. */
const TASKS_PAGE_IN = (room) => `in the ${String(room).toLowerCase()}`;

/**
 * The visit report in words, as both sides read it (report.js
 * reportLines and billLines, M5): the bill, what was skipped and why, what
 * was not reached, and what became of each add-on.
 */
export const REPORT = Object.freeze({
    reasons: Object.freeze({
        'no-time': 'Ran out of time',
        'no-access': 'Could not reach it',
        'already-clean': 'Already clean',
        'customer-asked': 'The customer asked to skip it'
    }),
    billHeading: 'The bill',
    billLine: (billed, quote) => `Billed ${billed} of the ${quote} quote.`,
    billNothing: 'Nothing was done, so there is no charge.',
    billNoSheet: 'The prices could not be loaded, so the bill is not shown yet.',
    billDone: (money) => `Tasks done: ${money}`,
    billAddOns: (money) => `Add-ons done: ${money}`,
    billMinimum: (money) => `Visit minimum: ${money}`,
    counts: (done, skipped, notReached) => `${done} done, ${skipped} skipped, ${notReached} not reached.`,
    skippedHeading: 'Skipped',
    notReachedHeading: 'Not reached',
    addOnsHeading: 'Add-ons',
    lineOff: (money) => `${money} off`,
    inTheRoom: (task, room) => `${task}, ${TASKS_PAGE_IN(room)}`,
    removedSince: 'A task removed since this visit',
    /** The studio's report card (M5 piece 3). */
    visitOn: (day) => `Visit on ${day}`,
    cleanedBy: (name) => `Cleaned by ${name}.`,
    onSite: (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        const parts = [h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '', m ? `${m} minutes` : ''].filter(Boolean);
        return `Time on site: ${parts.join(' ')}.`;
    },
    noteHeading: 'From your cleaner',
    photosHeading: 'Photos from your cleaner',
    photoOf: (task) => `Photo of ${task}`,
    addOnOutcome: Object.freeze({
        done: 'Approved and done',
        approved: 'Approved, not done, so not charged',
        declined: 'Declined',
        lapsed: 'No answer in time, so not done'
    })
});

/** The studio's add-ons card (QA, 2026-10-15): every add-on of the visit
 *  under way, opened from Add-ons at a glance, each answered in place. */
export const ADDON_LIST = Object.freeze({
    leadWaiting: (n) => `Your cleaner is waiting for your answer on ${n} ${n === 1 ? 'add-on' : 'add-ons'}.`,
    leadAnswered: 'Every add-on has your answer. Your cleaner will see them in a moment.',
    leadNone: 'Your cleaner hasn’t asked for anything extra on this visit.',
    waitingHeading: 'Waiting for your answer',
    answeredHeading: 'Your answers',
    /** Where and how long: "Kitchen, about 30 minutes". */
    meta: (room, time) => [room, time].filter(Boolean).join(', '),
    noPrice: 'Price not available yet',
    approve: GUIDE.approve,
    decline: GUIDE.decline,
    approveLabel: (name) => `Approve ${name}`,
    declineLabel: (name) => `Decline ${name}`,
    status: Object.freeze({
        approved: 'Approved',
        declined: 'Declined'
    }),
    approvedSum: (money) => `Approved so far: ${money} more`
});

/** The cleaner's page. */
export const TASKS_PAGE = Object.freeze({
    incomplete: 'Please enter all 6 digits of the PIN.',
    pageTitle: 'Whitestone Home Care',
    /** The cleaner's heading: a checklist is no longer named by its
     *  customer (QA, 2026-10-15), and "Our home" reads oddly from here. */
    heading: 'Cleaning checklist',
    // Opening (M4): the PIN, and what can go wrong.
    opening: 'Opening the checklist.',
    denied: 'That PIN did not open the checklist. Please check it and try again.',
    deniedMany: 'That PIN still did not open it. After several tries the checklist rests for a while, so please check the PIN with your customer.',
    again: 'Please enter the PIN again to open the checklist.',
    badLink: 'This link is missing part of its address. Please ask your customer to send it again.',
    gone: 'This checklist is no longer shared. Please ask your customer for a new link.',
    /** No visit booked (QA, 2026-10-15): cancelled while the page was open
     *  or since it was last opened here, or never booked. Nothing can be
     *  marked, and a new time shows here by itself. */
    /** A task the customer added after the visit began (QA, 2026-10-16). */
    addedDuring: 'Added during your visit',
    canceledHeading: 'This visit was canceled',
    canceledLine: (day, time) => `The customer canceled the visit for ${day} at ${time}. There is nothing to do here now. Thank you.`,
    canceledPlain: 'The customer canceled this visit. There is nothing to do here now. Thank you.',
    noVisitHeading: 'No visit is booked',
    noVisitLine: 'This checklist has no visit booked right now, so there is nothing to do here yet.',
    newTimeShows: 'If the customer books a new time, this page will show it.',
    moved: (day, time) => `The customer moved this visit to ${day} at ${time}.`,
    offline: 'The checklist could not be reached. Please check your connection and try again.',
    trouble: 'Something went wrong opening the checklist. Please try again in a moment.',
    unreadable: 'This link does not open this checklist. Please ask your customer to send it again.',
    noSheet: 'The prices could not be loaded, so times and the quote are not shown. Every task is listed.',
    quoteChanged: 'These figures are worked out again from the price sheet, and they differ from the quote your customer was given.',
    // The checklist (view.js).
    prefsHeading: 'Care preferences',
    quoteLine: (money, time) => `Quote ${money}, ${time}`,
    visitLine: (day, time) => `Visit ${day} at ${time}`,
    household: 'About the home:',
    startHere: 'Start here',
    inRoom: (room) => TASKS_PAGE_IN(room),
    emptyRoom: 'No tasks in this room.',
    starred: 'starred',
    notes: 'Notes:',
    avoid: 'Avoid:',
    products: 'Products:',
    takes: (time) => `Takes ${time}`,
    photoOf: (n, task) => `Photo ${n} of ${task}`,
    close: 'Close',
    // The visit (M4 piece 2): Done and Skip, why, and where it stands.
    done: 'Done',
    isDone: 'Done',
    skip: 'Skip',
    isSkipped: 'Skipped',
    /** Done and Skip, named by their shown words first, then the task
     *  (WCAG 2.5.3): `shown` is what the button says now. */
    markDone: (task) => `Done: ${task}`,
    markSkip: (task, shown = 'Skip') => `${shown}: ${task}`,
    skipWhy: 'Why was it skipped?',
    skipWhyOf: (task) => `Why ${task} was skipped`,
    reasons: REPORT.reasons,
    skipWords: 'Or say why in a few words',
    skipWithWords: 'Skip with these words',
    cancel: 'Cancel',
    unskip: 'Not skipped after all',
    skipNeedsWhy: 'Please choose a reason, or write a few words.',
    skippedBecause: (why) => `Skipped: ${why}`,
    summary: (done, skipped, toGo) => `${done} done, ${skipped} skipped, ${toGo} to go.`,
    starredToGo: (n) => `Starred: ${n} to go.`,
    starredDone: 'Starred: all done.',
    starredMarked: (done, skipped) => `Starred: ${done} done, ${skipped} skipped.`,
    savedHere: 'Saved on this device as you go.',
    // Add-ons (M4 piece 3): proposed from a room, approved by the customer.
    addOnsHeading: 'Add-ons',
    propose: 'Propose an add-on',
    proposeIn: (room) => `Propose an add-on ${TASKS_PAGE_IN(room)}`,
    addOnWhat: 'What does it need?',
    addOnChoose: 'Choose one',
    addOnNewTask: 'Add a task',
    addOnUpgrade: 'Upgrade a task',
    addOnAdds: (money, time) => `Adds ${money}, ${time}, once the customer approves.`,
    addOnPriced: (money, time) => `${money}, ${time}`,
    addOnHowMany: 'How many',
    addOnWords: 'A few words for the customer (optional)',
    addOnSend: 'Send to the customer',
    addOnSending: 'Sending',
    addOnPickFirst: 'Please choose what it needs first.',
    addOnOffline: 'That did not send. Please check your connection and try again.',
    addOnFull: 'This visit has all the add-ons it can take.',
    addOnExpired: 'Your visit pass has ended. Please reload the page and enter the PIN again.',
    addOnTrouble: 'That did not send. Please try again in a moment.',
    addOnStatus: Object.freeze({
        waiting: 'Waiting for the customer',
        approved: 'Approved by the customer',
        declined: 'Declined by the customer'
    }),
    addOnCount: Object.freeze({
        waiting: (n) => `${n} waiting`,
        approved: (n) => `${n} approved`,
        declined: (n) => `${n} declined`
    }),
    print: 'Print a work order',
    keptCopy: 'You are offline, so this is the copy kept on this device for your visit. Your marks are saved here as usual.',
    /** `counts` already joined: "1 approved, 1 waiting". */
    addOnsLine: (counts) => `Add-ons: ${counts}.`,
    addOnClosed: 'The report for this visit is sent, so no more add-ons can be proposed.',
    // Proof photos (M5 piece 4): an "after" shot or two on a marked task.
    addProof: 'Add a photo',
    addProofOf: (task) => `Add a photo of ${task} for your customer`,
    ofTask: (task) => `of ${task}`,
    proofOf: (n, task) => `Your photo ${n} of ${task}`,
    proofsOf: (task) => `Your photos of ${task}`,
    removeProof: 'Remove',
    removeProofOf: (n, task) => `Remove your photo ${n} of ${task}`,
    proofFailed: 'That photo could not be added. Please try another.',
    proofsOptional: 'Photos are optional. Your customer sees them with the report.',
    visitOver: 'This visit is complete and your report was sent. The customer’s checklist is no longer shared, so there is nothing more to open here. Thank you.',

    // Finishing the visit (M5 piece 2): the report and the bill, then send.
    finish: 'Finish visit',
    finishTitle: 'Finish the visit',
    finishLead: 'Check the report, then send it to your customer. Anything not marked is reported as not reached.',
    sentTitle: 'Visit report sent',
    sentLead: 'Thank you. Your customer can see the report now.',
    pendingTitle: 'Report waiting to send',
    // The report's own words are REPORT's, shared with the studio; only
    // the line for a sheet that will not load speaks to the cleaner.
    billHeading: REPORT.billHeading,
    billLine: REPORT.billLine,
    billNothing: REPORT.billNothing,
    billNoSheet: 'The prices could not be loaded here, so your customer’s page works out the bill.',
    billDone: REPORT.billDone,
    billAddOns: REPORT.billAddOns,
    billMinimum: REPORT.billMinimum,
    reportCounts: REPORT.counts,
    skippedHeading: REPORT.skippedHeading,
    notReachedHeading: REPORT.notReachedHeading,
    addOnsReportHeading: REPORT.addOnsHeading,
    lineOff: REPORT.lineOff,
    inTheRoom: REPORT.inTheRoom,
    addOnOutcome: REPORT.addOnOutcome,
    nameLabel: 'Your first name (optional)',
    timeLabel: 'Time on site (optional)',
    hours: 'Hours',
    minutes: 'Minutes',
    hoursValue: (n) => `${n} ${n === 1 ? 'hour' : 'hours'}`,
    minutesValue: (n) => `${n} minutes`,
    noteLabel: 'A note to your customer (optional)',
    cleanerLine: (name) => `Cleaned by ${name}.`,
    onSiteLine: (time) => `Time on site: ${time}.`,
    noteLine: 'Note:',
    sendReport: 'Send report',
    sendingReport: 'Sending the report',
    backToList: 'Back to the checklist',
    retry: 'Try again now',
    reportOffline: 'No signal right now. The report is saved on this device and will send itself when the connection returns.',
    reportTrouble: 'The report did not send. It is saved on this device and will try again shortly.',
    reportNeedsPin: 'Your visit pass has ended. Please enter the PIN again, and the report will send.',
    reportTooLong: 'This report is too long to send. Please shorten the note and try again.'
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
    walk({ BRAND, ITEM_ERRORS, BOOKING_ERRORS, BOOKING, RECEIPT, CHANGES, DAY_STATUS, STORE, FREQUENCIES, UI, MODEL_LINES, GUIDE, HELP, PANEL, STORAGE_NOTES, GUARDS, TASKS_PAGE, CALENDAR, REPORT }, 'copy');
    return out;
}
