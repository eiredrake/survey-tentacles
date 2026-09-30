const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../../main/resources/static');
function page(markup = '<table><thead><tr><th data-sort-key="name">Name</th><th data-sort-key="number">Number</th><th>Actions</th></tr></thead><tbody></tbody></table>') {
  const dom = new JSDOM(markup, { runScripts: 'outside-only' });
  for (const file of ['icon-button', 'tentacles-table']) dom.window.eval(fs.readFileSync(path.join(root, 'js', file + '.js'), 'utf8'));
  const table = dom.window.document.querySelector('table');
  const add = (name, number = '') => {
    const row = table.tBodies[0].insertRow(); row.insertCell().textContent = name; row.insertCell().textContent = number; row.insertCell(); return row;
  };
  return { dom, w: dom.window, table, add, create: options => dom.window.eval('createTentaclesTable')(table, options) };
}
const columns = { name: { value: row => row.cells[0].textContent }, number: { type: 'number', value: row => row.cells[1].textContent } };
const names = table => [...table.tBodies[0].rows].map(row => row.cells[0].textContent);

test('Text defaults, toggles, indicators and native keyboard-accessible sort buttons share one state', () => {
  const p = page();
  try {
    p.add(' beta '); p.add('Alpha'); p.add('alpha');
    const control = p.create({ columns, defaultSort: { key: 'name', direction: 'descending' } });
    assert.deepEqual(names(p.table), [' beta ', 'Alpha', 'alpha']);
    const header = p.table.tHead.rows[0].cells[0], button = header.querySelector('button');
    assert.equal(button.type, 'button'); assert.equal(button.getAttribute('aria-label'), 'Sort by Name');
    assert.equal(header.getAttribute('aria-sort'), 'descending'); assert.ok(header.classList.contains('sort-descending'));
    button.focus(); assert.equal(p.w.document.activeElement, button);
    const key = new p.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button.dispatchEvent(key); assert.equal(key.defaultPrevented, true);
    assert.deepEqual(names(p.table), ['Alpha', 'alpha', ' beta ']);
    assert.equal(header.getAttribute('aria-sort'), 'ascending');
    button.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    assert.equal(header.getAttribute('aria-sort'), 'descending');
    p.table.tHead.rows[0].cells[1].querySelector('button').click();
    assert.equal(header.hasAttribute('aria-sort'), false);
    assert.equal(control.getSort().key, 'number'); assert.equal(control.getSort().direction, 'ascending');
  } finally { p.w.close(); }
});

test('Numbers use deterministic missing-first ascending and missing-last descending with stable ties', () => {
  const p = page();
  try {
    for (const [name, value] of [['ten', '10'], ['empty', ''], ['two', '2'], ['invalid', 'oops'], ['negative', '-3'], ['missing', null]]) p.add(name, value);
    const control = p.create({ columns, defaultSort: { key: 'number', direction: 'ascending' } });
    assert.deepEqual(names(p.table), ['empty', 'invalid', 'missing', 'negative', 'two', 'ten']);
    p.table.querySelector('[data-sort-key="number"] button').click();
    assert.deepEqual(names(p.table), ['ten', 'two', 'negative', 'empty', 'invalid', 'missing']);
    control.refresh(); assert.deepEqual(names(p.table), ['ten', 'two', 'negative', 'empty', 'invalid', 'missing']);
  } finally { p.w.close(); }
});

test('Live accessors and custom comparators preserve rows, inputs, selections and listeners', () => {
  const p = page();
  try {
    const first = p.add('First'), second = p.add('Second');
    const input = p.w.document.createElement('input'); input.value = 'zz'; first.cells[0].append(input);
    let clicks = 0; first.addEventListener('custom', () => clicks++);
    const checkbox = p.w.document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true; first.cells[2].append(checkbox);
    const select = p.w.document.createElement('select'); select.innerHTML = '<option>A</option><option>B</option>'; select.value = 'B';
    const textarea = p.w.document.createElement('textarea'); textarea.value = 'Unsaved notes'; first.cells[2].append(select, textarea);
    const control = p.create({ columns: { name: { value: row => row.querySelector('input')?.value ?? 'a', compare: (a, b) => a.length - b.length } }, defaultSort: { key: 'name' } });
    assert.equal(p.table.tBodies[0].rows[1], first); assert.equal(first.querySelector('input'), input); assert.equal(input.value, 'zz');
    assert.equal(checkbox.checked, true); first.dispatchEvent(new p.w.Event('custom')); assert.equal(clicks, 1);
    assert.equal(first.querySelector('select'), select); assert.equal(select.value, 'B');
    assert.equal(first.querySelector('textarea'), textarea); assert.equal(textarea.value, 'Unsaved notes');
    input.value = ''; control.refresh(); assert.equal(p.table.tBodies[0].rows[0], first);
    assert.equal(p.table.tBodies[0].rows[1], second);
  } finally { p.w.close(); }
});

