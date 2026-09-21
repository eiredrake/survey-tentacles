const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "YES_NO_ABSTAIN", prompt: "Choose one", required: true,
  participantTemplateId: "single-select-participant-template", viewTemplateId: "single-select-view-template",
  editorTemplateId: "yes-no-abstain-question-template" };
const detail = { ...question, defaultOptionId: 99,
  options: [{ id: 3, label: "Yes" }, { id: 4, label: "No" }, { id: 99, label: "Abstain" }] };
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
  dom.window.eval(readFileSync(path.join(staticDir, "js", `${name}.js`), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, toasts };
}


test("Quick vote defaults from server metadata but does not save until Submit", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelector("input:checked").value, "99");
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/2/answers/single-select");
  assert.deepEqual(JSON.parse(post.options.body), { optionId: 99 });
  assert.equal(post.options.headers["X-CSRF"], "test"); p.window.close();
});

test("Saved vote overrides default, radios remain exclusive, reset restores Abstain", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/single-select/7": [{ optionId: 3 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelector("input:checked").value, "3");
  p.document.querySelector('input[value="4"]').click();
  assert.equal(p.document.querySelectorAll("input:checked").length, 1);
  assert.equal(p.document.querySelector("input:checked").value, "4");
  const reset = p.document.querySelector(".single-select-clear");
  assert.equal(reset.getAttribute("aria-label"), "Reset to Abstain"); reset.click();
  assert.equal(p.document.querySelector("input:checked").value, "99"); p.window.close();
});

test("Closed unanswered quick vote does not imply a recorded abstention", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;"); await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelector("input:checked"), null);
  assert.ok([...p.document.querySelectorAll(".single-select-options input")].every(input => input.disabled));
  assert.equal(p.document.querySelector(".single-select-clear").disabled, true); p.window.close();
});

test("Prompt-only quick vote editor creates and edits without editable options", async () => {
  for (const editing of [false, true]) {
    const p = page("survey-edit");
    if (editing) {
      await p.window.eval("loadQuestions()"); p.document.querySelector('[title="Edit question"]').click(); await tick();
    } else p.window.eval('showQuestionEditor("yes-no-abstain-question-template")');
    const prompt = p.document.getElementById("yes-no-abstain-editor-prompt");
    if (editing) assert.equal(prompt.value, question.prompt);
    prompt.value = "Do you agree?";
    assert.equal(p.document.querySelector(".single-select-editor-option"), null);
    p.document.getElementById("save-question-button").click(); await tick();
    const post = p.calls.find(c => c.options.method === "POST");
    assert.equal(post.url, `/api/surveys/1/questions/${editing ? "2/" : ""}yes-no-abstain`);
    assert.equal(JSON.parse(post.options.body).options, undefined); p.window.close();
  }
});

test("Existing View and participant View render quick votes without adding implicit abstentions", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/answers/single-select": [{ optionId: 3 }] });
  await p.window.eval("loadQuestions()"); p.document.querySelector('[title="View question"]').click(); await tick();
  const results = p.document.querySelector(".single-select-view-results");
  assert.match(results.textContent, /Yes: 1 vote/); assert.match(results.textContent, /Abstain: 0 votes/);
  assert.equal(results.querySelector("input"), null); p.window.close();
  const v = page("survey-participant-view", { "/api/surveys/1/questions/2/answers/single-select/7": [{ label: "Abstain", optionId: 99 }] });
  await v.window.eval("loadQuestions()"); v.document.querySelector('[title="View question"]').click(); await tick();
  assert.equal(v.document.querySelector(".single-select-view-results").textContent, "Abstain"); v.window.close();
});

test("Default uses returned option ID rather than label or position", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2": { ...detail, defaultOptionId: 4 } });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelector("input:checked").value, "4"); p.window.close();
});
