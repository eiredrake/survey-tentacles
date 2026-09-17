const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const staticDir = path.resolve(__dirname, '../../main/resources/static');
const csrfScript = readFileSync(path.join(staticDir, 'js/getCsrfToken.js'), 'utf8');

function createDom(fetchImplementation) {
  const dom = new JSDOM('', {
    url: 'http://localhost/',
    runScripts: 'outside-only'
  });

  dom.window.fetch = fetchImplementation;
  dom.window.eval(csrfScript);

  return dom;
}

test('getCsrfToken returns valid CSRF information', async () => {
  const dom = createDom(async (url, options) => {
    assert.equal(url, '/csrf');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');

    return {
      ok: true,
      json: async () => ({
        token: 'test-token',
        headerName: 'X-CSRF-TOKEN'
      })
    };
  });

  try {
    const csrf = await dom.window.getCsrfToken();

    assert.equal(csrf.token, 'test-token');
    assert.equal(csrf.headerName, 'X-CSRF-TOKEN');
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken reports network failures', async () => {
  const dom = createDom(async () => {
    throw new Error('Connection refused');
  });

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /Unable to fetch CSRF token: Connection refused/
    );
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken reports unsuccessful HTTP responses', async () => {
  const dom = createDom(async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error'
  }));

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /server returned HTTP 500 Internal Server Error/
    );
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken rejects invalid JSON responses', async () => {
  const dom = createDom(async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('Invalid JSON');
    }
  }));

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /server returned an invalid JSON response/
    );
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken rejects a missing CSRF object', async () => {
  const dom = createDom(async () => ({
    ok: true,
    json: async () => null
  }));

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /response did not contain a valid CSRF object/
    );
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken rejects a missing token', async () => {
  const dom = createDom(async () => ({
    ok: true,
    json: async () => ({
      headerName: 'X-CSRF-TOKEN'
    })
  }));

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /response did not contain a token/
    );
  } finally {
    dom.window.close();
  }
});

test('getCsrfToken rejects a missing header name', async () => {
  const dom = createDom(async () => ({
    ok: true,
    json: async () => ({
      token: 'test-token'
    })
  }));

  try {
    await assert.rejects(
      dom.window.getCsrfToken(),
      /response did not contain a header name/
    );
  } finally {
    dom.window.close();
  }
});