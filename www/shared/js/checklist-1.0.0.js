// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * checklist.js - "Things to discover" panel (shared engine part)
 *
 * A light, session-scoped discovery list that gives visitors a few delightful
 * things to seek out (meet the host, see the car on the lift, ...). It owns the
 * small HUD panel (built into #hud in the experience's index.html) and the
 * canonical item state; the experience's interaction handlers call
 * markChecklistItem() when each thing is discovered, and in-world mirrors (like
 * a whiteboard) subscribe via onChecklistChange().
 *
 * The item list is experience content, injected at init:
 *   initChecklist({
 *       storageKey: 'tire-checklist',   // sessionStorage key (default below)
 *       items: [{ id, label, short }]   // label: HUD panel; short: tight mirrors
 *   })
 *
 * Progress is kept in sessionStorage only (resets when the tab closes), matching
 * the rest of the site's storage and keeping each visit a fresh little hunt.
 */

const DEFAULT_STORAGE_KEY = 'experience-checklist';

// The canonical list and storage key for this experience, set by initChecklist.
// Kept empty by default: an experience without discoveries simply never shows
// a panel (the HUD markup is also optional).
let STORAGE_KEY = DEFAULT_STORAGE_KEY;
let ITEMS = [];

const done = new Set();
const listeners = [];
let panelEl = null, listEl = null, countEl = null;

/** Read persisted progress (best-effort; storage can throw in private mode). */
function restore() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) JSON.parse(raw).forEach(id => { if (ITEMS.some(it => it.id === id)) done.add(id); });
    } catch (e) { /* ignore */ }
}

function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...done])); } catch (e) { /* ignore */ }
}

/** Snapshot of items with their done state — handed to mirror subscribers. */
export function getChecklistItems() {
    return ITEMS.map(it => ({ id: it.id, label: it.label, short: it.short, done: done.has(it.id) }));
}

export function getChecklistProgress() {
    return { done: done.size, total: ITEMS.length, complete: done.size === ITEMS.length };
}

/** Subscribe to changes (called whenever an item ticks). */
export function onChecklistChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
}

function notify() {
    const items = getChecklistItems();
    const progress = getChecklistProgress();
    listeners.forEach(cb => { try { cb(items, progress); } catch (e) { /* keep going */ } });
}

function updateCount() {
    if (countEl) countEl.textContent = `${done.size} / ${ITEMS.length}`;
    if (panelEl) panelEl.classList.toggle('complete', done.size === ITEMS.length);
}

/**
 * Install the experience's item list and build the HUD panel rows from the
 * restored state. Safe to call once after the DOM is ready; the panel lives
 * inside #hud so it fades and goes inert with the rest of the HUD automatically.
 *
 * @param {Object} [config] - { items: [{id, label, short}], storageKey: string }
 */
export function initChecklist(config = {}) {
    if (typeof config.storageKey === 'string' && config.storageKey) {
        STORAGE_KEY = config.storageKey;
    }
    if (Array.isArray(config.items)) {
        ITEMS = config.items.map(it => ({ id: it.id, label: it.label, short: it.short }));
    }
    done.clear();
    restore();
    panelEl = document.getElementById('checklist');
    listEl = document.getElementById('checklist-items');
    countEl = document.getElementById('checklist-count');

    if (listEl) {
        listEl.textContent = '';
        ITEMS.forEach(it => {
            const li = document.createElement('li');
            li.className = 'checklist-item' + (done.has(it.id) ? ' done' : '');
            li.dataset.id = it.id;

            const box = document.createElement('span');
            box.className = 'checklist-box';
            box.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.className = 'checklist-text';
            text.textContent = it.label;

            li.appendChild(box);
            li.appendChild(text);
            listEl.appendChild(li);
        });
    }
    updateCount();
}

/**
 * Mark a discovery item complete. No-op if the id is unknown or already done, so
 * handlers can call it freely on every interaction. Updates the HUD row, persists,
 * and notifies subscribers (e.g. an in-world whiteboard) so mirrors tick in sync.
 */
export function markChecklistItem(id) {
    if (!ITEMS.some(it => it.id === id) || done.has(id)) return;
    done.add(id);
    persist();

    if (listEl) {
        const li = listEl.querySelector(`[data-id="${id}"]`);
        if (li) {
            li.classList.add('done');
            li.classList.add('just-done'); // brief tick animation (see styles.css)
            // Drop the one-shot animation class after it plays so re-renders don't replay it.
            setTimeout(() => li.classList.remove('just-done'), 600);
        }
    }
    updateCount();
    notify();
}
