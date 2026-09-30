const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const staticDir = path.resolve(__dirname, '../../main/resources/static');

function editor() {
  const dom = new JSDOM(readFileSync(path.join(staticDir, 'survey-edit.html'), 'utf8'),
    { url: 'http://localhost/survey-edit.html?id=1', runScripts: 'outside-only' });
  dom.window.showToast = () => {};
  dom.window.fetch = () => { throw new Error('Sorting must not send requests.'); };
  dom.window.eval(readFileSync(path.join(staticDir, 'js/SmartInput.js'), 'utf8'));
  dom.window.eval(readFileSync(path.join(staticDir, 'js/tentacles-table.js'), 'utf8'));
  dom.window.eval(readFileSync(path.join(staticDir, 'js/survey-edit.js'), 'utf8').replace(/^initialize\(\);\s*$/m, ''));
  dom.window.eval('showQuestionEditor("relationship-question-template")');
  return dom;
}

function add(dom, name, description) {
  const doc = dom.window.document;
  doc.getElementById('show-relationship-subject-editor-button').click();
  doc.getElementById('relationship-editor-name').value = name;
  doc.getElementById('relationship-editor-description').value = description;
  doc.getElementById('add-relationship-subject-button').click();
}

for (const key of ['character', 'description']) {
  for (const ascending of [true, false]) {
    test(`Added characters respect ${key} ${ascending ? 'ascending' : 'descending'} without losing edits`, () => {
      const dom = editor(), doc = dom.window.document;
      try {
        dom.window.eval('populateRelationshipSubjects([{id: 10, name: "Charlie", description: "Alpha"}, {id: 11, name: "Alpha", description: "Zulu"}])');
        const originalRows = [...doc.querySelectorAll('.relationship-subject')];
        const header = doc.querySelector(`[data-sort-key="${key}"]`);
        if (key === 'description') header.click();
        if (!ascending) header.click();
        const prompt = doc.getElementById('relationship-editor-prompt');
        prompt.value = 'Unsaved question text';
        prompt.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        doc.querySelector('.question-required').checked = true;
        add(dom, 'Bravo', 'Mike');
        let rows = [...doc.querySelectorAll('.relationship-subject')];
        const expected = key === 'character' ? ['Alpha', 'Bravo', 'Charlie'] : ['Charlie', 'Bravo', 'Alpha'];
        assert.deepEqual(rows.map(row => row.dataset.name), ascending ? expected : expected.reverse());
        assert.ok(header.classList.contains(ascending ? 'sort-ascending' : 'sort-descending'));
        assert.equal(doc.querySelectorAll('.sort-ascending, .sort-descending').length, 1);
        for (const row of originalRows) {
          assert.ok(rows.includes(row));
          assert.ok(['10', '11'].includes(row.dataset.subjectId));
        }
        assert.equal(prompt.value, 'Unsaved question text');
        assert.equal(doc.querySelector('.question-required').checked, true);
        assert.equal(dom.window.eval('hasUnsavedChanges()'), true);
        assert.equal(doc.getElementById('relationship-subject-editor').hidden, true);
        originalRows[0].querySelector('button').click();
        assert.equal(originalRows[0].isConnected, false);
        // Repeated additions must keep the same sort direction.
        add(dom, 'Delta', 'November');
        rows = [...doc.querySelectorAll('.relationship-subject')];
        const values = rows.map(row => row.dataset[key === 'character' ? 'name' : 'description']);
        assert.deepEqual(values, [...values].sort((a, b) => (ascending ? 1 : -1) * a.localeCompare(b, undefined, { sensitivity: 'base' })));
      } finally { dom.window.close(); }
    });
  }
}

test('New Relationship questions start sorted and rejected blank characters leave rows intact', () => {
  const dom = editor(), doc = dom.window.document;
  try {
    add(dom, 'Zulu', 'Last');
    add(dom, 'Alpha', 'First');
    add(dom, '  ', 'Invalid');
    assert.deepEqual([...doc.querySelectorAll('.relationship-subject')].map(row => row.dataset.name), ['Alpha', 'Zulu']);
    assert.ok(doc.querySelector('[data-sort-key="character"]').classList.contains('sort-ascending'));
    assert.equal(doc.getElementById('relationship-editor-description').value, 'Invalid');
    assert.equal(dom.window.eval('hasUnsavedChanges()'), true);
  } finally { dom.window.close(); }
});

