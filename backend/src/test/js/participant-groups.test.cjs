const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dir = path.resolve(__dirname, '../../main/resources/static');
const tick = () => new Promise(resolve => setImmediate(resolve));

function page(name) {
  const dom = new JSDOM(readFileSync(path.join(dir, name + '.html'), 'utf8'), { url: 'http://localhost/?id=1', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, calls = [], messages = [];
  const state = { admin: true, fail: false, groups: [{ id: 5, name: '<Movie Night>', userIds: [1, 2] }], participants: [{ userId: 1, username: 'Alice', name: 'Alice', required: true, completed: true }] };
  w.confirm = () => true;
  w.showToast = (text, type) => messages.push({ text, type });
  w.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    let value = {};
    const mutation = options.method && options.method !== 'GET';
    if (mutation && state.fail) return { ok: false, status: 409 };
    if (url === '/me') value = { name: 'Admin', authorities: state.admin ? ['ROLE_ADMIN'] : [] };
    else if (url === '/csrf') value = { headerName: 'X-CSRF', token: 'test-token' };
    else if (url === '/api/users') value = [{ id: 1, username: 'Alice' }, { id: 2, username: 'Bob' }, { id: 3, username: 'Charlie' }];
    else if (url.startsWith('/api/participant-groups')) {
      if (options.method === 'POST') state.groups.push({ id: 6, ...JSON.parse(options.body) });
      if (options.method === 'PUT') state.groups = state.groups.map(g => g.id === 5 ? { id: 5, ...JSON.parse(options.body) } : g);
      if (options.method === 'DELETE') state.groups = state.groups.filter(g => g.id !== Number(url.split('/').at(-1)));
      value = state.groups;
    } else if (url === '/api/surveys/1/assignments') value = state.participants;
    else if (url.endsWith('/assignments/batch')) {
      const body = JSON.parse(options.body), ids = new Set(body.userIds);
      for (const id of body.groupIds) state.groups.find(g => g.id === id).userIds.forEach(id => ids.add(id));
      for (const id of ids) if (!state.participants.some(p => p.userId === id)) state.participants.push({ userId: id, username: 'User ' + id, required: false });
    } else throw new Error('Unexpected URL ' + url);
    return { ok: true, json: async () => value };
  };
  const scripts = name === 'survey-edit' ? ['participant-picker', 'survey-edit'] : ['participant-groups'];
  for (const script of scripts) require('node:vm').runInContext(readFileSync(path.join(dir, 'js', script + '.js'), 'utf8').replace(/^initialize\(\);\s*$/m, ''), dom.getInternalVMContext());
  return { dom, w, d, calls, state, messages };
}

test('Admin creates, renames, changes membership and deletes a reusable group with CSRF', async () => {
  const p = page('participant-groups');
  try {
    await p.w.initialize();
    assert.equal(p.d.getElementById('group-management').hidden, false);
    assert.equal(p.d.querySelector('movie'), null);
    p.d.getElementById('new-group').click();
    p.d.getElementById('group-name').value = 'Games';
    p.d.querySelector('#group-members input[value="3"]').checked = true;
    p.d.getElementById('group-editor').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
    await tick();
    const post = p.calls.find(c => c.options.method === 'POST');
    assert.deepEqual(JSON.parse(post.options.body), { name: 'Games', userIds: [3] });
    assert.equal(post.options.headers['X-CSRF'], 'test-token');
    p.d.querySelector('button[title="Edit group"]').click();
    assert.equal(p.d.querySelector('#group-members input[value="1"]').checked, true);
    p.d.getElementById('group-name').value = 'Cinema';
    p.d.querySelector('#group-members input[value="1"]').checked = false;
    p.d.getElementById('group-editor').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
    await tick();
    assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === 'PUT').options.body), { name: 'Cinema', userIds: [2] });
    p.d.querySelector('button[title="Delete group"]').click();
    await tick();
    assert.equal(p.calls.find(c => c.options.method === 'DELETE').url, '/api/participant-groups/5');
    assert.equal(p.state.groups.length, 1);
  } finally { p.dom.window.close(); }
});

