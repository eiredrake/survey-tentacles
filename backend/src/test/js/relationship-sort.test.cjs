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
