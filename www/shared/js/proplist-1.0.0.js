// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * proplist.js - the keyboard's way to the things in a 3D room.
 *
 * ---- THE GAP THIS CLOSES ----
 *
 * Every story card in a room scene opens from a click or a tap on the canvas:
 * a raycast from the pointer, a prop at the end of it, the prop's card. That is
 * the only route in, so a visitor with no pointer, or with a screen reader,
 * could reach the welcome card, look around with the keys, and leave, never
 * having opened a single story. No test failed, because every test drove the
 * pointer route, and no screenshot could show a route that was never built.
 * www/garden found this first with its trees and fixed it with an off-screen
 * list; this is that list, generalized, for the rooms whose objects are fixed.
 *
 * ---- WHAT IT IS ----
 *
 * One row per thing in the room worth a story, each a real <button> whose TEXT
 * is its accessible name. Choosing a row calls back into the scene, which opens
 * the same card a click on that prop would. It is an ADDRESSING MECHANISM, not
 * a second set of cards that could drift from the first.
 *
 * The panel it fills lives in the page's markup, off the top of the screen, and
 * slides into view whenever anything inside it has focus (`.prop-panel` in the
 * shared stylesheet, the same idiom as `.skip-link`). So a pointer visitor never
 * sees it and a sighted keyboard visitor always sees where they are. A panel
 * that is focusable but never visible is a trap only they would ever find.
 *
 * ---- THE LABELS COME FROM THE CARDS ----
 *
 * `propListItems` builds the rows from the scene's own card table, taking each
 * card's title as the row's text. The row and the card it opens therefore say
 * the same name, and a card renamed later renames its row. It also keeps only
 * props that are REGISTERED in the scene, so a card written for something that
 * was never built, or has since been taken out, cannot leave a row that opens
 * nothing.
 */

/**
 * Rows for a room: every prop that is both registered in the scene (so it is
 * really there) and has a card to open (so choosing it does something),
 * labelled with that card's own title, in the card table's order.
 *
 * @param {object} content          the scene's card table, { kind: { title, ... } }
 * @param {Iterable<string>} kinds  the propKinds registered in the scene
 * @param {object} [options]
 * @param {Array<{id,label}>} [options.before]  rows to lead with (the host)
 * @param {Array<{id,label}>} [options.after]   rows to finish with (a control
 *                                              that opens a panel, not a card)
 * @returns {Array<{id: string, label: string}>}
 */
export function propListItems(content, kinds, { before = [], after = [] } = {}) {
    const present = new Set(kinds || []);
    const rows = [...before];
    for (const [id, card] of Object.entries(content || {})) {
        if (!present.has(id)) continue;
        if (!card || typeof card.title !== 'string' || !card.title) continue;
        rows.push({ id, label: card.title });
    }
    return rows.concat(after);
}

/**
 * Fill `list` with one button per item. Choosing a row calls `onChoose(id)`.
 * Rebuilds from scratch, so calling it again replaces the rows rather than
 * adding to them. The rows are static for the life of a room, so there is no
 * rebuild on a timer to take focus away with it (the garden's list has one,
 * and has to guard against exactly that).
 *
 * @param {object} options
 * @param {HTMLElement} options.list      the <ul> to fill
 * @param {Array<{id,label}>} options.items
 * @param {(id: string) => void} options.onChoose
 * @param {AbortSignal} [options.signal]  releases the row listeners
 * @returns {number} how many rows were built
 */
export function installPropList({ list, items, onChoose, signal } = {}) {
    if (!list) return 0;
    list.textContent = '';
    const listenerOpts = signal ? { signal } : undefined;
    let count = 0;
    for (const item of items || []) {
        if (!item || !item.id || !item.label) continue;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prop-row';
        // THE TEXT IS THE NAME. No aria-label over it: a screen reader and a
        // sighted keyboard visitor should hear and see the same words.
        btn.textContent = item.label;
        btn.setAttribute('data-prop', item.id);
        btn.addEventListener('click', () => {
            if (typeof onChoose === 'function') onChoose(item.id);
        }, listenerOpts);
        li.appendChild(btn);
        list.appendChild(li);
        count += 1;
    }
    return count;
}
