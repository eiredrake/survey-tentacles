const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../../main/resources/static');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const sample = { id: 7, slug: 'welcome', publicUrl: 'https://public.example.org/p/welcome', title: '<b>Welcome</b>', tagline: 'Hello', content: '<p>Content</p>', contentFormat: 'html', enabled: true,
  expired: false, expiresAt: '2030-10-01T14:30:00Z', uniqueVisitorLimit: 10, totalViews: 4, uniqueVisitors: 2, imageFilename: 'test.png' };

function setup(reply = () => undefined, list = [sample]) {
  const dom = new JSDOM(read('admin/promotional-pages.html'), { url: 'http://localhost/admin/promotional-pages.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.visualViewport = { width: 1200, height: 900, offsetTop: 0, offsetLeft: 0, addEventListener() {}, removeEventListener() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(value) { this.textContent = value; } });
  window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
  window.Range.prototype.getClientRects = () => [];
  // The distribution initializes its unused color wheel; JSDOM has no canvas renderer.
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    createLinearGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => target[key] || (() => {}) });
  const calls = [], messages = [];
  const objectUrls = [], revokedUrls = [];
  window.URL.createObjectURL = file => { const url = 'blob:test-' + objectUrls.length; objectUrls.push({ url, file }); return url; };
  window.URL.revokeObjectURL = url => revokedUrls.push(url);
  window.confirm = () => true;
  window.showToast = (message, kind) => messages.push({ message, kind });
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const custom = await reply(url, options);
    if (custom?.ok === false) return custom;
    const value = custom ?? (url === '/csrf' ? { headerName: 'Custom-Csrf', token: 'test-token' }
      : options.method === 'POST' ? { ...sample, ...JSON.parse(typeof options.body === 'string' ? options.body : '{}') }
      : url.endsWith('/visitors') ? [{ name: '<b>Alice</b>', firstVisitedAt: '2030-01-01', lastVisitedAt: '2030-01-02', viewCount: 2 }] : list);
    return { ok: true, status: options.method === 'DELETE' ? 204 : 200, json: async () => value };
  };
  for (const name of ['js/getCsrfToken.js', 'js/icon-button.js', 'vendor/fdatepicker/fdatepicker.min.js', 'vendor/suneditor/suneditor.min.js']) window.eval(read(name));
  const richEditors = [];
  const createEditor = window.SUNEDITOR.create.bind(window.SUNEDITOR);
  window.SUNEDITOR.create = (...args) => { const instance = createEditor(...args); richEditors.push(instance); return instance; };
  window.eval(read('js/promotional-pages.js'));
  const document = window.document;
  return { dom, window, document, calls, messages, objectUrls, revokedUrls, richEditors, editor: document.getElementById('editor') };
}
const submit = async p => {
  await new Promise(resolve => setTimeout(resolve, 20));
  p.editor.dispatchEvent(new p.window.Event('submit', { cancelable: true }));
  await tick();
};

async function openRichEditor(p) {
  await tick();
  p.document.querySelector('#pages [title="Edit"]').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  return p.richEditors.at(-1);
}

function selectText(p, rich, text = 'Hello world') {
  rich.$.html.set('<p>' + text + '</p>');
  const node = rich.$.frameContext.get('wysiwyg').querySelector('p').firstChild;
  rich.$.selection.setRange(node, 0, node, node.length);
}

