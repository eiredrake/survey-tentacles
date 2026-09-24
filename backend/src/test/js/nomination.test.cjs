const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");
const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "NOMINATION", prompt: "Nominate movies", required: true,
  participantTemplateId: "nomination-participant-template", viewTemplateId: "nomination-view-template",
  editorTemplateId: "nomination-question-template" };
const detail = { ...question, maxNominations: 2 };
const tick = () => new Promise(resolve => setImmediate(resolve));

function page(name, replies = {}) {
  const dom = new JSDOM(readFileSync(path.join(staticDir, name + ".html"), "utf8"),
    { url: "http://localhost/?id=1&userId=7", runScripts: "outside-only" });
  const calls = [], toasts = [];
  const window = dom.window;
  window.eval = code => runInContext(code, dom.getInternalVMContext());
  window.showToast = (...args) => toasts.push(args);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const value = replies[url] ?? (url === "/csrf" ? { headerName: "X-CSRF", token: "test" }
      : url.endsWith("/questions") ? [question] : url.endsWith("/questions/2") ? detail : []);
    return { ok: value !== false, json: async () => value };
  };
  window.eval(readFileSync(path.join(staticDir, "js/getCsrfToken.js"), "utf8"));
  window.eval(readFileSync(path.join(staticDir, "js/SmartInput.js"), "utf8"));
  window.eval(readFileSync(path.join(staticDir, "js", name + ".js"), "utf8").replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window, document: window.document, calls, toasts };
}

async function voting(replies = {}, accepting = true) {
  const p = page("survey", replies);
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = " + accepting + ";");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  p.submit = async () => { p.document.getElementById("submit-survey-button").click(); await tick(); };
  p.add = value => {
    p.document.querySelector(".nomination-add").click();
    const input = [...p.document.querySelectorAll(".nomination-entry input")].at(-1);
    input.value = value;
    input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  };
  return p;
}

test("Vote shows the shared pool and submits canonical selections with new text", async () => {
  const p = await voting({ "/api/surveys/1/questions/2/nomination-pool": [
    { canonicalId: 8, displayName: "Alien", selected: true }, { canonicalId: 9, displayName: "Arrival", selected: false }] });
  const choices = p.document.querySelectorAll('.nomination-option input');
  assert.equal(p.document.querySelector('.nomination-options table').className, "survey-table");
  assert.equal(choices.length, 2); assert.equal(choices[0].checked, true);
  choices[1].checked = true; choices[1].dispatchEvent(new p.window.Event("change", { bubbles: true }));
  assert.equal(p.window.eval("hasUnsavedChanges"), true);
  await p.submit();
  const post = p.calls.find(c => c.url.endsWith("/answers/nomination"));
  assert.deepEqual(JSON.parse(post.options.body), { canonicalIds: [8, 9], nominations: [] });
  assert.equal(post.options.headers["X-CSRF"], "test");
  assert.equal(p.calls.at(-1).url, "/api/surveys/1/submitted");
  p.dom.window.close();
});

test("Required and blank new nominations block submission", async () => {
  const p = await voting();
  await p.submit();
  p.add(" ");
  await p.submit();
  p.document.querySelector(".nomination-entry input").value = " ";
  await p.submit();
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  p.dom.window.close();
});

test("Optional nominations can all be removed and unlimited allows more than two", async () => {
  const p = await voting({ "/api/surveys/1/questions": [{ ...question, required: false }],
    "/api/surveys/1/questions/2": { ...detail, maxNominations: 0 } });
  for (const value of ["Alien", "Arrival", "Dune"]) p.add(value);
  assert.equal(p.document.querySelectorAll(".nomination-entry").length, 3);
  for (const remove of p.document.querySelectorAll(".nomination-entry button")) remove.click();
  await p.submit();
  assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body), { canonicalIds: [], nominations: [] });
  p.dom.window.close();
});

test("Lowered limit counts selected shared nominations", async () => {
  const p = await voting({ "/api/surveys/1/questions/2": { ...detail, maxNominations: 1 },
    "/api/surveys/1/questions/2/nomination-pool": [{ canonicalId: 8, displayName: "Alien", selected: true },
      { canonicalId: 9, displayName: "Arrival", selected: true }] });
  await p.submit();
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  p.document.querySelector('.nomination-option input').click();
  await p.submit();
  assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body), { canonicalIds: [9], nominations: [] });
  p.dom.window.close();
});

