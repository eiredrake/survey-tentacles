const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../../main/resources/static");
const tick = () => new Promise(resolve => setImmediate(resolve));

function page(questions, answer) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, "survey-participant-view.html"), "utf8"),
    { url: "http://localhost/survey-participant-view.html?id=1&userId=7", runScripts: "outside-only" });
  const calls = [], errors = [];
  dom.window.showToast = message => errors.push(message);
  dom.window.fetch = async url => {
    calls.push(url);
    return { ok: true, json: async () => url.endsWith("/questions") ? questions : answer(url) };
  };
  dom.window.eval(fs.readFileSync(path.join(root, "js/survey-participant-view.js"), "utf8").replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, errors };
}
const question = id => ({ id, prompt: `Question ${id}`, type: "SHORT_TEXT", viewTemplateId: "short-text-view-template" });

test("Participant answers load visibly without clicks and toggling does not refetch", async () => {
  const p = page([question(2), question(3)], url => [{ value: url.includes("/2/") ? "First response" : "Second response" }]);
  try {
    await p.window.loadQuestions();
    const rows = [...p.document.querySelectorAll(".question-detail-row")];
    assert.equal(rows.length, 2); assert.ok(rows.every(row => !row.hidden));
    assert.match(rows[0].textContent, /First response/); assert.match(rows[1].textContent, /Second response/);
    assert.ok(p.calls.slice(1).every(url => url.endsWith("/answers/short-text/7")));
    const button = p.document.querySelector('[title="View question"]');
    assert.equal(button.getAttribute("aria-expanded"), "true");
    button.click(); await tick(); assert.equal(rows[0].hidden, true);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    button.click(); await tick(); assert.equal(rows[0].hidden, false); assert.equal(p.calls.length, 3);
  } finally { p.dom.window.close(); }
});

test("A failed answer request does not prevent subsequent answers from opening", async () => {
  const p = page([question(2), question(3)], url => { if (url.includes("/2/")) throw new Error("Network failure"); return [{ value: "Still visible" }]; });
  try {
    await p.window.loadQuestions();
    const rows = [...p.document.querySelectorAll(".question-detail-row")];
    assert.ok(rows.every(row => !row.hidden)); assert.match(rows[1].textContent, /Still visible/); assert.equal(p.errors.length, 1);
  } finally { p.dom.window.close(); }
});

test("Every question type uses its existing renderer on initial participant view", async () => {
  const types = ["SCHEDULING", "MEETUP", "SHORT_TEXT", "RELATIONSHIP", "SINGLE_SELECT", "MULTI_SELECT", "YES_NO_ABSTAIN", "NOMINATION", "RANKED_CHOICE", "POINT_ALLOCATION"];
  const questions = types.map((type, id) => ({ id, type, prompt: type, viewTemplateId: `${type.toLowerCase().replaceAll("_", "-")}-view-template` }));
  const p = page(questions, () => []), rendered = [];
  try {
    for (const name of ["renderSchedulingAnswers", "renderShortTextAnswer", "renderRelationshipAnswers", "renderSelectAnswers", "renderNominationAnswers"])
      p.window[name] = async question => { rendered.push(question.type); };
    p.window.RankedChoice = p.window.PointAllocation = { renderResults: async (surveyId, question, container, userId) => {
      assert.equal(userId, "7"); rendered.push(question.type);
    } };
    await p.window.loadQuestions();
    assert.deepEqual(rendered, types);
    assert.ok([...p.document.querySelectorAll(".question-detail-row")].every(row => !row.hidden));
  } finally { p.dom.window.close(); }
});
