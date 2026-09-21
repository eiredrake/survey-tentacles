const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../../main/resources/static");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function page(name, participants, fail = false) {
  const dom = new JSDOM(read(`${name}.html`), { url: "http://localhost/?id=1&userId=7", runScripts: "outside-only" });
  const calls = [], errors = [];
  dom.window.showToast = message => errors.push(message);
  dom.window.fetch = async url => {
    calls.push(url); assert.equal(url, "/api/surveys/1/participants");
    return { ok: !fail, json: async () => participants };
  };
  dom.window.eval(read("js/survey-participants.js"));
  dom.window.eval(read(`js/${name}.js`).replace(/^initialize\(\);\s*$/m, ""));
  return { dom, window: dom.window, document: dom.window.document, calls, errors };
}

test("Survey View shows all respondents and preserves required/completion display", async () => {
  const participants = [
    { userId: 2, name: "Assigned", required: true, completed: false, responded: false },
    { userId: 7, name: null, username: "Respondent", required: false, completed: true, responded: true },
    { userId: 8, name: "Partial", required: true, completed: false, responded: true }
  ];
  const p = page("survey-view", participants);
  try {
    await p.window.loadParticipants();
    const rows = [...p.document.querySelectorAll(".participants-table tbody tr")];
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent, /RespondentCompleted/);
    const partial = rows.find(row => row.textContent.includes("Partial"));
    assert.match(partial.textContent, /Incomplete/); assert.ok(partial.querySelector('[title="Required"]'));
    assert.match(partial.querySelector("a").href, /userId=8/); assert.equal(partial.classList.contains("participant-completed"), false);
    const assigned = rows.find(row => row.textContent.includes("Assigned"));
    assert.ok(assigned.querySelector('[title="Required"]')); assert.equal(assigned.querySelector("a"), null);
    await p.window.loadParticipants(); assert.equal(p.document.querySelectorAll(".participants-table").length, 1);
  } finally { p.dom.window.close(); }
});

test("Participant answer page resolves an unassigned respondent from the same collection", async () => {
  const p = page("survey-participant-view", [{ userId: 7, username: "Open survey voter", name: null }]);
  try {
    await p.window.loadParticipant();
    assert.equal(p.document.getElementById("participant-heading").textContent, "Open survey voter's Answers");
    assert.equal(p.errors.length, 0);
  } finally { p.dom.window.close(); }
});

test("Shared participant loader reports failure without rendering a partial table", async () => {
  const p = page("survey-view", [], true);
  try {
    await p.window.loadParticipants(); assert.equal(p.errors.length, 1);
    assert.equal(p.document.querySelector(".participants-table"), null);
  } finally { p.dom.window.close(); }
});

test("Both View pages load the shared participant client before their page script", () => {
  for (const name of ["survey-view", "survey-participant-view"]) {
    const html = read(`${name}.html`);
    assert.ok(html.indexOf('/js/survey-participants.js') < html.indexOf(`/js/${name}.js`));
  }
});
