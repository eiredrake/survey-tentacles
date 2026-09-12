const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "MULTI_SELECT", prompt: "Choose any", required: true,
  participantTemplateId: "multi-select-participant-template", viewTemplateId: "multi-select-view-template",
  editorTemplateId: "multi-select-question-template" };
const detail = { ...question, options: [{ id: 3, label: "First" }, { id: 4, label: "<b>Second</b>" }] };
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
  dom.window.eval(readFileSync(path.join(staticDir, "js", `${name}.js`), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, toasts };
}

test("Vote restores a selection, allows multiple checkboxes, and submits every selected option", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/multi-select/7": [{ optionId: 3 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  const checkboxs = [...p.document.querySelectorAll('input[type="checkbox"]')];
  assert.equal(checkboxs.length, 2);
  assert.equal(checkboxs[0].checked, true);
  checkboxs[1].click();
  assert.equal(checkboxs[0].checked, true);
  assert.equal(checkboxs[1].checked, true);
  assert.equal(p.document.querySelector(".multi-select-options b"), null);
  p.document.getElementById("submit-survey-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.deepEqual(JSON.parse(post.options.body), { optionIds: [3, 4] });
  assert.equal(post.options.headers["X-CSRF"], "test");
  assert.equal(p.document.body.textContent.includes("Results"), false);
  p.dom.window.close();
});

test("Required selection blocks submission; optional selection can be cleared", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click();
  await tick();
  assert.equal(p.calls.some(call => call.options.method === "POST"), false);
  p.dom.window.close();

  const optional = page("survey", { "/api/surveys/1/questions": [{ ...question, required: false }] });
  optional.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await optional.window.eval("loadQuestions()");
  optional.document.querySelector("input[type=checkbox]").click();
  optional.document.querySelector(".multi-select-clear").click();
  assert.equal(optional.document.querySelector("input:checked"), null);
  optional.window.eval("initializeSurveySubmit()");
  optional.document.getElementById("submit-survey-button").click();
  await tick();
  assert.deepEqual(JSON.parse(optional.calls.find(call => call.options.method === "POST").options.body), { optionIds: [] });
  optional.dom.window.close();
});

test("Non-accepting surveys keep checkboxs, clear, and submit disabled", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  assert.equal([...p.document.querySelectorAll("input[type=checkbox]")].every(input => input.disabled), true);
  assert.equal(p.document.querySelector(".multi-select-clear").disabled, true);
  assert.equal(p.document.getElementById("submit-survey-button").disabled, true);
  p.dom.window.close();
});

test("Editor adds, edits, removes, tracks dirty state, and sends labels in order", async () => {
  const p = page("survey-edit");
  p.window.eval('showQuestionEditor("multi-select-question-template")');
  p.document.getElementById("multi-select-editor-prompt").value = "Pick";
  const add = p.document.getElementById("add-multi-select-option");
  assert.equal(add.classList.contains("icon-button"), true);
  assert.ok(add.querySelector(".fa-plus"));
  assert.equal(add.getAttribute("aria-label"), "Add option");
  add.click(); add.click(); add.click();
  const rows = [...p.document.querySelectorAll(".multi-select-editor-option")];
  rows[0].querySelector("input").value = "First";
  rows[1].querySelector("input").value = "Remove me";
  rows[2].querySelector("input").value = "Last";
  assert.ok(rows[1].querySelector("button.icon-button .fa-xmark"));
  assert.ok(p.document.querySelector("#save-question-button .fa-floppy-disk"));
  rows[1].querySelector("button").click();
  assert.equal(p.window.eval('dirtySources.has("question")'), true);
  p.document.getElementById("save-question-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/multi-select");
  assert.deepEqual(JSON.parse(post.options.body).options, ["First", "Last"]);
  assert.equal(p.window.eval('dirtySources.has("question")'), false);
  p.dom.window.close();
});

test("View shows counts including zero votes and renders option labels as text", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/answers/multi-select":
    [{ optionId: 3, name: "Voter" }] });
  await p.window.eval('renderSelectResults({ id: 2, type: "MULTI_SELECT" }, document.getElementById("question-list"))');
  const container = p.document.getElementById("question-list");
  assert.match(container.textContent, /First: 1 vote/);
  assert.match(container.textContent, /<b>Second<\/b>: 0 votes/);
  assert.equal(container.querySelector("b"), null);
  assert.equal(container.querySelector("input"), null);
  p.dom.window.close();
});

test("Participant View displays only the selected participant's answer", async () => {
  const p = page("survey-participant-view");
  p.window.fetch = async url => {
    assert.match(url, /\/answers\/multi-select\/7$/);
    return { ok: true, json: async () => [{ label: "First" }, { label: "Second" }] };
  };
  await p.window.eval('renderSelectAnswers({ id: 2, type: "MULTI_SELECT" }, document.getElementById("question-list"))');
  assert.equal(p.document.getElementById("question-list").textContent, "FirstSecond");
  p.dom.window.close();
});

test("Multi Select restores every saved choice and can deselect one without changing another", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/multi-select/7": [{ optionId: 3 }, { optionId: 4 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  const inputs = [...p.document.querySelectorAll(".multi-select-options input")];
  assert.equal(inputs.every(input => input.checked), true);
  inputs[0].click();
  assert.equal(inputs[1].checked, true);
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click();
  await tick();
  assert.deepEqual(JSON.parse(p.calls.find(call => call.options.method === "POST").options.body), { optionIds: [4] });
  p.dom.window.close();
});

test("Single and Multi Select coexist without changing each other's selections", async () => {
  const single = { ...question, id: 8, type: "SINGLE_SELECT", participantTemplateId: "single-select-participant-template" };
  const p = page("survey", {
    "/api/surveys/1/questions": [question, single],
    "/api/surveys/1/questions/8": { ...detail, id: 8 }
  });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  const checkboxes = [...p.document.querySelectorAll(".multi-select-options input")];
  const radios = [...p.document.querySelectorAll(".single-select-options input")];
  checkboxes.forEach(input => input.click());
  radios.forEach(input => input.click());
  assert.equal(checkboxes.every(input => input.checked), true);
  assert.equal(radios[0].checked, false);
  assert.equal(radios[1].checked, true);
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click();
  await tick();
  const posts = p.calls.filter(call => call.options.method === "POST" && !call.url.endsWith("/submitted"));
  assert.equal(posts.length, 2);
  assert.deepEqual(JSON.parse(posts[0].options.body), { optionIds: [3, 4] });
  assert.deepEqual(JSON.parse(posts[1].options.body), { optionId: 4 });
  p.dom.window.close();
});

test("Editing an existing Multi Select question restores its options and posts an update", async () => {
  const p = page("survey-edit");
  await p.window.eval("loadQuestions()");
  p.document.querySelector('button[title="Edit question"]').click();
  await tick();
  const inputs = [...p.document.querySelectorAll(".multi-select-editor-option input")];
  assert.deepEqual(inputs.map(input => input.value), ["First", "<b>Second</b>"]);
  inputs[1].value = "Updated";
  p.document.getElementById("save-question-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/2/multi-select");
  assert.deepEqual(JSON.parse(post.options.body).options, ["First", "Updated"]);
  p.dom.window.close();
});
