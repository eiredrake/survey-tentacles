const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { runInContext } = require("node:vm");

const staticDir = path.resolve(__dirname, "../../main/resources/static");
const question = { id: 2, type: "RANKED_CHOICE", prompt: "Choose any", required: true,
  participantTemplateId: "ranked-choice-participant-template", viewTemplateId: "ranked-choice-view-template",
  editorTemplateId: "ranked-choice-question-template" };
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
  dom.window.eval(readFileSync(path.join(staticDir, "js/icon-button.js"), "utf8"));
  dom.window.eval(readFileSync(path.join(staticDir, "js/ranked-choice.js"), "utf8"));
  dom.window.eval(readFileSync(path.join(staticDir, "js", `${name}.js`), "utf8")
    .replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, toasts };
}


test("Vote starts unselected, permits a partial ballot, and uses canonical CSRF", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  assert.equal(p.document.querySelectorAll("input:checked").length, 0);
  p.document.querySelectorAll("input[type=checkbox]")[1].click();
  assert.equal(p.document.querySelector(".ranked-choice-content b"), null);
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click();
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.deepEqual(JSON.parse(post.options.body), { optionIds: [4] });
  assert.equal(post.options.headers["X-CSRF"], "test");
  p.window.close();
});

test("Vote restores preference order, allows arrow changes and deselection", async () => {
  const p = page("survey", { "/api/surveys/1/questions/2/answers/ranked-choice/7": [
    { optionId: 4, rank: 1 }, { optionId: 3, rank: 2 }] });
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.window.eval("loadQuestions()");
  assert.match(p.document.querySelector(".ranked-choice-row").textContent, /Second/);
  p.document.querySelector('[aria-label="Move down"]').click();
  assert.match(p.document.querySelector(".ranked-choice-row").textContent, /First/);
  p.document.querySelector("input[type=checkbox]").click();
  p.window.eval("initializeSurveySubmit()");
  p.document.getElementById("submit-survey-button").click();
  await tick();
  assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body), { optionIds: [4] });
  p.window.close();
});

test("Required empty rankings block submission; optional rankings can be cleared", async () => {
  for (const required of [true, false]) {
    const p = page("survey", { "/api/surveys/1/questions": [{ ...question, required }] });
    p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
    await p.window.eval("loadQuestions()");
    p.window.eval("initializeSurveySubmit()");
    p.document.getElementById("submit-survey-button").click();
    await tick();
    const post = p.calls.find(c => c.options.method === "POST");
    if (required) assert.equal(post, undefined);
    else assert.deepEqual(JSON.parse(post.options.body), { optionIds: [] });
    p.window.close();
  }
});

test("Closed surveys disable ranking controls", async () => {
  const p = page("survey");
  p.window.eval("currentUser = { id: 7 }; surveyAcceptingResponses = false;");
  await p.window.eval("loadQuestions()");
  assert.ok([...p.document.querySelectorAll(".ranked-choice-row input, .ranked-choice-row button")].every(c => c.disabled));
  assert.ok([...p.document.querySelectorAll(".ranked-choice-row")].every(row => !row.draggable));
  p.window.close();
});

test("Editor preserves candidate IDs and edits descriptions using shared save flow", async () => {
  const p = page("survey-edit");
  p.window.eval('showQuestionEditor("ranked-choice-question-template"); editingQuestionId = 2;');
  const container = p.document.getElementById("ranked-choice-editor-options");
  container.ranking.setOptions(detail.options);
  p.document.getElementById("ranked-choice-editor-prompt").value = "Rank these";
  const description = container.querySelector('[aria-label="Candidate description"]');
  description.value = "Changed";
  description.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  container.querySelector('[aria-label="Move down"]').click();
  p.document.getElementById("save-question-button").click();
  await tick();
  const post = p.calls.find(c => c.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/questions/2/ranked-choice");
  const data = JSON.parse(post.options.body);
  assert.deepEqual(data.options.map(o => o.id), [4, 3]);
  assert.equal(data.options[1].description, "Changed");
  p.window.close();
});

test("Editor drag/drop and arrow controls share ordering; add and remove remain editable", () => {
  const p = page("survey-edit");
  p.window.eval('showQuestionEditor("ranked-choice-question-template")');
  const container = p.document.getElementById("ranked-choice-editor-options");
  container.ranking.setOptions(detail.options);
  const rows = container.querySelectorAll("li");
  const transfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  for (const [type, row] of [["dragstart", rows[1]], ["dragover", rows[0]], ["drop", rows[0]]]) {
    const event = new p.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    row.dispatchEvent(event);
  }
  assert.deepEqual(Array.from(container.ranking.getOptions(), o => o.id), [4, 3]);
  p.document.getElementById("add-ranked-choice-option").click();
  assert.equal(container.querySelectorAll("li").length, 3);
  container.querySelector('[aria-label="Remove candidate"]').click();
  assert.equal(container.querySelectorAll("li").length, 2);
  assert.equal(p.window.eval('dirtySources.has("question")'), true);
  p.window.close();
});

test("Both read-only views show ordered partial ballots without voting controls or tally", async () => {
  for (const name of ["survey-view", "survey-participant-view"]) {
    const suffix = name === "survey-view" ? "" : "/7";
    const p = page(name, { [`/api/surveys/1/questions/2/answers/ranked-choice${suffix}`]: [
      { userId: 7, name: "Voter", optionId: 4, rank: 1 }] });
    await p.window.eval("loadQuestions()");
    p.document.querySelector('button[title="View question"]').click();
    await tick();
    const container = p.document.querySelector(".ranked-choice-view-results");
    assert.ok(container);
    assert.equal(container.querySelectorAll("li").length, 1);
    assert.match(container.textContent, /Second description/);
    assert.equal(container.querySelector("button, input, b"), null);
    p.window.close();
  }
});
