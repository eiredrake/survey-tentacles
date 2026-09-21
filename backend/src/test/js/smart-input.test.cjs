const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../../main/resources/static");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
function component(html = '<input id="field"><button id="away">Away</button>') {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/?id=1" });
  const errors = []; dom.window.showToast = error => errors.push(error);
  dom.window.eval(read("js/SmartInput.js"));
  return { dom, w: dom.window, d: dom.window.document, errors };
}
function enter(p, element) {
  const event = new p.w.KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true });
  element.dispatchEvent(event); return event;
}

test("One Enter produces one callback, preserves its reason, and guards an async save", async () => {
  const p = component(), input = p.d.getElementById("field"), calls = [];
  let finish;
  try {
    p.w.SmartInput.create({ target: input, onReadyToSave: (value, info) => {
      calls.push(info.reason); return new Promise(resolve => { finish = resolve; });
    } });
    input.focus(); assert.equal(enter(p, input).defaultPrevented, true);
    input.dispatchEvent(new p.w.Event("blur")); assert.deepEqual(calls, ["enter"]);
    finish(); await tick(); input.focus(); input.blur(); assert.deepEqual(calls, ["enter", "blur"]); finish();
  } finally { p.dom.window.close(); }
});

test("Multiline Enter is untouched; blur saves and destroy removes listeners", async () => {
  const p = component('<textarea id="field"></textarea>'), input = p.d.getElementById("field"); let calls = 0;
  try {
    const control = p.w.SmartInput.create({ target: input, type: "multi", onReadyToSave: () => { calls++; } });
    input.focus(); assert.equal(enter(p, input).defaultPrevented, false); assert.equal(calls, 0);
    input.blur(); assert.equal(calls, 1); control.destroy(); input.focus(); input.blur();
    await control.triggerSave(); assert.equal(calls, 1);
  } finally { p.dom.window.close(); }
});

test("Rejected async saves release the guard for retry; IME and repeat Enter do not save", async () => {
  const p = component(), input = p.d.getElementById("field"); let calls = 0;
  try {
    const control = p.w.SmartInput.create({ target: input, onReadyToSave: async () => {
      if (++calls === 1) throw new Error("Retry me");
    } });
    await control.triggerSave(); assert.deepEqual(p.errors, ["Retry me"]);
    await control.triggerSave(); assert.equal(calls, 2);
    for (const option of [{ isComposing: true }, { repeat: true }]) {
      input.dispatchEvent(new p.w.KeyboardEvent("keydown", { key: "Enter", ...option }));
    }
    assert.equal(calls, 2);
  } finally { p.dom.window.close(); }
});

function editor() {
  const p = component(read("survey-edit.html")), calls = [];
  p.w.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const value = url === "/csrf" ? { token: "test", headerName: "Server-Csrf" }
      : url.endsWith("/title") ? { title: "Renamed" } : url.endsWith("/tagline") ? { tagline: "  Tagline  " } : [];
    return { ok: true, json: async () => value };
  };
  p.w.eval(read("js/getCsrfToken.js"));
  p.w.eval(read("js/survey-edit.js").replace(/^initialize\(\);\s*$/m, ""));
  return { ...p, calls };
}

test("Title saves once on Enter, can be edited again, and tagline blur preserves raw payload", async () => {
  const p = editor();
  try {
    p.w.setupTitleEditor(); p.d.getElementById("edit-title-button").click();
    let input = p.d.querySelector(".editor-title input"); input.value = "Renamed"; enter(p, input); await tick();
    assert.equal(p.calls.filter(call => call.options.method === "POST").length, 1);
    p.d.getElementById("edit-title-button").click(); input = p.d.querySelector(".editor-title input");
    assert.ok(input); input.value = "Again"; input.blur(); await tick();
    p.w.setupTaglineEditor(); input = p.d.getElementById("survey-tagline"); input.value = "  Tagline  ";
    input.focus(); input.blur(); await tick();
    const saved = p.calls.find(call => call.url.endsWith("/tagline"));
    assert.deepEqual(JSON.parse(saved.options.body), { tagline: "  Tagline  " });
    assert.equal(saved.options.headers["Server-Csrf"], "test"); assert.equal(p.d.getElementById("save-survey-tagline"), null);
  } finally { p.dom.window.close(); }
});

test("Question blur saves the question, while option Enter commits the line locally", async () => {
  const p = editor();
  try {
    p.w.showQuestionEditor("short-text-question-template");
    let input = p.d.getElementById("short-text-editor-prompt"); input.value = "Feedback"; input.focus(); input.blur(); await tick();
    assert.deepEqual(JSON.parse(p.calls.find(call => call.options.method === "POST").options.body),
      { prompt: "Feedback", displayOrder: 1, required: false });
    p.w.showQuestionEditor("single-select-question-template");
    p.d.getElementById("single-select-editor-prompt").value = "Choose";
    p.d.getElementById("add-single-select-option").click(); input = p.d.querySelector("#single-select-editor-options input");
    input.value = "Option"; enter(p, input); await tick();
    const posts = p.calls.filter(call => call.options.method === "POST"); assert.equal(posts.length, 1);
    assert.equal(p.d.getElementById("question-form-container").hidden, false);
    assert.equal(input.value, "Option");
  } finally { p.dom.window.close(); }
});

test("Moving from character name to description keeps the staged row open; Enter commits it", async () => {
  const p = editor();
  try {
    p.w.showQuestionEditor("relationship-question-template");
    p.d.getElementById("show-relationship-subject-editor-button").click();
    const name = p.d.getElementById("relationship-editor-name"), description = p.d.getElementById("relationship-editor-description");
    name.value = "George"; description.focus();
    assert.equal(p.d.getElementById("relationship-subject-editor").hidden, false);
    description.value = "An NPC"; enter(p, description); await tick();
    assert.equal(p.d.getElementById("relationship-subject-editor").hidden, true);
    assert.match(p.d.getElementById("relationship-editor-subject-list").textContent, /George.*An NPC/);
    assert.equal(p.calls.length, 0);
  } finally { p.dom.window.close(); }
});

test("Clicking away to an outside control saves, but Cancel does not commit a question", async () => {
  const p = editor();
  try {
    p.w.showQuestionEditor("short-text-question-template");
    let input = p.d.getElementById("short-text-editor-prompt"); input.value = "Keep"; input.focus();
    p.d.getElementById("edit-title-button").focus(); await tick();
    assert.equal(p.calls.filter(call => call.options.method === "POST").length, 1);
    p.w.showQuestionEditor("short-text-question-template");
    input = p.d.getElementById("short-text-editor-prompt"); input.value = "Discard"; input.focus();
    const cancel = p.d.getElementById("cancel-question-button"); cancel.focus(); cancel.click(); await tick();
    assert.equal(p.calls.filter(call => call.options.method === "POST").length, 1);
  } finally { p.dom.window.close(); }
});
