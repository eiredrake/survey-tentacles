const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "SINGLE_SELECT", prompt: "Choose one", required: true,
  participantTemplateId: "single-select-participant-template", viewTemplateId: "single-select-view-template",
  editorTemplateId: "single-select-question-template" };
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

test("Vote restores a selection, keeps radio groups exclusive, and submits only the selected option", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/single-select/7": [{ optionId: 3 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  const radios = [...p.document.querySelectorAll('input[type="radio"]')];
  assert.equal(radios.length, 2);
  assert.equal(radios[0].checked, true);
  radios[1].click();
  assert.equal(radios[0].checked, false);
  assert.equal(radios[1].checked, true);
  assert.equal(p.document.querySelector(".single-select-options b"), null);
  p.document.getElementById("submit-survey-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.deepEqual(JSON.parse(post.options.body), { optionId: 4 });
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
  optional.document.querySelector("input[type=radio]").click();
  optional.document.querySelector(".single-select-clear").click();
  assert.equal(optional.document.querySelector("input:checked"), null);
  optional.window.eval("initializeSurveySubmit()");
  optional.document.getElementById("submit-survey-button").click();
  await tick();
  assert.deepEqual(JSON.parse(optional.calls.find(call => call.options.method === "POST").options.body), { optionId: null });
  optional.dom.window.close();
});

test("Non-accepting surveys keep radios, clear, and submit disabled", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;");
  await p.window.eval("loadQuestions()");
  p.window.eval("initializeSurveySubmit()");
  assert.equal([...p.document.querySelectorAll("input[type=radio]")].every(input => input.disabled), true);
  assert.equal(p.document.querySelector(".single-select-clear").disabled, true);
  assert.equal(p.document.getElementById("submit-survey-button").disabled, true);
  p.dom.window.close();
});

test("Editor adds, edits, removes, tracks dirty state, and sends labels in order", async () => {
  const p = page("survey-edit");
  p.window.eval('showQuestionEditor("single-select-question-template")');
  p.document.getElementById("single-select-editor-prompt").value = "Pick";
  const add = p.document.getElementById("add-single-select-option");
  add.click(); add.click(); add.click();
  const rows = [...p.document.querySelectorAll(".single-select-editor-option")];
  rows[0].querySelector("input").value = "First";
  rows[1].querySelector("input").value = "Remove me";
  rows[2].querySelector("input").value = "Last";
  rows[1].querySelector("button").click();
  assert.equal(p.window.eval('dirtySources.has("question")'), true);
  p.document.getElementById("save-question-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/single-select");
  assert.deepEqual(JSON.parse(post.options.body).options, ["First", "Last"]);
  assert.equal(p.window.eval('dirtySources.has("question")'), false);
  p.dom.window.close();
});

test("View shows counts including zero votes and renders option labels as text", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/answers/single-select":
    [{ optionId: 3, name: "Voter" }] });
  await p.window.eval('renderSelectResults({ id: 2 }, document.getElementById("question-list"))');
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
    assert.match(url, /\/answers\/single-select\/7$/);
    return { ok: true, json: async () => [{ label: "First" }] };
  };
  await p.window.eval('renderSelectAnswers({ id: 2 }, document.getElementById("question-list"))');
  assert.equal(p.document.getElementById("question-list").textContent, "First");
  p.dom.window.close();
});
