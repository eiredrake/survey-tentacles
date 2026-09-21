const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "MEETUP", prompt: "Choose any", required: true,
  participantTemplateId: "meetup-participant-template", viewTemplateId: "meetup-view-template",
  editorTemplateId: "meetup-question-template" };
const detail = { ...question, options: [{ id: 3, name: "First", description: "First description" }, { id: 4, name: "<b>Second</b>", description: "Second description" }] };
const tick = () => new Promise(resolve => setImmediate(resolve));

function page(name, replies = {}) {
  const dom = new JSDOM(readFileSync(path.join(staticDir, `${name}.html`), "utf8"),
    { url: "http://localhost/?id=1&userId=7", runScripts: "outside-only" });
  const calls = [], toasts = [];
  dom.window.eval = code => runInContext(code, dom.getInternalVMContext());
  dom.window.showToast = (...args) => toasts.push(args);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const value = replies[url] ?? (url === "/csrf" ? { headerName: "X-CSRF", token: "test" }
      : url.endsWith("/questions") ? [question]
      : url.endsWith("/questions/2") ? detail : []);
    return { ok: true, json: async () => value };
  };
  dom.window.eval(readFileSync(path.join(staticDir, "js/getCsrfToken.js"), "utf8"));
  dom.window.eval(readFileSync(path.join(staticDir, "js/SmartInput.js"), "utf8"));
  for (const file of ["date-format", "scheduling-results", "meetup"]) {
    dom.window.eval(readFileSync(path.join(staticDir, `js/${file}.js`), "utf8"));
  }
  dom.window.eval(readFileSync(path.join(staticDir, "js", `${name}.js`), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, toasts };
}



test("Participant enters independent times, removes choices, and submits using canonical CSRF", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  const input = p.document.querySelector(".meetup-date-time");
  input.value = "2026-10-10T19:00"; p.document.querySelector(".meetup-add").click();
  input.value = "2026-10-11T19:00"; p.document.querySelector(".meetup-add").click();
  p.document.querySelector(".meetup-selections button").click();
  input.value = "2026-10-11T19:00"; p.document.querySelector(".meetup-add").click();
  assert.equal(p.document.querySelectorAll(".meetup-selections li").length, 1);
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click(); await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.deepEqual(JSON.parse(post.options.body), { dateTimes: [new Date("2026-10-11T19:00").toISOString()] });
  assert.equal(post.options.headers["X-CSRF"], "test");
  assert.equal(p.calls.some(c => c.url.includes("/results/meetup")), false);
  p.window.close();
});

test("Required empty availability blocks submission; optional availability can be cleared", async () => {
  for (const required of [true, false]) {
    const p = page("survey", { "/api/surveys/1/questions": [{ ...question, required }],
      "/api/surveys/1/questions/2/answers/meetup/7": [{ dateTime: "2026-10-10T23:00:00Z" }] });
    p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
    await p.window.eval("loadQuestions()");
    assert.equal(p.document.querySelectorAll(".meetup-selections li").length, 1);
    p.document.querySelector(".meetup-selections button").click();
    p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
    const post = p.calls.find(c => c.options.method === "POST");
    if (required) assert.equal(post, undefined);
    else assert.deepEqual(JSON.parse(post.options.body), { dateTimes: [] });
    p.window.close();
  }
});

test("Typed date is included on Submit even without clicking plus", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  p.document.querySelector(".meetup-date-time").value = "2026-10-10T19:00";
  p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
  assert.equal(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body).dateTimes.length, 1);
  p.window.close();
});

test("Closed Vote is read-only and displays availability counts with existing scheduling bars", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/results/meetup": { available: true,
    results: [{ dateTime: "2026-10-10T23:00:00Z", votes: 2 }] } });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;"); await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelector(".meetup-date-time").disabled, true);
  assert.equal(p.document.querySelector(".meetup-add").disabled, true);
  assert.match(p.document.querySelector(".meetup-results").textContent, /2 participants/);
  assert.equal(p.document.querySelector(".scheduling-result-bar").style.width, "100%");
  p.window.close();
});

test("Admin editor restores the prompt and saves without predefined dates", async () => {
  const p = page("survey-edit"); await p.window.eval("loadQuestions()");
  p.document.querySelector('[title="Edit question"]').click(); await tick();
  const input = p.document.getElementById("meetup-editor-prompt");
  assert.equal(input.value, question.prompt); input.value = "When can we meet?";
  p.document.getElementById("save-question-button").click(); await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/2/meetup");
  assert.equal(JSON.parse(post.options.body).prompt, "When can we meet?");
  assert.equal(JSON.parse(post.options.body).selections, undefined);
  p.window.close();
});

test("Admin View waits for closure and participant View displays only that person's dates", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/results/meetup": { available: false, results: [] } });
  await p.window.eval("loadQuestions()"); p.document.querySelector('[title="View question"]').click(); await tick();
  assert.match(p.document.querySelector(".meetup-results").textContent, /when the survey closes/); p.window.close();
  const v = page("survey-participant-view", { "/api/surveys/1/questions/2/answers/meetup/7": [{ dateTime: "2026-10-10T23:00:00Z" }] });
  await v.window.eval("loadQuestions()"); v.document.querySelector('[title="View question"]').click(); await tick();
  assert.equal(v.document.querySelectorAll(".meetup-results li").length, 1);
  assert.equal(v.document.querySelector(".meetup-results input"), null); v.window.close();
});

