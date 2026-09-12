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

test("Vote restores only this participant's nominations and submits the edited list", async () => {
  const p = await voting({ "/api/surveys/1/questions/2/answers/nomination/7": [{ value: "Alien" }] });
  assert.equal(p.document.querySelector(".nomination-entry input").value, "Alien");
  p.add(" Arrival ");
  assert.equal(p.window.eval("hasUnsavedChanges"), true);
  assert.equal(p.document.querySelector(".nomination-add").disabled, true);
  await p.submit();
  const post = p.calls.find(c => c.url.endsWith("/answers/nomination"));
  assert.deepEqual(JSON.parse(post.options.body), { nominations: ["Alien", "Arrival"] });
  assert.equal(post.options.headers["X-CSRF"], "test");
  assert.equal(p.calls.at(-1).url, "/api/surveys/1/submitted");
  p.dom.window.close();
});

test("Required, blank and repeated nominations block submission", async () => {
  const p = await voting();
  await p.submit();
  p.add(" ");
  await p.submit();
  p.document.querySelector(".nomination-entry input").value = "Alien";
  p.add("Alien");
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
  assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body), { nominations: [] });
  p.dom.window.close();
});

test("Lowered limit preserves existing entries and requires removing extras before resubmitting", async () => {
  const p = await voting({ "/api/surveys/1/questions/2": { ...detail, maxNominations: 1 },
    "/api/surveys/1/questions/2/answers/nomination/7": [{ value: "Alien" }, { value: "Arrival" }] });
  assert.equal(p.document.querySelectorAll(".nomination-entry").length, 2);
  await p.submit();
  assert.equal(p.calls.some(c => c.options.method === "POST"), false);
  p.document.querySelector(".nomination-entry button").click();
  await p.submit();
  assert.deepEqual(JSON.parse(p.calls.find(c => c.options.method === "POST").options.body), { nominations: ["Arrival"] });
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

test("View displays nominations with their submitters and renders supplied text safely", async () => {
  const p = page("survey-view", { "/api/surveys/1/questions/2/answers/nomination": [
    { value: "<b>Alien</b>", name: "First" }, { value: "Alien", name: "Second" }] });
  await p.window.eval('renderNominationAnswers({ id: 2 }, document.getElementById("question-list"))');
  const container = p.document.getElementById("question-list");
  assert.match(container.textContent, /<b>Alien<\/b>FirstAlienSecond/);
  assert.equal(container.querySelector("b, input, button"), null);
  p.dom.window.close();
});

test("Participant View requests only the selected participant and handles no nominations", async () => {
  const p = page("survey-participant-view");
  await p.window.eval('renderNominationAnswers({ id: 2 }, document.getElementById("question-list"))');
  assert.equal(p.calls.at(-1).url, "/api/surveys/1/questions/2/answers/nomination/7");
  assert.equal(p.document.getElementById("question-list").textContent, "No nominations yet.");
  p.dom.window.close();
});