test('Real rich editor loads sanitized formatting and saves it unchanged with an explicit format', async () => {
  const content = '<h2>Heading</h2><p><strong>Bold</strong> <em>Italic</em></p><ul><li>Item</li></ul>'
    + '<blockquote>Quote</blockquote><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
  const p = setup(undefined, [{ ...sample, content }]);
  try {
    const rich = await openRichEditor(p);
    const editable = rich.$.frameContext.get('wysiwyg');
    assert.equal(editable.getAttribute('role'), 'textbox');
    assert.equal(editable.getAttribute('aria-labelledby'), 'content-label');
    for (const selector of ['h2', 'strong', 'em', 'ul li', 'blockquote', 'table th', 'table td']) assert.ok(editable.querySelector(selector), selector);
    for (const command of ['bold', 'italic', 'blockStyle', 'list_bulleted', 'list_numbered', 'link', 'table'])
      assert.ok(p.document.querySelector('button[data-command="' + command + '"]').getAttribute('aria-label'));
    await submit(p);
    const saved = JSON.parse(p.calls.find(call => call.options.method === 'POST').options.body);
    assert.equal(saved.contentFormat, 'html');
    const document = new JSDOM(saved.content).window.document;
    for (const selector of ['h2', 'strong', 'em', 'ul li', 'blockquote', 'table th', 'table td']) assert.ok(document.querySelector(selector), selector);
    assert.equal(document.querySelector('td').textContent, 'Cell');
  } finally { p.window.close(); }
});

test('Actual Bold, Italic, headings and list toolbar operations produce document formatting', async () => {
  const p = setup();
  try {
    const rich = await openRichEditor(p);
    for (const [command, tag] of [['bold', 'strong'], ['italic', 'em'], ['list_bulleted', 'ul'], ['list_numbered', 'ol']]) {
      selectText(p, rich);
      p.document.querySelector('button[data-command="' + command + '"]').click();
      assert.ok(rich.$.frameContext.get('wysiwyg').querySelector(tag), command);
    }
    for (const heading of ['h2', 'h3', 'h4']) {
      selectText(p, rich);
      p.document.querySelector('button[data-command="blockStyle"]').click();
      p.document.querySelector('button[data-value="' + heading + '"]').click();
      assert.equal(rich.$.frameContext.get('wysiwyg').querySelector(heading).textContent, 'Hello world');
    }
  } finally { p.window.close(); }
});

test('Actual link dialog and table picker insert editable links and a basic two by three table', async () => {
  const p = setup();
  try {
    const rich = await openRichEditor(p);
    selectText(p, rich);
    p.document.querySelector('button[data-command="link"]').click();
    const modal = p.document.querySelector('.se-modal');
    modal.querySelector('.se-input-url').value = 'https://example.org/announcement';
    modal.querySelector('.se-input-url').dispatchEvent(new p.window.Event('input', { bubbles: true }));
    modal.querySelector('form').dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    assert.equal(rich.$.frameContext.get('wysiwyg').querySelector('a').getAttribute('href'), 'https://example.org/announcement');
    selectText(p, rich);
    p.document.querySelector('button[data-command="table"]').click();
    const picker = p.document.querySelector('.se-controller-table-picker');
    const move = new p.window.MouseEvent('mousemove', { bubbles: true });
    Object.defineProperties(move, { offsetX: { value: 36 }, offsetY: { value: 54 } });
    picker.dispatchEvent(move); picker.click();
    const table = rich.$.frameContext.get('wysiwyg').querySelector('table');
    assert.equal(table.rows.length, 3);
    assert.equal(table.rows[0].cells.length, 2);
    table.rows[0].cells[0].firstElementChild.textContent = 'Editable cell';
    await submit(p);
    assert.match(JSON.parse(p.calls.find(call => call.options.method === 'POST').options.body).content, /Editable cell/);
  } finally { p.window.close(); }
});

test('Cancel destroys editor state and reopening restores server content including escaped legacy text', async () => {
  const content = '<p>Literal &lt;strong&gt;text&lt;/strong&gt; &amp; "quotes"<br>Next line</p>';
  const p = setup(undefined, [{ ...sample, content }]);
  try {
    const first = await openRichEditor(p);
    assert.equal(first.$.frameContext.get('wysiwyg').querySelector('strong'), null);
    assert.match(first.$.frameContext.get('wysiwyg').textContent, /Literal <strong>text<\/strong> & "quotes"/);
    selectText(p, first, 'Unsaved');
    p.document.getElementById('cancel').click();
    assert.equal(p.document.querySelector('.sun-editor'), null);
    p.document.getElementById('create').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(p.richEditors.at(-1).isEmpty(), true);
    p.document.getElementById('cancel').click();
    const restored = await openRichEditor(p);
    assert.match(restored.$.frameContext.get('wysiwyg').textContent, /Literal/);
    assert.doesNotMatch(restored.$.html.get(), /Unsaved/);
  } finally { p.window.close(); }
});

