const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dir = path.resolve(__dirname, '../../main/resources/static');
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const page of ['index', 'survey', 'survey-edit', 'survey-view', 'survey-participant-view', 'admin/index', 'admin/participant-groups']) {
  for (const role of ['admin', 'reader', 'failed']) {
    test(`${page}: administration navigation for ${role}`, async () => {
      const html = readFileSync(path.join(dir, page + '.html'), 'utf8');
      assert.match(html, /src="\/js\/administration-nav.js"/);
      const dom = new JSDOM(html, { url: 'http://localhost/' + page + '.html', runScripts: 'outside-only' });
      try {
        dom.window.fetch = async () => ({ ok: role !== 'failed', json: async () => ({ name: 'Test User', authorities: role === 'admin' ? ['ROLE_ADMIN'] : ['ROLE_USER'] }) });
        dom.window.eval(readFileSync(path.join(dir, 'js/administration-nav.js'), 'utf8'));
        await tick();
        const links = dom.window.document.querySelectorAll('.administration-link');
        assert.equal(links.length, role === 'admin' ? 1 : 0);
        if (role === 'admin') {
          const link = links[0];
          assert.equal(link.getAttribute('href'), '/admin/index.html');
          assert.equal(link.getAttribute('aria-label'), 'Administration');
          assert.ok(link.querySelector('.fa-gear[aria-hidden="true"]'));
          assert.equal(link.hasAttribute('aria-current'), page.startsWith('admin/'));
        }
      } finally { dom.window.close(); }
    });
  }
}

test('Administration and legacy links lead to one participant-group editor', () => {
  const home = readFileSync(path.join(dir, 'admin/index.html'), 'utf8');
  const legacy = readFileSync(path.join(dir, 'participant-groups.html'), 'utf8');
  const picker = readFileSync(path.join(dir, 'js/participant-picker.js'), 'utf8');
  for (const content of [home, legacy, picker]) assert.ok(content.includes('/admin/participant-groups.html'));
  assert.match(legacy, /http-equiv="refresh"/);
  assert.doesNotMatch(legacy, /id="group-editor"/);
});
