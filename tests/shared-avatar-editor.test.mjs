// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared avatar editor (www/shared/js/avatar-editor-1.0.0.js), promoted
 * from /avatar/ on 2026-10-28 for Meme Studio's Customize. The editor's own
 * behavior (radio groups, any color, the jersey's number, the tab row's
 * keys) is held by tests/avatar-init, which builds it with the avatar page's
 * tabs. What is held here is what a second page needs of it: the tabs are
 * the shared ones and cover every field of the avatar once, a page may
 * leave out the fields it sets itself, and a second editor's ids and group
 * names are its own.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

let E;
let FIELDS;
let dom;

beforeAll(async () => {
    installThree();
    dom = installDom();
    jest.resetModules();
    E = await import('../www/shared/js/avatar-editor-1.0.0.js');
    ({ FIELDS } = await import('../www/shared/js/avatar-1.0.0.js'));
});
afterAll(() => {
    dom.uninstall();
    delete globalThis.THREE;
});

/** An editor built into fresh containers. */
function build(options = {}) {
    const tablist = document.createElement('div');
    const panels = document.createElement('div');
    const ed = E.createEditor({ tablist, panels, tabs: E.EDITOR_TABS, avatar: { skin: 'fair', glasses: 'round' }, ...options });
    return { ed, tablist, panels };
}

test('the shared tabs are the six, every field of the avatar on one of them once, and frozen', () => {
    expect(E.EDITOR_TABS.map((t) => t.id)).toEqual(['face', 'eyes', 'hair', 'build', 'clothes', 'layers']);
    const all = E.EDITOR_TABS.flatMap((t) => t.fields.map((f) => f.key));
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(FIELDS.map(([key]) => key).sort());
    expect(Object.isFrozen(E.EDITOR_TABS)).toBe(true);
    expect(Object.isFrozen(E.EDITOR_TABS[0].fields[0])).toBe(true);
});

test('the avatar page shows exactly the shared tabs', async () => {
    const { AVATAR_PAGE } = await import('../www/avatar/js/config.js');
    expect(AVATAR_PAGE.tabs).toEqual(E.EDITOR_TABS);
});

test('a field left out is never offered, a field that needs it goes with it, and a tab left empty goes too', () => {
    const hair = E.EDITOR_TABS.find((t) => t.id === 'hair');
    expect(E.visibleFields(hair).map((f) => f.key)).toEqual(['length', 'hair', 'hat', 'hatColor']);
    // The hat's color needs the hat: leaving out the hat takes both.
    expect(E.visibleFields(hair, ['hat']).map((f) => f.key)).toEqual(['length', 'hair']);
    const layers = ['legwear', 'legwearColor', 'armwear', 'armwearColor'];
    expect(E.visibleTabs(E.EDITOR_TABS, layers).map((t) => t.id)).toEqual(['face', 'eyes', 'hair', 'build', 'clothes']);
    expect(E.visibleTabs(E.EDITOR_TABS).map((t) => t.id)).toHaveLength(6);
    // Built: no group, no input and no tab for what was left out.
    const { ed, tablist } = build({ omit: ['shirt', 'handedness', ...layers] });
    expect(tablist.children.map((b) => b.textContent)).toEqual(['Face', 'Eyes', 'Hair', 'Build', 'Clothes']);
    expect(ed.inputs.shirt).toBeUndefined();
    expect(ed.customs.shirt).toBeUndefined();
    expect(ed.inputs.handedness).toBeUndefined();
    expect(ed.inputs.legwear).toBeUndefined();
    expect(ed.inputs.sleeves.length).toBeGreaterThan(1);
    expect(ed.tabs.map((t) => t.id)).not.toContain('layers');
});

test('a second editor on the page has ids and radio groups of its own, and the first keeps the avatar page\'s', () => {
    const first = build();
    const second = build({ prefix: 'mm-cz' });
    expect(first.tablist.children[0].id).toBe('av-tab-face');
    expect(first.tablist.children[0].getAttribute('aria-controls')).toBe('av-panel-face');
    expect(first.panels.children[0].id).toBe('av-panel-face');
    expect(first.ed.inputs.skin[0].name).toBe('av-skin');
    expect(second.tablist.children[0].id).toBe('mm-cz-tab-face');
    expect(second.tablist.children[0].getAttribute('aria-controls')).toBe('mm-cz-panel-face');
    expect(second.panels.children[0].id).toBe('mm-cz-panel-face');
    expect(second.panels.children[0].getAttribute('aria-labelledby')).toBe('mm-cz-tab-face');
    expect(second.ed.inputs.skin[0].name).toBe('mm-cz-skin');
    // Each still says what changed, on its own.
    const heard = [];
    const third = build({ prefix: 'mm-cz', onChange: (k, id) => heard.push([k, id]) });
    const deep = third.ed.inputs.skin.find((i) => i.value === 'deep');
    deep.checked = true;
    fire(deep, 'change');
    expect(heard).toEqual([['skin', 'deep']]);
});

test('an editor with no one listening still takes a choice and a tab', () => {
    const { ed, tablist } = build();
    const deep = ed.inputs.skin.find((i) => i.value === 'deep');
    deep.checked = true;
    expect(() => fire(deep, 'change')).not.toThrow();
    tablist.children[2].click();
    expect(ed.selected).toBe('hair');
});

test('a typed name field shows by its rule alone, with no list to count, and leaves out like any other (2026-10-28)', () => {
    const clothes = E.EDITOR_TABS.find((t) => t.id === 'clothes');
    expect(E.optionsFor('jerseyName')).toHaveLength(1);
    expect(E.visibleFields(clothes).map((f) => f.key)).toContain('jerseyName');
    expect(E.visibleFields(clothes, ['jerseyName']).map((f) => f.key)).not.toContain('jerseyName');
    // A second editor's box is its own.
    const { ed } = build({ prefix: 'mm-cz', avatar: { sleeves: 'jersey', jerseyName: 'NOLL' } });
    expect(ed.names.jerseyName.value).toBe('NOLL');
    expect(build({ omit: ['jerseyName'] }).ed.names.jerseyName).toBeUndefined();
});