test('Administration links to promotional pages and list renders safe titles, public links, states, and counts', async () => {
  const landing = new JSDOM(read('admin/index.html'));
  assert.ok(landing.window.document.querySelector('a[href="/admin/promotional-pages.html"]'));
  landing.window.close();
  const p = setup(undefined, [sample, { ...sample, id: 8, enabled: false }, { ...sample, id: 9, expired: true }]);
  try {
    await tick();
    const rows = p.document.querySelectorAll('#pages tr');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].cells[0].textContent, '<b>Welcome</b>');
    assert.equal(rows[0].querySelector('b'), null);
    assert.equal(rows[0].querySelector('a').pathname, '/p/welcome');
    assert.deepEqual([...rows].map(row => row.cells[2].textContent), ['Published', 'Unpublished', 'Expired']);
    assert.equal(rows[0].cells[3].textContent, '4');
    assert.equal(rows[0].cells[4].textContent, '2');
    assert.equal(rows[0].querySelectorAll('button').length, 5);
  } finally { p.window.close(); }
});

test('Create submits numeric visitor limit and canonical CSRF, then edit restores actual FDatepicker date', async () => {
  const p = setup();
  try {
    await tick();
    p.document.getElementById('create').click();
    p.editor.elements.title.value = 'New';
    p.editor.elements.slug.value = 'new';
    p.editor.elements.uniqueVisitorLimit.value = '12';
    await submit(p);
    const create = p.calls.find(call => call.url === '/api/promotional-pages' && call.options.method === 'POST');
    assert.equal(create.options.headers['Custom-Csrf'], 'test-token');
    assert.equal(JSON.parse(create.options.body).uniqueVisitorLimit, 12);
    assert.equal(JSON.parse(create.options.body).expiresAt, null);
    p.document.querySelector('#pages [title="Edit"]').click();
    await tick();
    assert.equal(p.document.getElementById('expires-at')._fdatepicker.selectedDate.toISOString(), new Date(sample.expiresAt).toISOString());
    assert.notEqual(p.document.getElementById('expires-at').value, sample.expiresAt);
    assert.equal(p.document.getElementById('image-preview').hidden, false);
    p.editor.elements.enabled.checked = false;
    await submit(p);
    const edit = p.calls.find(call => call.url === '/api/promotional-pages/7' && call.options.method === 'POST');
    assert.equal(JSON.parse(edit.options.body).enabled, false);
    assert.equal(JSON.parse(edit.options.body).expiresAt, new Date(sample.expiresAt).toISOString());
  } finally { p.window.close(); }
});

test('New page resets prior expiry and clearing an existing expiry saves null', async () => {
  const p = setup();
  try {
    await tick();
    p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    p.document.getElementById('expires-at').value = '';
    await submit(p);
    assert.equal(JSON.parse(p.calls.find(c => c.options.method === 'POST').options.body).expiresAt, null);
    p.document.getElementById('create').click();
    assert.equal(p.document.getElementById('expires-at').value, '');
    assert.equal(p.document.getElementById('expires-at')._fdatepicker.selectedDate, null);
    assert.equal(p.document.getElementById('image-preview').hidden, true);
  } finally { p.window.close(); }
});

test('Publish and unpublish row actions preserve fields and send enabled with CSRF', async () => {
  for (const enabled of [true, false]) {
    const p = setup(undefined, [{ ...sample, enabled }]);
    try {
      await tick();
      p.document.querySelector('#pages [title="' + (enabled ? 'Unpublish' : 'Publish') + '"]').click(); await tick();
      const call = p.calls.find(c => c.options.method === 'POST');
      assert.equal(JSON.parse(call.options.body).enabled, !enabled);
      assert.equal(JSON.parse(call.options.body).content, sample.content);
      assert.equal(call.options.headers['Custom-Csrf'], 'test-token');
    } finally { p.window.close(); }
  }
});