test('Failed group saves preserve edits and prevent accidental navigation away from dirty forms', async () => {
  const p = page('participant-groups');
  try {
    await p.w.initialize(); p.d.querySelector('button[title="Edit group"]').click();
    const name = p.d.getElementById('group-name'); name.value = 'Unsaved';
    name.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    p.w.confirm = () => false; p.d.getElementById('new-group').click();
    assert.equal(name.value, 'Unsaved');
    p.state.fail = true;
    p.d.getElementById('group-editor').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
    await tick();
    assert.equal(name.value, 'Unsaved');
    assert.equal(p.d.getElementById('group-editor').hidden, false);
    assert.equal(p.d.getElementById('group-fields').disabled, false);
    assert.match(p.messages.at(-1).text, /already exists/);
  } finally { p.dom.window.close(); }
});

test('Non-admins never receive the group editor or group list', async () => {
  const p = page('participant-groups');
  try {
    p.state.admin = false; await p.w.initialize();
    assert.equal(p.d.getElementById('group-management').hidden, true);
    assert.equal(p.calls.some(c => c.url === '/api/participant-groups'), false);
  } finally { p.dom.window.close(); }
});

test('Survey picker accepts overlapping groups and individuals and preserves the unsaved question', async () => {
  const p = page('survey-edit');
  try {
    p.state.groups.push({ id: 6, name: 'Friends', userIds: [2, 3] });
    p.w.showQuestionEditor('relationship-question-template');
    const prompt = p.d.getElementById('relationship-editor-prompt'); prompt.value = 'Unsaved prompt';
    prompt.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    await p.w.loadParticipants();
    p.d.querySelector('button[title="Add participant"]').click(); await tick();
    assert.equal(p.d.querySelector('input[data-kind="user"][value="1"]'), null);
    for (const input of p.d.querySelectorAll('input[data-kind="group"], input[data-kind="user"][value="2"]')) input.checked = true;
    p.d.querySelector('button[title="Save participant selection"]').click(); await tick();
    const request = p.calls.find(c => c.url.endsWith('/assignments/batch'));
    assert.deepEqual(JSON.parse(request.options.body), { userIds: [2], groupIds: [5, 6], required: false });
    assert.equal(request.options.headers['X-CSRF'], 'test-token');
    assert.equal(p.d.querySelectorAll('#participants-view tbody tr').length, 3);
    assert.equal(prompt.value, 'Unsaved prompt');
    assert.equal(p.w.hasUnsavedChanges(), true);
    assert.equal(p.d.querySelector('#participants-view tbody input[type="checkbox"]').checked, true);
    assert.equal(p.calls.some(c => c.options.method === 'POST' && c.url.includes('/questions')), false);
  } finally { p.dom.window.close(); }
});

test('Failed group assignment retains checked selections and permits retry', async () => {
  const p = page('survey-edit');
  try {
    await p.w.loadParticipants(); p.d.querySelector('button[title="Add participant"]').click(); await tick();
    const choice = p.d.querySelector('input[data-kind="group"]'); choice.checked = true;
    p.state.fail = true; p.d.querySelector('button[title="Save participant selection"]').click(); await tick();
    assert.equal(choice.checked, true); assert.equal(choice.closest('fieldset').disabled, false);
    assert.equal(p.state.participants.length, 1);
    p.state.fail = false; p.d.querySelector('button[title="Save participant selection"]').click(); await tick();
    assert.equal(p.state.participants.length, 2);
  } finally { p.dom.window.close(); }
});

test('Survey labels clarify expected users and group page includes notifications and version footer', () => {
  for (const page of ['survey-edit', 'survey-view']) assert.match(readFileSync(path.join(dir, page + '.html'), 'utf8'), /<h2>Expected Participants<\/h2>/);
  const html = readFileSync(path.join(dir, 'participant-groups.html'), 'utf8');
  assert.match(html, /survey-events.js/); assert.match(html, /app-footer.js/);
});
