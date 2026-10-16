// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * held.js - What a visit under way holds (QA, 2026-10-16).
 *
 * ADD, NEVER TAKE AWAY. Once the cleaner has begun, the customer may add
 * tasks and rooms, star, and change notes and care preferences, but may not
 * remove a task or a room the cleaner already has, or change what such a
 * task is (its options, size or quantity) or what such a room is (its
 * floor, its type of bath): the cleaner may have done it already, and the
 * change would reprice finished work. Anything added that the cleaner has no
 * time for is skipped, and skipped work is never charged.
 *
 * THE CLEANER'S COPY DECIDES. "Already has" means: in the checklist as last
 * sent (the published form, as sync.js readPublished opens it). A task added
 * here and not sent yet is the customer's own to take back.
 *
 * Pure: the studio asks before a change, and again before a send. The API
 * cannot ask (the checklist is sealed), so the cleaner's page also keeps any
 * task it has marked (tasks/js/main.js).
 */

/** What makes a task the task it is, for a visit under way. */
const taskPrint = (i) => JSON.stringify([i.roomId, i.task, [...(i.options || [])].sort(), i.size || null, i.quantity ?? null]);

/** What makes a room the room it is. */
const roomPrint = (r) => JSON.stringify([r.level, r.area, r.bath || null]);

const live = (list) => (list || []).filter((x) => x && !x.deletedAt);

/**
 * The tasks and rooms a sent form holds: `{ items, rooms }`, each a Map
 * from id to its print. An empty hold for no form.
 */
export function holdOf(sent) {
    return {
        items: new Map(live(sent && sent.items).map((i) => [i.id, taskPrint(i)])),
        rooms: new Map(live(sent && sent.rooms).map((r) => [r.id, roomPrint(r)]))
    };
}

/** Whether the cleaner already has this task (`kind` 'item') or room. */
export function isHeld(hold, kind, id) {
    return Boolean(hold && id && (kind === 'room' ? hold.rooms : hold.items).has(id));
}

/** Whether changing a held task to `fields` (as readTaskForm gives them)
 *  would change what it is. Notes, avoid, products, photos and the star
 *  may change. */
export function changesHeldTask(hold, item, fields) {
    if (!isHeld(hold, 'item', item && item.id)) return false;
    return taskPrint({ ...item, ...fields, roomId: item.roomId }) !== hold.items.get(item.id);
}

/** Whether changing a held room to `fields` ({ level, bath }) would change
 *  what it is. Its name may change. */
export function changesHeldRoom(hold, room, fields) {
    if (!isHeld(hold, 'room', room && room.id)) return false;
    return roomPrint({ ...room, ...fields }) !== hold.rooms.get(room.id);
}

/**
 * Everything in `checklist` (the customer's, as it would be sent) that
 * takes away or changes what the sent form holds: `[{ kind, id, change }]`,
 * `change` 'removed' or 'changed'. Empty when the send only adds.
 */
export function heldChanges(sent, checklist) {
    const hold = holdOf(sent);
    const items = new Map(live(checklist && checklist.items).map((i) => [i.id, i]));
    const rooms = new Map(live(checklist && checklist.rooms).map((r) => [r.id, r]));
    const out = [];
    for (const [id, print] of hold.rooms) {
        const r = rooms.get(id);
        if (!r) out.push({ kind: 'room', id, change: 'removed' });
        else if (roomPrint(r) !== print) out.push({ kind: 'room', id, change: 'changed' });
    }
    for (const [id, print] of hold.items) {
        const i = items.get(id);
        if (!i) out.push({ kind: 'item', id, change: 'removed' });
        else if (taskPrint(i) !== print) out.push({ kind: 'item', id, change: 'changed' });
    }
    return out;
}