test('Deletion requires confirmation and analytics safely renders visitor information', async () => {
  const p = setup();
  try {
    await tick();
    p.window.confirm = () => false;
    p.document.querySelector('#pages [title="Delete"]').click(); await tick();
    assert.equal(p.calls.filter(c => c.options.method === 'DELETE').length, 0);
    p.document.querySelector('#pages [title="Analytics"]').click(); await tick();
    assert.equal(p.document.getElementById('analytics').hidden, false);
    assert.match(p.document.querySelector('#analytics tbody').textContent, /<b>Alice<\/b>/);
    assert.equal(p.document.querySelector('#analytics b'), null);
    p.window.confirm = () => true;
    p.document.querySelector('#pages [title="Delete"]').click(); await tick();
    const call = p.calls.find(c => c.options.method === 'DELETE');
    assert.equal(call.url, '/api/promotional-pages/7');
    assert.equal(call.options.headers['Custom-Csrf'], 'test-token');
  } finally { p.window.close(); }
});

test('Image upload uses multipart CSRF and failure retains saved ID for retry', async () => {
  let fail = true;
  const p = setup((url, options) => url.endsWith('/image') && options.method === 'POST' && fail
    ? { ok: false, json: async () => ({ error: 'Invalid image.' }) } : undefined);
  try {
    await tick();
    p.document.getElementById('create').click();
    p.editor.elements.title.value = 'New'; p.editor.elements.slug.value = 'new';
    Object.defineProperty(p.editor.elements.image, 'files', { value: [new p.window.File(['image'], 'x.png', { type: 'image/png' })] });
    await submit(p);
    assert.equal(p.editor.hidden, false);
    assert.equal(p.messages.at(-1).message, 'Page saved, but image upload failed: Invalid image.');
    const upload = p.calls.find(c => c.url.endsWith('/image'));
    assert.ok(upload.options.body instanceof p.window.FormData);
    assert.equal(upload.options.headers['Content-Type'], undefined);
    assert.equal(upload.options.headers['Custom-Csrf'], 'test-token');
    fail = false;
    await submit(p);
    assert.equal(p.calls.filter(c => c.url === '/api/promotional-pages' && c.options.method === 'POST').length, 1);
    assert.equal(p.editor.hidden, true);
  } finally { p.window.close(); }
});

test('Removing image clears preview and uses protected endpoint', async () => {
  const p = setup();
  try {
    await tick();
    p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    p.document.getElementById('remove-image').click(); await tick();
    assert.equal(p.document.getElementById('image-preview').hidden, true);
    const call = p.calls.find(c => c.options.method === 'DELETE');
    assert.equal(call.url, '/api/promotional-pages/7/image');
    assert.equal(call.options.headers['Custom-Csrf'], 'test-token');
  } finally { p.window.close(); }
});

test('CSRF failure prevents mutation and list errors produce actionable messages', async () => {
  const p = setup(url => url === '/csrf' ? { ok: false, status: 403, statusText: 'Forbidden' } : undefined);
  try {
    await tick();
    p.document.querySelector('#pages [title="Unpublish"]').click(); await tick();
    assert.equal(p.calls.filter(c => c.options.method === 'POST').length, 0);
    assert.match(p.messages.at(-1).message, /CSRF/);
  } finally { p.window.close(); }
  const failed = setup(() => ({ ok: false, json: async () => ({}) }));
  try { await tick(); assert.equal(failed.messages.at(-1).message, 'Unable to load promotional pages.'); }
  finally { failed.window.close(); }
});

