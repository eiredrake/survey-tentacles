const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const deadlineSource = readFileSync(path.join(staticDir, "js/deadline-refresh.js"), "utf8");
const source = readFileSync(path.join(staticDir, "js/survey.js"), "utf8")
  .replace(/^initialize\(\);\s*$/m, "");

function page() {
  const dom = new JSDOM(readFileSync(path.join(staticDir, "survey.html"), "utf8"), {
    url: "http://localhost/?id=1", runScripts: "outside-only"
  });
  const timers = [], toasts = [];
  dom.window.eval = code => runInContext(code, dom.getInternalVMContext());
  dom.window.fetch = async () => ({ ok: true, json: async () => [] });
  dom.window.showToast = (...args) => toasts.push(args);
  dom.window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  dom.window.clearTimeout = () => {};
  dom.window.eval(readFileSync(path.join(staticDir, "js/date-format.js"), "utf8"));
  dom.window.eval(deadlineSource);
  dom.window.eval(source);
  return { dom, window: dom.window, document: dom.window.document, timers, toasts };
}

test("Closed participant survey explains deadline and retains disabled submission", () => {
  const p = page();
  p.window.eval(`surveyAcceptingResponses = false;
    renderSurveyAvailability({ acceptingResponses: false, closureReason: "DEADLINE",
      autoCloseAt: "2030-01-02T03:04:00Z" }); initializeSurveySubmit();`);
  const banner = p.document.getElementById("survey-closed-banner");
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /This survey has closed\./);
  assert.match(banner.textContent, /Responses are no longer being accepted\./);
  assert.match(banner.textContent, /This survey closed on/);
  assert.equal(p.document.getElementById("submit-survey-button").disabled, true);
  p.dom.window.close();
});

test("Closed participant survey explains a reached participation limit", () => {
  const p = page();
  p.window.eval(`renderSurveyAvailability({ acceptingResponses: false,
    closureReason: "PARTICIPANT_LIMIT", autoCloseParticipantCount: 10 });`);
  assert.match(p.document.getElementById("survey-closed-context").textContent, /limit of 10 participants/);
  p.dom.window.close();
});

test("Open participant survey hides the closed message and schedules one deadline refresh", () => {
  const p = page();
  p.window.eval(`renderSurveyAvailability({ acceptingResponses: true });
    scheduleAutomaticClosureRefresh({ acceptingResponses: true,
      autoCloseAt: new Date(Date.now() + 60000).toISOString() });`);
  assert.equal(p.document.getElementById("survey-closed-banner").hidden, true);
  assert.equal(p.timers.length, 1);
  assert.ok(p.timers[0].delay >= 60000);
  p.dom.window.close();
});
function listPage(responses) {
  const dom = new JSDOM(readFileSync(path.join(staticDir, "index.html"), "utf8"), {
    url: "http://localhost/", runScripts: "outside-only"
  });
  const timers = [], calls = [], toasts = [];
  dom.window.eval = code => runInContext(code, dom.getInternalVMContext());
  dom.window.showToast = (...args) => toasts.push(args);
  dom.window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  dom.window.clearTimeout = () => {};
  dom.window.fetch = async url => {
    calls.push(url);
    return { ok: true, json: async () => responses.shift() ?? [] };
  };
  dom.window.eval(readFileSync(path.join(staticDir, "js/date-format.js"), "utf8"));
  dom.window.eval(deadlineSource);
  dom.window.eval(readFileSync(path.join(staticDir, "js/index.js"), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  dom.window.eval('currentUser = { authorities: ["ROLE_ADMIN"] };');
  return { dom, window: dom.window, document: dom.window.document, timers, calls, toasts };
}

const openSurvey = (id, closeAt) => ({ id, title: `Survey ${id}`, required: false, active: true,
  status: "OPEN", statusIcon: "fa-lock-open", acceptingResponses: true, autoCloseAt: closeAt });
const closedSurvey = id => ({ id, title: `Survey ${id}`, required: false, active: false,
  status: "CLOSED", statusIcon: "fa-lock", acceptingResponses: false });

test("Survey list schedules one refresh for its nearest future deadline", async () => {
  const now = Date.now();
  const p = listPage([[openSurvey(1, new Date(now + 120000).toISOString()),
    openSurvey(2, new Date(now + 60000).toISOString())]]);
  await p.window.eval("loadSurveys()");
  assert.equal(p.timers.length, 1);
  assert.ok(p.timers[0].delay >= 55000 && p.timers[0].delay < 120000);
  p.dom.window.close();
});

test("Survey list re-fetches authoritative state when its deadline arrives", async () => {
  const p = listPage([[openSurvey(1, new Date(Date.now() + 60000).toISOString())], [closedSurvey(1)]]);
  await p.window.eval("loadSurveys()");
  await p.timers[0].callback();
  assert.deepEqual(p.calls, ["/api/surveys", "/api/surveys"]);
  assert.equal(p.document.getElementById("active-surveys").children.length, 0);
  assert.equal(p.document.getElementById("inactive-surveys").children.length, 1);
  assert.match(p.document.getElementById("inactive-surveys").textContent, /Survey 1/);
  p.dom.window.close();
});

test("Survey list does not schedule a timer without a future deadline", async () => {
  const p = listPage([[closedSurvey(1)]]);
  await p.window.eval("loadSurveys()");
  assert.equal(p.timers.length, 0);
  p.dom.window.close();
});