test('Multiple companion rows move with their primary row, retaining identities and hidden state', () => {
  const p = page();
  try {
    const a = p.add('Zulu'), da = p.add('A details'), extra = p.add('More A'), b = p.add('Alpha'), db = p.add('B details');
    da.hidden = true; a.details = [da, extra]; b.details = [db];
    p.create({ rows: () => [a, b], companions: row => row.details, columns, defaultSort: { key: 'name' } });
    assert.deepEqual([...p.table.tBodies[0].rows], [b, db, a, da, extra]); assert.equal(da.hidden, true);
  } finally { p.w.close(); }
});

test('All five opt-in standard actions reuse icon buttons and pass row or toolbar context', () => {
  const p = page();
  try {
    const row = p.add('Item'), calls = [];
    const action = name => ({ action: name, onActivate: context => calls.push([name, context.row, context.table]) });
    p.create({ toolbarActions: [action('add')], rowActions: ['edit', 'delete', 'view', 'share'].map(action), actionCell: row => row.cells[2] });
    const buttons = [...p.w.document.querySelectorAll('.icon-button')];
    assert.deepEqual(buttons.map(button => button.title), ['Add', 'Edit', 'Delete', 'View', 'Share']);
    assert.deepEqual(buttons.map(button => button.querySelector('i').className), ['fa-solid fa-plus', 'fa-solid fa-pen-to-square', 'fa-solid fa-trash', 'fa-solid fa-eye', 'fa-solid fa-share-nodes']);
    buttons.forEach(button => { assert.equal(button.getAttribute('aria-label'), button.title); button.click(); });
    assert.equal(calls[0][1], null); assert.ok(calls.every(call => call[2] === p.table)); assert.ok(calls.slice(1).every(call => call[1] === row));
  } finally { p.w.close(); }
});

test('Custom toolbar and row actions refresh conditional state without duplicating controls or activating rows', () => {
  const p = page();
  try {
    const row = p.add('Item'); let enabled = false, visible = false, actions = 0, activations = 0;
    const control = p.create({ onRowActivate: () => activations++, toolbarActions: [{ icon: 'check', title: 'Select all', ariaLabel: 'Select every item', onActivate: () => actions++ }],
      rowActions: [{ icon: 'chart-simple', title: 'Analytics', ariaLabel: ({ row }) => 'Analytics for ' + row.cells[0].textContent,
        enabled: () => enabled, visible: () => visible, onActivate: () => actions++ }], actionCell: row => row.cells[2] });
    const button = row.querySelector('button'); assert.equal(button.disabled, true); assert.equal(button.hidden, true);
    button.click(); assert.equal(actions, 0);
    enabled = visible = true; control.refresh(); control.refresh();
    assert.equal(row.querySelectorAll('button').length, 1); assert.equal(button.disabled, false); assert.equal(button.hidden, false);
    assert.equal(button.getAttribute('aria-label'), 'Analytics for Item'); assert.ok(button.querySelector('.fa-chart-simple'));
    button.click(); p.w.document.querySelector('.table-toolbar button').click(); assert.equal(actions, 2); assert.equal(activations, 0);
  } finally { p.w.close(); }
});