test('Editor has deliberate sections, associated labels and help, and labeled primary actions', async () => {
  const p = setup();
  try {
    await tick();
    const headings = [...p.editor.querySelectorAll('.promo-section h3')].map(h => h.textContent);
    assert.deepEqual(headings, ['Basic information', 'Page content', 'Publishing', 'Expiration (optional)']);
    for (const input of p.editor.querySelectorAll('input, textarea')) {
      assert.ok(input.labels.length, input.id + ' needs a label');
      for (const id of input.getAttribute('aria-describedby').split(' ')) assert.ok(p.document.getElementById(id));
    }
    assert.ok(p.editor.querySelector('textarea').rows >= 8);
    assert.equal(p.editor.querySelector('[type="submit"]').textContent, 'Save Promotional Page');
    assert.equal(p.document.getElementById('cancel').textContent, 'Cancel');
    assert.match(p.document.getElementById('slug-help').textContent, /single hyphens between words/);
    assert.match(p.document.getElementById('destination-help').textContent, /Leave blank to show Not Found/);
    assert.match(p.document.getElementById('visitor-help').textContent, /Repeat visits/);
    assert.equal(p.editor.elements.expiredDestination.required, false);
    assert.ok(p.document.querySelector('link[href="/css/promotional-pages.css"]'));
  } finally { p.window.close(); }
});

test('Create and Cancel reset all edit values, validation and image state without mutations', async () => {
  const p = setup(undefined, [{ ...sample, expiredDestination: '/admin/', enabled: false }]);
  try {
    await tick();
    p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    assert.equal(p.document.getElementById('editor-heading').textContent, 'Edit Promotional Page');
    assert.equal(p.document.getElementById('editing-page').textContent, sample.title);
    for (const key of ['title', 'slug', 'tagline', 'content']) assert.equal(p.editor.elements[key].value, sample[key]);
    assert.equal(p.editor.elements.expiredDestination.value, '/admin/');
    assert.equal(p.editor.elements.uniqueVisitorLimit.value, '10');
    assert.equal(p.editor.elements.enabled.checked, false);
    p.editor.elements.slug.value = '/invalid';
    await submit(p);
    assert.equal(p.editor.elements.slug.getAttribute('aria-invalid'), 'true');
    p.document.getElementById('cancel').click();
    assert.equal(p.editor.hidden, true);
    assert.equal(p.calls.filter(c => c.options.method !== 'GET' && c.options.method).length, 0);
    p.document.getElementById('create').click();
    assert.equal(p.document.getElementById('editor-heading').textContent, 'Create Promotional Page');
    for (const key of ['title', 'slug', 'tagline', 'content', 'uniqueVisitorLimit', 'expiredDestination'])
      assert.equal(p.editor.elements[key].value, '');
    assert.equal(p.editor.elements.enabled.checked, true);
    assert.equal(p.document.getElementById('expires-at')._fdatepicker.selectedDate, null);
    assert.equal(p.document.getElementById('image-preview').hasAttribute('src'), false);
    assert.equal(p.editor.querySelector('[aria-invalid="true"]'), null);
    assert.equal(p.document.getElementById('image-state').textContent, 'No promotional image selected.');
  } finally { p.window.close(); }
});

test('Public address rejects full URLs, slashes and repeated hyphens with inline guidance before submitting', async () => {
  const p = setup();
  try {
    await tick();
    p.document.getElementById('create').click();
    p.editor.elements.title.value = 'Page';
    for (const value of ['', '/testers-needed', '/p/testers-needed', 'https://host/p/testers-needed', 'a--b', '-a', 'a-', 'two words']) {
      p.editor.elements.slug.value = value; await submit(p);
      assert.equal(p.calls.filter(c => c.options.method === 'POST').length, 0);
      assert.match(p.document.getElementById('page-slug-error').textContent, /single hyphens/);
      assert.equal(p.document.activeElement, p.editor.elements.slug);
    }
    p.editor.elements.slug.value = 'October-Event-2026'; await submit(p);
    assert.equal(JSON.parse(p.calls.find(c => c.options.method === 'POST').options.body).slug, 'October-Event-2026');
  } finally { p.window.close(); }
});