test('Edit sorts live inline drafts without replacing inputs, portraits or character handlers', () => {
  const dom = editor(), doc = dom.window.document;
  try {
    dom.window.eval('populateRelationshipSubjects([{id:10,name:"Alpha",description:"First"},{id:11,name:"Bravo",description:"Last"}])');
    const row = doc.querySelector('.relationship-subject');
    row.pendingPortrait = { name: 'draft.gif' };
    row.querySelector('.character-edit-button').click();
    const name = row.querySelector('[aria-label="Character name"]');
    const description = row.querySelector('[aria-label="Character description"]');
    name.value = 'Zulu'; description.value = 'Unsaved description';
    const header = doc.querySelector('[data-sort-key="character"] button');
    name.dispatchEvent(new dom.window.FocusEvent('blur', { relatedTarget: header }));
    header.click(); header.click();
    assert.equal(doc.querySelectorAll('.relationship-subject')[1], row);
    assert.equal(row.querySelector('[aria-label="Character name"]'), name);
    assert.equal(name.value, 'Zulu'); assert.equal(description.value, 'Unsaved description');
    assert.equal(row.dataset.name, 'Alpha'); assert.equal(row.pendingPortrait.name, 'draft.gif');
    row.querySelector('[title="Save character edits"]').click();
    assert.equal(row.dataset.name, 'Zulu'); assert.equal(row.dataset.description, 'Unsaved description');
    assert.equal(doc.querySelectorAll('.relationship-subject')[1], row);
    row.querySelector('[title="Remove character"]').click();
    doc.querySelector('.relationship-subject [title="Remove character"]').click();
    assert.equal(doc.querySelector('#relationship-editor-subject-list .table-empty-state').textContent, 'No characters have been added.');
  } finally { dom.window.close(); }
});

function relationshipPage(mode, subjects, answers) {
  const dom = new JSDOM(readFileSync(path.join(staticDir, mode + '.html'), 'utf8'), { url: 'http://localhost/?id=1', runScripts: 'outside-only' });
  const evaluate = code => require('node:vm').runInContext(code, dom.getInternalVMContext());
  const calls = [];
  dom.window.showToast = () => {};
  dom.window.fetch = async (url, options = {}) => { calls.push({ url, options }); return { ok: true, json: async () => url.endsWith('/2') ? { subjects } : answers }; };
  for (const file of ['tentacles-table', mode]) evaluate(readFileSync(path.join(staticDir, 'js', file + '.js'), 'utf8').replace(/^initialize\(\);\s*$/m, ''));
  const document = dom.window.document;
  document.body.append(document.getElementById(mode === 'survey' ? 'relationship-participant-template' : 'relationship-view-template').content.cloneNode(true));
  return { dom, document, evaluate, calls };
}

