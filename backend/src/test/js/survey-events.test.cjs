const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInContext } = require("node:vm");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const staticDir = path.resolve(__dirname, "../../main/resources/static");
const tick = () => new Promise(resolve => setImmediate(resolve));

function browser(html = "survey-edit") {
  const dom = new JSDOM(readFileSync(path.join(staticDir, html + ".html"), "utf8"), {
    url: "http://localhost/?id=1", runScripts: "outside-only"
  });
  const window = dom.window;
  const evaluate = code => runInContext(code, dom.getInternalVMContext());
  const script = name => evaluate(readFileSync(path.join(staticDir, "js", name + ".js"), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  window.console.error = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  return { dom, window, evaluate, script };
}

function notifications(admin = true, page = "survey-edit") {
  const p = browser(page);
  const streams = [], notices = [];
  const calls = [];
  let enabled = false, failSave = false;
  p.window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/me") return { ok: true, json: async () => ({ id: 10, authorities: admin ? ["ROLE_ADMIN"] : [] }) };
    if (url === "/csrf") return { ok: true, json: async () => ({ headerName: "X-CSRF", token: "test" }) };
    if (options.method === "PUT" && !failSave) enabled = JSON.parse(options.body).enabled;
    return { ok: !(options.method === "PUT" && failSave), json: async () => ({ enabled }) };
  };
  p.window.showToast = (...args) => notices.push(args);
  p.window.EventSource = class extends p.window.EventTarget {
    constructor(url) { super(); this.url = url; this.closed = false; streams.push(this); }
    close() { this.closed = true; }
    receive(event) { this.dispatchEvent(new p.window.MessageEvent("survey-event", { data: JSON.stringify(event) })); }
  };
  p.script("survey-events");
  return { ...p, streams, notices, calls, failSave: () => { failSave = true; } };
}

const submission = (id = "one", surveyId = 1) => ({ id, surveyId, type: "submission.saved",
  data: { userName: "Arlo", surveyTitle: "Foundations Survey" } });

test("Only admins open the app-wide stream", async () => {
  const participant = notifications(false);
  await tick();
  assert.equal(participant.streams.length, 0);
  participant.dom.window.close();
  const admin = notifications();
  await tick();
  assert.equal(admin.streams.length, 1);
  assert.equal(admin.streams[0].url, "/api/surveys/events");
  admin.dom.window.close();
});

test("A submission displays one toast and duplicate reconnect events are ignored", async () => {
  const p = notifications();
  await tick();
  const stream = p.streams[0];
  stream.receive(submission());
  stream.dispatchEvent(new p.window.Event("error"));
  stream.receive(submission());
  assert.equal(p.streams.length, 1);
  assert.equal(stream.closed, false);
  assert.deepEqual(p.notices, [["Arlo submitted Foundations Survey.", "notify"]]);
  stream.receive(submission("two"));
  assert.equal(p.notices.length, 2);
  p.dom.window.close();
});

test("Malformed messages and unknown event types do not create submission toasts", async () => {
  const p = notifications();
  await tick();
  p.streams[0].receive(null);
  p.streams[0].dispatchEvent(new p.window.MessageEvent("survey-event", { data: "invalid JSON" }));
  p.streams[0].receive({ id: "future", surveyId: 1, type: "future.event", data: {} });
  assert.equal(p.notices.length, 0);
  p.dom.window.close();
});

test("Navigating away closes the stream; returning restores one connection", async () => {
  const p = notifications();
  await tick();
  p.streams[0].receive(submission());
  p.window.dispatchEvent(new p.window.Event("pagehide"));
  assert.equal(p.streams[0].closed, true);
  p.window.dispatchEvent(new p.window.Event("pageshow"));
  p.window.dispatchEvent(new p.window.Event("pageshow"));
  await tick();
  assert.equal(p.streams.length, 2);
  p.streams[1].receive(submission());
  assert.equal(p.notices.length, 1);
  p.dom.window.close();
});

test("Notification leaves an open editor and dirty input unchanged", async () => {
  const p = notifications();
  p.script("survey-edit");
  p.evaluate('showQuestionEditor("single-select-question-template")');
  const input = p.window.document.getElementById("single-select-editor-prompt");
  input.value = "Unsaved edit";
  input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  await tick();
  p.streams[0].receive(submission());
  assert.equal(input.value, "Unsaved edit");
  assert.equal(input.isConnected, true);
  assert.equal(p.evaluate("hasUnsavedChanges()"), true);
  p.dom.window.close();
});

function voting() {
  const p = browser("survey");
  const calls = [], notices = [];
  let failedAnswer = false, failedNotice = false;
  p.window.showToast = (...args) => notices.push(args);
  p.window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: !(url === "/answer/2" && failedAnswer) && !(url.endsWith("/submitted") && failedNotice),
      json: async () => ({ headerName: "X-CSRF", token: "test" }) };
  };
  p.script("survey");
  p.evaluate('surveyAcceptingResponses = true; questionHandlers.push(...[1, 2].map(id => ({'
    + ' validate: () => true, save: async () => (await fetch("/answer/" + id, { method: "POST" })).ok })));'
    + 'initializeSurveySubmit();');
  return { ...p, calls, notices, click: () => p.window.document.getElementById("submit-survey-button").click(),
    failAnswer: value => { failedAnswer = value; }, failNotice: value => { failedNotice = value; } };
}