test("Non-accepting survey disables nomination input, add, remove and submit", async () => {
  const p = await voting({ "/api/surveys/1/questions/2/answers/nomination/7": [{ value: "Alien" }] }, false);
  assert.equal([...p.document.querySelectorAll(".nomination-entry input, .nomination-entry button, .nomination-add, #submit-survey-button")]
    .every(control => control.disabled), true);
  p.dom.window.close();
});

test("Editor creates a nomination question with the configured limit and existing icon controls", async () => {
  const p = page("survey-edit");
  p.window.eval('showQuestionEditor("nomination-question-template")');
  const prompt = p.document.getElementById("nomination-editor-prompt");
  prompt.value = "Movies";
  prompt.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  p.document.getElementById("nomination-editor-maximum").value = "3";
  p.document.querySelector(".question-required").checked = true;
  assert.equal(p.window.eval("hasUnsavedChanges()"), true);
  assert.ok(p.document.querySelector("#save-question-button .fa-floppy-disk"));
  assert.ok(p.document.querySelector("#cancel-question-button .fa-xmark"));
  p.document.getElementById("save-question-button").click();
  await tick();
  const saved = p.calls.find(c => c.options.method === "POST");
  assert.equal(saved.url, "/api/surveys/1/questions/nomination");
  assert.deepEqual(JSON.parse(saved.options.body), { prompt: "Movies", maxNominations: 3, displayOrder: 1, required: true });
  assert.equal(p.window.eval("hasUnsavedChanges()"), false);
  p.dom.window.close();
});

test("Editing restores settings, rejects a negative limit, and retains input on save failure", async () => {
  const p = page("survey-edit", { "/api/surveys/1/questions/2/nomination": false });
  await p.window.eval("loadQuestions()");
  p.document.querySelector('button[title="Edit question"]').click();
  await tick();
  assert.equal(p.document.getElementById("nomination-editor-maximum").value, "2");
  p.document.getElementById("nomination-editor-maximum").value = "-1";
  p.document.getElementById("save-question-button").click();
  await tick();
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  p.document.getElementById("nomination-editor-maximum").value = "4";
  p.document.getElementById("save-question-button").click();
  await tick();
  assert.equal(p.document.getElementById("nomination-editor-prompt").value, "Nominate movies");
  assert.equal(p.toasts.at(-1)[1], "error");
  p.dom.window.close();
});

test("View aggregates canonical nominations and posts selected raw entries safely", async () => {
  const raw = [{ answerId: 3, value: "<b>Alien</b>", name: "First" },
    { answerId: 4, value: "Alien", name: "Second" }];
  const p = page("survey-view", {
    "/api/surveys/1/questions/2/nomination-results": [{ displayName: "Alien", count: 2, answers: raw }],
    "/api/surveys/1/questions/2/canonical-nominations": { canonicalNominations: [], answers: raw }
  });
  await p.window.eval('renderNominationAnswers({ id: 2 }, document.getElementById("question-list"))');
  const container = p.document.getElementById("question-list");
  assert.match(container.textContent, /Alien — 2 nominations/);
  assert.match(container.textContent, /<b>Alien<\/b> — First/);
  assert.equal(container.querySelector("b"), null);
  const checks = container.querySelectorAll('input[type="checkbox"]');
  checks[0].checked = true;
  checks[1].checked = true;
  const name = container.querySelector('input[placeholder="Canonical display name"]');
  name.value = "Alien";
  container.querySelector('button[title="Apply consolidation"]').click();
  await tick();
  const save = p.calls.find(call => call.url.endsWith("/canonical-nominations") && call.options.method === "POST");
  assert.deepEqual(JSON.parse(save.options.body), { answerIds: [3, 4], displayName: "Alien" });
  assert.equal(save.options.headers["X-CSRF"], "test");
  p.dom.window.close();
});

test("Participant View requests only the selected participant and handles no nominations", async () => {
  const p = page("survey-participant-view");
  await p.window.eval('renderNominationAnswers({ id: 2 }, document.getElementById("question-list"))');
  assert.equal(p.calls.at(-1).url, "/api/surveys/1/questions/2/answers/nomination/7");
  assert.equal(p.document.getElementById("question-list").textContent, "No nominations yet.");
  p.dom.window.close();
});