test('Opt-in row and cell activation supports keyboard and ignores interactive descendants and nested tables', () => {
  const p = page();
  try {
    const row = p.add('Item'); let rows = 0, cells = 0;
    p.create({ columns: { name: { cell: row => row.cells[0], onActivate: ({ row: current, cell }) => { assert.equal(current, row); assert.equal(cell, row.cells[0]); cells++; } } }, onRowActivate: () => rows++ });
    row.click(); row.cells[0].click();
    row.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    row.cells[0].dispatchEvent(new p.w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    assert.equal(rows, 2); assert.equal(cells, 2);
    for (const tag of ['button', 'a', 'input', 'select', 'textarea', 'summary']) {
      const child = p.w.document.createElement(tag); row.cells[0].append(child); child.click();
      child.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    const nested = p.w.document.createElement('table'); nested.innerHTML = '<tbody><tr><td>Nested</td></tr></tbody>'; row.cells[1].append(nested); nested.querySelector('td').click();
    assert.equal(rows, 2); assert.equal(cells, 2);
    assert.equal(row.tabIndex, 0); assert.equal(row.cells[0].tabIndex, 0);
  } finally { p.w.close(); }
});

test('Unconfigured tables have no actions or artificial focus targets', () => {
  const p = page();
  try { const row = p.add('Item'); p.create(); assert.equal(row.hasAttribute('tabindex'), false); assert.equal(p.table.querySelector('button'), null); assert.equal(p.w.document.querySelector('.table-toolbar'), null); }
  finally { p.w.close(); }
});

test('Empty message spans visible columns and follows explicit row changes', () => {
  const p = page();
  try {
    p.table.tHead.rows[0].cells[2].hidden = true;
    const control = p.create({ emptyMessage: '<No items>' });
    assert.equal(p.table.tBodies[0].textContent, '<No items>'); assert.equal(p.table.tBodies[0].rows[0].cells[0].colSpan, 2);
    const row = p.add('Present'); control.refresh(); assert.deepEqual(names(p.table), ['Present']);
    row.remove(); control.refresh(); assert.equal(p.table.tBodies[0].textContent, '<No items>');
    control.destroy(); p.create(); assert.equal(p.table.tBodies[0].textContent, 'No items to display.');
  } finally { p.w.close(); }
});

test('Independent instances, refresh, reinitialization and destroy retain isolated state and remove owned behavior', () => {
  const p = page();
  try {
    p.add('Zulu'); p.add('Alpha'); const other = p.table.cloneNode(true); p.w.document.body.append(other);
    const first = p.create({ columns, defaultSort: { key: 'name' } });
    const second = p.w.eval('createTentaclesTable')(other, { columns, defaultSort: { key: 'name', direction: 'descending' } });
    p.table.querySelector('button').click(); assert.equal(first.getSort().direction, 'descending'); assert.equal(second.getSort().direction, 'descending');
    p.table.querySelector('button').click(); assert.equal(second.getSort().direction, 'descending');
    p.add('Bravo'); first.refresh({ reapplySort: false }); assert.deepEqual(names(p.table), ['Alpha', 'Zulu', 'Bravo']);
    first.refresh(); assert.deepEqual(names(p.table), ['Alpha', 'Bravo', 'Zulu']);
    const replacement = p.create({ columns, defaultSort: { key: 'name' } }); p.table.querySelector('button').click();
    assert.equal(replacement.getSort().direction, 'descending'); assert.equal(p.table.querySelectorAll('.table-sort-button').length, 2);
    replacement.destroy(); assert.equal(p.table.querySelector('button'), null); assert.equal(p.table.querySelector('[aria-sort]'), null);
    const before = names(p.table); p.table.tHead.rows[0].cells[0].click(); replacement.refresh(); assert.deepEqual(names(p.table), before);
  } finally { p.w.close(); }
});

test('Refresh handles new rows and action definitions; teardown restores existing controls and attributes', () => {
  const p = page();
  try {
    const header = p.table.tHead.rows[0].cells[0], existing = p.w.document.createElement('button');
    existing.textContent = 'Existing action'; header.append(existing);
    const row = p.add('Item'); row.tabIndex = 3;
    const actions = [{ action: 'view' }];
    const control = p.create({ columns, rowActions: actions, actionCell: row => row.cells[2], onRowActivate: () => {} });
    assert.equal(header.querySelectorAll('button').length, 2); assert.equal(row.tabIndex, 0);
    actions.push({ action: 'share' }); const second = p.add('New'); control.refresh();
    assert.deepEqual([...row.querySelectorAll('button')].map(button => button.title), ['View', 'Share']);
    assert.equal(second.querySelectorAll('button').length, 2);
    actions.length = 0; control.refresh(); assert.equal(row.querySelector('button'), null); assert.equal(second.querySelector('button'), null);
    control.destroy(); assert.equal(row.tabIndex, 3); assert.equal(second.hasAttribute('tabindex'), false);
    assert.equal(header.querySelector('button'), existing); assert.equal(row.querySelector('button'), null);
  } finally { p.w.close(); }
});