test("One final notice is sent only after all answer requests succeed", async () => {
  const p = voting();
  p.click();
  await tick();
  assert.deepEqual(p.calls.map(call => call.url), ["/csrf", "/answer/1", "/answer/2", "/api/surveys/1/submitted"]);
  const notice = p.calls.at(-1);
  assert.equal(notice.options.headers["X-CSRF"], "test");
  assert.match(JSON.parse(notice.options.body).submissionId, /^[0-9a-f-]{36}$/);
  p.dom.window.close();
});

test("A partial save failure never sends a submission notice", async () => {
  const p = voting();
  p.failAnswer(true);
  p.click();
  await tick();
  assert.equal(p.calls.some(call => call.url.endsWith("/submitted")), false);
  assert.equal(p.notices.at(-1)[1], "error");
  p.dom.window.close();
});

test("Retrying an uncertain confirmation reuses its ID; a later submission gets a new ID", async () => {
  const p = voting();
  p.failNotice(true);
  p.click();
  await tick();
  const first = JSON.parse(p.calls.at(-1).options.body).submissionId;
  assert.match(p.notices.at(-1)[0], /responses were saved/);
  p.failNotice(false);
  p.click();
  await tick();
  assert.equal(JSON.parse(p.calls.at(-1).options.body).submissionId, first);
  p.click();
  await tick();
  assert.notEqual(JSON.parse(p.calls.at(-1).options.body).submissionId, first);
  p.dom.window.close();
});

test("Every relevant survey page loads the notification client", () => {
  for (const page of ["index", "survey", "survey-edit", "survey-view", "survey-participant-view"]) {
    assert.match(readFileSync(path.join(staticDir, page + ".html"), "utf8"), /src="\/js\/survey-events.js"/);
  }
});

test("Admin on the surveys list receives submissions from multiple surveys", async () => {
  const p = notifications(true, "index");
  p.window.history.replaceState(null, "", "/");
  await tick();
  p.streams[0].receive(submission("first", 1));
  p.streams[0].receive(submission("second", 2));
  assert.equal(p.notices.length, 2);
  p.dom.window.close();
});

test("Editor opt-in defaults off, saves with CSRF, and restores the setting on failure", async () => {
  const p = notifications();
  await tick();
  const toggle = p.window.document.getElementById("survey-notifications-enabled");
  assert.equal(p.window.document.getElementById("survey-notifications").hidden, false);
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  toggle.click();
  await tick();
  const saved = p.calls.find(call => call.options.method === "PUT");
  assert.equal(saved.options.headers["X-CSRF"], "test");
  assert.equal(JSON.parse(saved.options.body).enabled, true);
  assert.equal(toggle.checked, true);
  p.failSave();
  toggle.click();
  await tick();
  assert.equal(toggle.checked, true);
  assert.equal(toggle.disabled, false);
  assert.equal(p.notices.at(-1)[1], "error");
  p.dom.window.close();
});

test("Navigation reuses the last received cursor for this admin", async () => {
  const p = notifications(true, "index");
  await tick();
  p.streams[0].dispatchEvent(new p.window.MessageEvent("ready", { data: "connected", lastEventId: "server:12" }));
  p.window.dispatchEvent(new p.window.Event("pagehide"));
  p.window.dispatchEvent(new p.window.Event("pageshow"));
  await tick();
  assert.equal(p.streams[1].url, "/api/surveys/events?cursor=server%3A12");
  p.dom.window.close();
});