test('Blank and internal expiration destinations submit while unsafe values have field feedback', async () => {
  for (const value of ['', '   ', '/admin/', '/survey.html?id=123']) {
    const p = setup();
    try {
      await tick(); p.document.getElementById('create').click();
      p.editor.elements.title.value = 'Page'; p.editor.elements.slug.value = 'page';
      p.editor.elements.expiredDestination.value = value;
      await submit(p);
      const post = p.calls.find(c => c.options.method === 'POST');
      assert.ok(post, value + ' should save');
      assert.equal(JSON.parse(post.options.body).expiredDestination, value.trim() || null);
    } finally { p.window.close(); }
  }
  const p = setup();
  try {
    await tick(); p.document.getElementById('create').click();
    p.editor.elements.title.value = 'Page'; p.editor.elements.slug.value = 'page';
    for (const value of ['https://example.com', 'http://example.com', '//example.com/foo', '/\\evil', '/%5cevil', '/%2fevil']) {
      p.editor.elements.expiredDestination.value = value;
      await submit(p);
      assert.equal(p.calls.filter(c => c.options.method === 'POST').length, 0);
      assert.match(p.document.getElementById('expired-destination-error').textContent, /internal Tentacles path/);
      assert.equal(p.editor.elements.expiredDestination.getAttribute('aria-invalid'), 'true');
    }
  } finally { p.window.close(); }
});

test('Title, number, date, length and image errors are explained next to their fields', async () => {
  const p = setup();
  try {
    await tick(); p.document.getElementById('create').click();
    p.editor.elements.slug.value = 'page';
    await submit(p);
    assert.match(p.document.getElementById('page-title-error').textContent, /Enter a title/);
    p.editor.elements.title.value = 'Page';
    for (const value of ['0', '-1', '1.5', '2147483648']) {
      p.editor.elements.uniqueVisitorLimit.value = value; await submit(p);
      assert.match(p.document.getElementById('visitor-limit-error').textContent, /whole number/);
    }
    p.editor.elements.uniqueVisitorLimit.value = '';
    p.document.getElementById('expires-at').value = 'tomorrow maybe'; await submit(p);
    assert.match(p.document.getElementById('expires-at-error').textContent, /date picker/);
    p.document.getElementById('expires-at').value = '';
    p.editor.elements.tagline.value = 'x'.repeat(256); await submit(p);
    assert.match(p.document.getElementById('page-tagline-error').textContent, /255/);
    p.editor.elements.tagline.value = '';
    Object.defineProperty(p.editor.elements.image, 'files', { value: [new p.window.File(['bad'], 'bad.txt', { type: 'text/plain' })] });
    p.editor.elements.image.dispatchEvent(new p.window.Event('change'));
    await submit(p);
    assert.match(p.document.getElementById('page-image-error').textContent, /PNG, JPEG, WEBP, or GIF/);
    assert.equal(p.document.activeElement.id, 'choose-image');
    assert.equal(p.calls.filter(c => c.options.method === 'POST').length, 0);
  } finally { p.window.close(); }
});

test('Selected replacement previews locally, revokes previous URLs, and discard restores current image', async () => {
  const p = setup();
  try {
    await tick(); p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    const input = p.editor.elements.image;
    const preview = p.document.getElementById('image-preview');
    assert.match(preview.src, /\/api\/promotional-pages\/7\/image$/);
    const select = name => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new p.window.File(['image'], name, { type: 'image/png' })] });
      input.dispatchEvent(new p.window.Event('change'));
    };
    select('first.png');
    assert.equal(preview.src, 'blob:test-0');
    assert.match(p.document.getElementById('image-state').textContent, /save to upload/);
    select('second.png');
    assert.equal(preview.src, 'blob:test-1');
    assert.deepEqual(p.revokedUrls, ['blob:test-0']);
    p.document.getElementById('remove-image').click(); await tick();
    assert.match(preview.src, /\/api\/promotional-pages\/7\/image$/);
    assert.deepEqual(p.revokedUrls, ['blob:test-0', 'blob:test-1']);
    assert.equal(p.calls.filter(c => c.options.method === 'POST' || c.options.method === 'DELETE').length, 0);
    select('third.png');
    p.document.getElementById('cancel').click();
    assert.equal(preview.hidden, true);
    assert.equal(p.revokedUrls.at(-1), 'blob:test-2');
  } finally { p.window.close(); }
});