test('Vote reads live scores/comments, moves original controls, and saves answers under their original subjects', async () => {
  const p = relationshipPage('survey', [{ id: 1, name: 'Zulu' }, { id: 2, name: 'Alpha' }], []);
  try {
    p.evaluate('currentUser = { id: 7 }; surveyAcceptingResponses = true;');
    await p.evaluate('loadRelationshipQuestion({id:2}, document.querySelector(".survey-question"), document.querySelector(".relationship-subjects"))');
    const body = p.document.querySelector('.relationship-subjects');
    const [alpha, zulu] = [...body.rows];
    assert.equal(alpha.cells[0].textContent, 'Alpha');
    const like = alpha.querySelector('.relationship-like'), trust = alpha.querySelector('.relationship-trust'), comment = alpha.querySelector('textarea');
    like.value = '4'; trust.value = '-2'; comment.value = 'Zulu comment'; zulu.querySelector('textarea').value = 'Alpha comment';
    const sort = key => p.document.querySelector('[data-sort-key="' + key + '"] button').click();
    sort('like'); assert.equal(body.rows[1], alpha); sort('like'); assert.equal(body.rows[0], alpha);
    sort('trust'); assert.equal(body.rows[0], alpha);
    sort('comments'); assert.equal(body.rows[1], alpha);
    assert.equal(alpha.querySelector('textarea'), comment); assert.equal(comment.value, 'Zulu comment');
    assert.equal(alpha.querySelector('.relationship-like'), like); assert.equal(like.value, '4');
    like.querySelector('button:last-child').click(); assert.equal(like.value, '5');
    await p.evaluate('questionHandlers[0].save({headerName:"Test-Csrf",token:"test"})');
    const saved = JSON.parse(p.calls.find(call => call.options.method === 'POST').options.body).responses;
    assert.deepEqual(saved.find(answer => answer.subjectId === 2), { subjectId: 2, likeScore: 5, trustScore: -2, comment: 'Zulu comment' });
  } finally { p.dom.window.close(); }
});

test('Aggregate View sorts raw averages/responses while preserving open and hidden comment companions', async () => {
  const p = relationshipPage('survey-view', [{ id: 1, name: 'Zulu' }, { id: 2, name: 'Alpha' }, { id: 3, name: 'Missing' }], [
    { subjectId: 1, likeScore: -2, trustScore: 1, comment: 'Z comment', name: 'One' },
    { subjectId: 2, likeScore: 4, trustScore: 3, comment: 'A comment', name: 'Two' },
    { subjectId: 2, likeScore: 2, trustScore: 1, comment: '', name: 'Three' }
  ]);
  try {
    await p.evaluate('renderRelationshipResults({id:2}, document.querySelector(".relationship-view-results"))');
    const body = p.document.querySelector('.relationship-view-results');
    const alpha = body.querySelector('[data-character="Alpha"]'), zulu = body.querySelector('[data-character="Zulu"]');
    const ad = alpha.nextElementSibling, zd = zulu.nextElementSibling;
    alpha.click(); assert.equal(ad.hidden, false); assert.equal(zd.hidden, true);
    const order = () => [...body.querySelectorAll(':scope > tr[data-character]')].map(row => row.dataset.character);
    const sort = key => p.document.querySelector('[data-sort-key="' + key + '"] button').click();
    sort('like'); assert.deepEqual(order(), ['Missing', 'Zulu', 'Alpha']);
    sort('like'); assert.deepEqual(order(), ['Alpha', 'Zulu', 'Missing']);
    sort('trust'); assert.deepEqual(order(), ['Missing', 'Zulu', 'Alpha']);
    sort('responses'); assert.deepEqual(order(), ['Missing', 'Zulu', 'Alpha']);
    sort('responses'); assert.deepEqual(order(), ['Alpha', 'Zulu', 'Missing']);
    assert.equal(alpha.nextElementSibling, ad); assert.equal(zulu.nextElementSibling, zd);
    assert.equal(ad.hidden, false); assert.equal(zd.hidden, true); assert.match(ad.textContent, /A comment/);
    assert.equal(alpha.cells[1].textContent, '+3.0');
    alpha.click(); assert.equal(ad.hidden, true);
  } finally { p.dom.window.close(); }
});

test('An empty Relationship Vote keeps its empty-state row out of the answer payload', async () => {
  const p = relationshipPage('survey', [], []);
  try {
    p.evaluate('currentUser = { id: 7 }; surveyAcceptingResponses = true;');
    await p.evaluate('loadRelationshipQuestion({id:2}, document.querySelector(".survey-question"), document.querySelector(".relationship-subjects"))');
    assert.ok(p.document.querySelector('.table-empty-state'));
    assert.equal(p.evaluate('questionHandlers[0].validate()'), true);
    await p.evaluate('questionHandlers[0].save({headerName:"Test-Csrf",token:"test"})');
    assert.deepEqual(JSON.parse(p.calls.find(call => call.options.method === 'POST').options.body).responses, []);
  } finally { p.dom.window.close(); }
});
