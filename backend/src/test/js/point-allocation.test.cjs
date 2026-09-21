const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "POINT_ALLOCATION", prompt: "Choose one", required: true,
  participantTemplateId: "point-allocation-participant-template", viewTemplateId: "point-allocation-view-template",
  editorTemplateId: "point-allocation-question-template" };
const detail = { ...question, pointBudget: 10, options: [{ id: 3, label: "First" }, { id: 4, label: "<b>Second</b>" }] };
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
  dom.window.eval(readFileSync(path.join(staticDir, "js/point-allocation.js"), "utf8"));
  dom.window.eval(readFileSync(path.join(staticDir, "js", `${name}.js`), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, toasts };
}


function enter(p, index, value) {
  const input = p.document.querySelectorAll(".point-allocation-options input")[index];
  input.value = value; input.dispatchEvent(new p.window.Event("input", { bubbles: true }));
}
test("Vote displays remaining budget and accepts unassigned points with canonical CSRF", async () => {
  const p = page("survey"); p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()"); enter(p, 0, "2"); enter(p, 1, "3");
  assert.match(p.document.querySelector(".point-allocation-remaining").textContent, /5 remaining/);
  assert.equal(p.document.querySelector(".point-allocation-options b"), null);
  p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.deepEqual(JSON.parse(post.options.body), { allocations: [{ optionId: 3, points: 2 }, { optionId: 4, points: 3 }] });
  assert.equal(post.options.headers["X-CSRF"], "test"); p.window.close();
});
test("Overspending, negatives and fractional points block submission", async () => {
  for (const values of [["6", "5"], ["-1", "0"], ["1.5", "0"]]) {
    const p = page("survey"); p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
    await p.window.eval("loadQuestions()"); enter(p, 0, values[0]); enter(p, 1, values[1]);
    p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
    assert.equal(p.calls.some(c => c.options.method === "POST"), false); p.window.close();
  }
});
test("Required needs one point; optional zero clears a saved allocation", async () => {
  for (const required of [true, false]) {
    const p = page("survey", { "/api/surveys/1/questions": [{ ...question, required }],
      "/api/surveys/1/questions/2/answers/point-allocation/7": [{ userId: 7, optionId: 3, points: 4 }] });
    p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;"); await p.window.eval("loadQuestions()");
    assert.equal(p.document.querySelector(".point-allocation-options input").value, "4"); enter(p, 0, "0");
    p.window.eval("initializeSurveySubmit()"); p.document.getElementById("submit-survey-button").click(); await tick();
    const post = p.calls.find(c => c.options.method === "POST");
    if (required) assert.equal(post, undefined); else assert.deepEqual(JSON.parse(post.options.body), { allocations: [] });
    p.window.close();
  }
});
test("Closed survey restores allocations with disabled inputs", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/point-allocation/7": [{ optionId: 4, points: 3 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;"); await p.window.eval("loadQuestions()");
  const inputs = [...p.document.querySelectorAll(".point-allocation-options input")];
  assert.ok(inputs.every(input => input.disabled)); assert.equal(inputs[1].value, "3"); p.window.close();
});
test("Editor restores budget and categories, validates budget, and uses shared save flow", async () => {
  const p = page("survey-edit"); await p.window.eval("loadQuestions()");
  p.document.querySelector('[title="Edit question"]').click(); await tick();
  const budget = p.document.getElementById("point-allocation-editor-budget"); assert.equal(budget.value, "10");
  assert.equal(p.document.querySelectorAll(".point-allocation-editor-option").length, 2);
  budget.value = "0"; p.document.getElementById("save-question-button").click(); await tick();
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  budget.value = "20"; p.document.getElementById("add-point-allocation-option").click();
  const rows = p.document.querySelectorAll(".point-allocation-editor-option"); rows[2].querySelector("input").value = "New";
  rows[1].querySelector("button").click(); p.document.getElementById("save-question-button").click(); await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/2/point-allocation");
  assert.deepEqual(JSON.parse(post.options.body).options, ["First", "New"]);
  assert.equal(JSON.parse(post.options.body).pointBudget, 20); p.window.close();
});
test("Editor commits a category locally when Enter is pressed", async () => {
  const p = page("survey-edit"); await p.window.eval("loadQuestions()");
  p.document.querySelector('[title="Edit question"]').click(); await tick();
  const input = p.document.querySelector(".point-allocation-editor-option input");
  input.value = "Updated"; input.focus();
  input.dispatchEvent(new p.window.KeyboardEvent("keydown", {
    key: "Enter", bubbles: true, cancelable: true
  }));
  await tick();
  assert.equal(p.calls.some(call => call.options.method === "POST"), false);
  assert.equal(p.document.getElementById("question-form-container").hidden, false);
  assert.equal(input.value, "Updated");
  p.window.close();
});
test("View shows totals and averages, including zero allocations, with escaped category text", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/answers/point-allocation": [
    { userId: 7, optionId: 3, points: 4 }, { userId: 7, optionId: 4, points: 0 },
    { userId: 8, optionId: 3, points: 2 }, { userId: 8, optionId: 4, points: 0 }] });
  await p.window.eval("loadQuestions()"); p.document.querySelector('[title="View question"]').click(); await tick();
  const container = p.document.querySelector(".point-allocation-results"), rows = container.querySelector("table").tBodies[0].rows;
  assert.deepEqual([...rows[0].cells].map(cell => cell.textContent), ["First", "6", "3"]);
  assert.deepEqual([...rows[1].cells].map(cell => cell.textContent), ["<b>Second</b>", "0", "0"]);
  assert.equal(container.querySelector("b, input"), null); p.window.close();
});
test("Participant View displays that person's points and unused budget; empty results stay empty", async () => {
  const p = page("survey-participant-view", { "/api/surveys/1/questions/2/answers/point-allocation/7": [
    { userId: 7, optionId: 3, points: 2 }, { userId: 7, optionId: 4, points: 0 }] });
  await p.window.eval("loadQuestions()"); p.document.querySelector('[title="View question"]').click(); await tick();
  assert.match(p.document.querySelector(".point-allocation-results").textContent, /8 remaining/); p.window.close();
  const v = page("survey-view"); await v.window.eval("loadQuestions()");
  v.document.querySelector('[title="View question"]').click(); await tick();
  assert.equal(v.document.querySelector(".point-allocation-results").textContent, "No points assigned yet."); v.window.close();
});