test('Starting another page or leaving the document releases local preview URLs', async () => {
  const p = setup();
  try {
    await tick(); p.document.getElementById('create').click();
    Object.defineProperty(p.editor.elements.image, 'files', { configurable: true, value: [new p.window.File(['image'], 'x.gif', { type: 'image/gif' })] });
    p.editor.elements.image.dispatchEvent(new p.window.Event('change'));
    p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    assert.deepEqual(p.revokedUrls, ['blob:test-0']);
    assert.match(p.document.getElementById('image-preview').src, /\/7\/image$/);
    p.editor.elements.image.dispatchEvent(new p.window.Event('change'));
    p.window.dispatchEvent(new p.window.Event('pagehide'));
    assert.deepEqual(p.revokedUrls, ['blob:test-0', 'blob:test-1']);
  } finally { p.window.close(); }
});

test('Image removal and page deletion give operation-specific success and failure feedback', async () => {
  let fail = false;
  const p = setup((url, options) => fail && options.method === 'DELETE' ? { ok: false, json: async () => ({}) } : undefined);
  try {
    await tick(); p.document.querySelector('#pages [title="Edit"]').click(); await tick();
    fail = true;
    p.document.getElementById('remove-image').click(); await tick();
    assert.equal(p.messages.at(-1).message, 'Unable to remove image.');
    assert.equal(p.document.getElementById('image-preview').hidden, false);
    fail = false;
    p.document.getElementById('remove-image').click(); await tick();
    assert.equal(p.messages.at(-1).message, 'Image removed.');
    p.document.querySelector('#pages [title="Delete"]').click(); await tick();
    assert.equal(p.messages.at(-1).message, 'Promotional page deleted.');
  } finally { p.window.close(); }
});

test('Share sits between publication and analytics and copies the configured public URL', async () => {
  const p = setup();
  const copied = [];
  p.window.navigator.clipboard = { writeText: async value => copied.push(value) };
  try {
    await tick();
    const buttons = [...p.document.querySelectorAll('#pages button')];
    assert.deepEqual(buttons.map(button => button.title), ['Edit', 'Unpublish', 'Copy promotional page link', 'Analytics', 'Delete']);
    const share = buttons[2];
    assert.equal(share.getAttribute('aria-label'), 'Copy promotional page link');
    assert.ok(share.classList.contains('icon-button'));
    assert.ok(share.querySelector('.fa-solid.fa-share-nodes'));
    assert.equal(p.document.querySelector('#pages a').href, sample.publicUrl);
    share.click(); await tick();
    assert.deepEqual(copied, [sample.publicUrl]);
    assert.deepEqual(p.messages.at(-1), { message: 'Promotional page link copied.', kind: 'success' });
    assert.equal(p.calls.filter(call => call.options.method && call.options.method !== 'GET').length, 0);
  } finally { p.window.close(); }
});

test('Share reports denied or unavailable clipboard access without claiming success', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('Permission denied'); } }]) {
    const p = setup();
    p.window.navigator.clipboard = clipboard;
    try {
      await tick();
      p.document.querySelector('#pages [title="Copy promotional page link"]').click(); await tick();
      assert.deepEqual(p.messages.at(-1), {
        message: 'Unable to copy promotional page link. Please copy the public link manually.', kind: 'error'
      });
      assert.equal(p.messages.some(message => message.kind === 'success'), false);
    } finally { p.window.close(); }
  }
});
