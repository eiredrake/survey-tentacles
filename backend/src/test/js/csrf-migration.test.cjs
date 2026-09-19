const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../../main/resources/static');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

test('CSRF retrieval exists only in the canonical helper and pages load it before callers', () => {
  const callers = [];
  for (const file of files(path.join(root, 'js')).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (path.basename(file) === 'getCsrfToken.js') continue;
    assert.doesNotMatch(source, /["']\/csrf["']/, file);
    assert.doesNotMatch(source, /["']X-(?:CSRF|XSRF)-TOKEN["']/i, file);
    if (source.includes('getCsrfToken(')) callers.push('/js/' + path.basename(file));
  }
  for (const file of files(root).filter(file => file.endsWith('.html'))) {
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
    try {
      const scripts = [...dom.window.document.scripts].map(script => script.getAttribute('src'));
      for (const caller of callers.filter(caller => scripts.includes(caller))) {
        assert.equal(scripts.filter(src => src === '/js/getCsrfToken.js').length, 1, file);
        assert.ok(scripts.indexOf('/js/getCsrfToken.js') < scripts.indexOf(caller), file + ': ' + caller);
      }
    } finally { dom.window.close(); }
  }
});

for (const failure of [false, true]) {
  test(`Logout uses canonical CSRF and ${failure ? 'stops on failure' : 'preserves form navigation'}`, async () => {
    const dom = new JSDOM('<button id="logout-button"></button>', { url: 'http://localhost/', runScripts: 'outside-only' });
    try {
      let fetched = 0, submitted = null;
      const errors = [];
      dom.window.fetch = async url => {
        assert.equal(url, '/csrf'); fetched++;
        return { ok: !failure, status: 403, statusText: 'Forbidden', json: async () =>
          ({ headerName: 'Custom-Header', parameterName: 'custom_form_token', token: 'test-token' }) };
      };
      dom.window.showToast = message => errors.push(message);
      dom.window.HTMLFormElement.prototype.submit = function () { submitted = this; };
      dom.window.eval(read('js/getCsrfToken.js'));
      dom.window.eval(read('js/logout.js'));
      await dom.window.logout();
      assert.equal(fetched, 1);
      if (failure) { assert.equal(submitted, null); assert.equal(errors.length, 1); }
      else {
        assert.equal(submitted.method, 'post');
        assert.equal(submitted.getAttribute('action'), '/logout');
        assert.equal(submitted.querySelector('input').name, 'custom_form_token');
        assert.equal(submitted.querySelector('input').value, 'test-token');
      }
    } finally { dom.window.close(); }
  });
}