test("Shared scheduling bars retain vote counts and highlight all tied leaders", () => {
  const p = page("survey-view"), container = p.document.createElement("div");
  p.window.renderSchedulingResultList(container, [{ date: "2026-10-10", votes: 2 }, { date: "2026-10-11", votes: 2 }, { date: "2026-10-12", votes: 0 }]);
  assert.equal(container.querySelectorAll(".scheduling-result-leading").length, 2);
  assert.match(container.textContent, /2 votes/);
  assert.equal(container.querySelectorAll(".scheduling-result-bar")[2].style.width, "0%"); p.window.close();
});

test("Shared prompt editor keeps unsaved input on failure and still saves Short Text", async () => {
  for (const type of ["meetup", "short-text"]) {
    const p = page("survey-edit");
    p.window.eval(`showQuestionEditor("${type}-question-template")`);
    p.document.getElementById(`${type}-editor-prompt`).value = "Prompt";
    const fetch = p.window.fetch;
    p.window.fetch = async (url, options) => options?.method === "POST" ? { ok: false } : fetch(url, options);
    p.document.getElementById("save-question-button").click(); await tick();
    assert.equal(p.document.getElementById(`${type}-editor-prompt`).value, "Prompt");
    assert.equal(p.document.getElementById("save-question-button").disabled, false);
    p.window.fetch = fetch;
    p.document.getElementById("save-question-button").click(); await tick();
    assert.equal(p.calls.find(c => c.options.method === "POST").url, `/api/surveys/1/questions/${type}`);
    p.window.close();
  }
});

test("Nonexistent local times during the spring DST jump are rejected", async () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const p = page("survey");
    p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
    p.document.querySelector(".meetup-date-time").value = "2026-03-08T02:30";
    p.document.querySelector(".meetup-add").click();
    assert.equal(p.document.querySelectorAll(".meetup-selections li").length, 0);
    assert.match(p.toasts[0][0], /valid local date and time/);
    p.window.close();
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("Participants mix specific times and windows, with one shared date validation path", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  const input = p.document.querySelector(".meetup-date-time"), end = p.document.querySelector(".meetup-end-time");
  input.value = "2026-10-10T19:00"; p.document.querySelector(".meetup-add").click();
  const mode = p.document.querySelector(".meetup-entry-type");
  mode.value = "window"; mode.dispatchEvent(new p.window.Event("change"));
  assert.equal(p.document.querySelector(".meetup-end-label").hidden, false);
  input.value = "2026-10-11T18:00"; end.value = "2026-10-11T21:00";
  p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
  const entries = JSON.parse(p.calls.find(c => c.options.method === "POST").options.body).dateTimes;
  assert.deepEqual(entries, [new Date("2026-10-10T19:00").toISOString(), {
    dateTime: new Date("2026-10-11T18:00").toISOString(), endDateTime: new Date("2026-10-11T21:00").toISOString()
  }]);
  p.window.close();
});

test("Window validation rejects missing or non-increasing ends and retains input", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  p.document.querySelector(".meetup-entry-type").value = "window";
  const input = p.document.querySelector(".meetup-date-time"), end = p.document.querySelector(".meetup-end-time");
  input.value = "2026-10-11T18:00";
  for (const invalid of ["", "2026-10-11T18:00", "2026-10-11T17:00"]) {
    end.value = invalid; p.document.querySelector(".meetup-add").click();
    assert.equal(p.document.querySelectorAll(".meetup-selections li").length, 0);
    assert.equal(input.value, "2026-10-11T18:00");
  }
  p.window.close();
});

test("Saved windows restore in Vote and render both endpoints in participant View and results", async () => {
  const answer = { dateTime: "2026-10-11T18:00:00Z", endDateTime: "2026-10-11T21:00:00Z" };
  const p = page("survey", { "/api/surveys/1/questions/2/answers/meetup/7": [answer],
    "/api/surveys/1/questions/2/results/meetup": { available: true, results: [{ ...answer, votes: 2 }] } });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;"); await p.window.eval("loadQuestions()");
  assert.match(p.document.querySelector(".meetup-selections").textContent, / – /);
  assert.match(p.document.querySelector(".meetup-results").textContent, / – /);
  assert.equal(p.document.querySelector(".meetup-entry-type").disabled, true);
  assert.equal(p.document.querySelector(".meetup-end-time").disabled, true);
  p.window.close();
  const v = page("survey-participant-view", { "/api/surveys/1/questions/2/answers/meetup/7": [answer] });
  await v.window.eval("loadQuestions()"); v.document.querySelector('[title="View question"]').click(); await tick();
  assert.match(v.document.querySelector(".meetup-results").textContent, / – /); v.window.close();
});
