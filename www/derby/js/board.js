// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * board.js - the timer display and the results board (M1).
 *
 * THE TIMER DISPLAY is the track's electronic timer, drawn as page chrome
 * over the scene for M1 (a 3D one over the finish line comes with the
 * dressed hall, M6): the heat, and a row a lane, each filling in with its
 * time and place as its car crosses. It is decoration for sighted
 * visitors, hidden from screen readers, who hear each heat through the
 * live region instead (main.js).
 *
 * THE RESULTS BOARD is a real table (PRD, Accessibility): places, names,
 * the four-heat averages in big type, each heat's time small beneath, the
 * visitor's row lit, and each lane's average.
 *
 * NO MARKUP FROM STRINGS. Car names will be the visitor's own (M3), so
 * every word goes in through textContent.
 */

import { UI, clock, placeWord, heatOf, tiedPlace } from './copy.min.js';

/** An element with a class and text, children appended. */
export function h(tag, className, text, children = []) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    for (const c of children) if (c) el.appendChild(c);
    return el;
}

function clear(el) {
    if (el) el.textContent = '';
}

/**
 * The timer display in `root`. `build(names, mine, lanes)` lays out a race
 * of `names` (by car index) with the visitor's cars marked (`mine`, a set of
 * indexes). Then `show(on)`, `heat(n, total, label)`, and `lanes(byLane)`
 * where each lane's entry is { car, time, place } (time and place null until
 * its car crosses) or null for an empty lane.
 */
export function createTimer(root) {
    let heading = null;
    let rows = [];
    return {
        build(names, mine, lanes) {
            clear(root);
            heading = h('p', 'timer-heat', '');
            const list = h('ol', 'timer-lanes');
            rows = [];
            for (let lane = 0; lane < lanes; lane++) {
                const num = h('span', 'timer-lane', String(lane + 1));
                const name = h('span', 'timer-name', '');
                const time = h('span', 'timer-time', '');
                const place = h('span', 'timer-place', '');
                const row = h('li', 'timer-row', null, [num, name, time, place]);
                list.appendChild(row);
                rows.push({ row, name, time, place });
            }
            root.appendChild(heading);
            root.appendChild(list);
            this.names = names;
            this.mine = mine;
        },
        show(on) {
            root.classList.toggle('visible', Boolean(on));
        },
        heat(n, total, label = '') {
            if (heading) heading.textContent = label ? `${heatOf(n, total)} · ${label}` : heatOf(n, total);
        },
        /** Fill the lanes: who is in each, and their time and place once in. */
        lanes(byLane) {
            byLane.forEach((r, lane) => {
                const slot = rows[lane];
                if (!slot) return;
                if (!r) {
                    slot.name.textContent = '';
                    slot.time.textContent = '';
                    slot.place.textContent = '';
                    slot.row.classList.remove('is-mine', 'is-in', 'is-first');
                    return;
                }
                slot.name.textContent = this.names[r.car] || '';
                slot.row.classList.toggle('is-mine', this.mine.has(r.car));
                const done = r.time !== null && r.time !== undefined;
                slot.time.textContent = done ? clock(r.time) : '';
                slot.place.textContent = done && r.place ? placeWord(r.place) : '';
                slot.row.classList.toggle('is-in', done);
                slot.row.classList.toggle('is-first', done && r.place === 1);
            });
        }
    };
}

/**
 * Fill the results card: `table` (a <table>), `lanesEl` (a list) and
 * `whyEl` (a list), from a race and its names. `mine` marks the visitor's
 * rows. `why` is a list of sentences.
 */
export function fillResults({ table, lanesEl, whyEl, whyHeading }, race, names, mine, why, whyTitle) {
    clear(table);
    const head = h('thead', null, null, [h('tr', null, null, [
        h('th', 'col-place', UI.place), h('th', 'col-car', UI.car), h('th', 'col-avg', UI.average)
    ])]);
    const body = h('tbody');
    // Shared places (a dead heat) read "1st (tie)" on each car's row.
    const places = race.places || [];
    if (!race.places) race.standings.forEach((car, i) => { places[car] = i + 1; });
    const count = (p) => race.standings.filter((c) => places[c] === p).length;
    race.standings.forEach((car, i) => {
        const heats = race.heats.map((heat) => clock(heat[car].time)).join('  ');
        const row = h('tr', mine.has(car) ? 'is-mine' : null, null, [
            h('td', 'col-place', count(places[car]) > 1 ? tiedPlace(places[car]) : placeWord(places[car])),
            h('td', 'col-car', null, [
                h('span', 'res-name', names[car]),
                h('span', 'res-heats', `${UI.heats}: ${heats}`)
            ]),
            h('td', 'col-avg', clock(race.average[car]))
        ]);
        body.appendChild(row);
    });
    for (const th of head.children[0].children) th.setAttribute('scope', 'col');
    table.appendChild(head);
    table.appendChild(body);

    clear(lanesEl);
    race.laneAverage.forEach((t, lane) => {
        if (t === null) return;
        lanesEl.appendChild(h('li', null, null, [h('span', 'lane-num', `Lane ${lane + 1}`), h('span', 'lane-time', clock(t))]));
    });

    clear(whyEl);
    for (const line of why) whyEl.appendChild(h('li', null, line));
    if (whyHeading) whyHeading.textContent = whyTitle;
}
