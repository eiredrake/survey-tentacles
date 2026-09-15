const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInContext } = require("node:vm");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const staticDir = path.resolve(__dirname, "../../main/resources/static");
const tick = () => new Promise(resolve => setImmediate(resolve));
const question = { id: 2, type: "RELATIONSHIP", prompt: "Relationships", required: false,
  participantTemplateId: "relationship-participant-template", editorTemplateId: "relationship-question-template",
  viewTemplateId: "relationship-view-template" };
const detail = { ...question, subjects: [{ id: 3, name: "<Arlo>", description: "Character", displayOrder: 0 }] };
const image = (type, id, version = "old") => ({ ownerType: type, ownerId: id, contentType: "image/gif", size: 90,
  url: "/api/surveys/1/images/" + type + "/" + id + "?v=" + version });

function page(name) {
  const dom = new JSDOM(readFileSync(path.join(staticDir, name + ".html"), "utf8"),
    { url: "http://localhost/?id=1&userId=7", runScripts: "outside-only" });
  const window = dom.window, document = window.document, calls = [];
  const evaluate = code => runInContext(code, dom.getInternalVMContext());
  let failSave = false;
  window.showToast = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    let value = [];
    if (url === "/csrf") value = { headerName: "X-CSRF", token: "test" };
    else if (url.endsWith("/questions")) value = [question];
    else if (url.endsWith("/questions/2")) value = detail;
    else if (url.endsWith("/questions/2/images")) value = [image("QUESTION", 2), image("RELATIONSHIP_SUBJECT", 3)];
    else if (url.includes("/answers/relationship")) value = [{ subjectId: 3, userId: 7, name: "Voter", likeScore: 2, trustScore: 1, comment: "Hello" }];
    else if (options.method === "POST" && url.includes("/images/")) {
      const parts = url.split("/"); value = image(parts.at(-2), Number(parts.at(-1)), "new");
    }
    return { ok: !(failSave && (options.method === "POST" || options.method === "DELETE")), json: async () => value };
  };
  for (const script of ["question-images", name]) {
    evaluate(readFileSync(path.join(staticDir, "js", script + ".js"), "utf8").replace(/^initialize\(\);\s*$/m, ""));
  }
  return { dom, window, document, calls, evaluate, fail: () => { failSave = true; } };
}

test("Vote displays a question image and portrait beside the visible character name", async () => {
  const p = page("survey");
  p.evaluate("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
  await p.evaluate("loadQuestions()");
  assert.equal(p.document.querySelectorAll("#questions .image-thumbnail").length, 2);
  assert.equal(p.document.querySelectorAll(".question-image").length, 1);
  const cell = p.document.querySelector(".relationship-subjects td");
  assert.match(cell.textContent, /<Arlo>/);
  assert.equal(cell.querySelector("arlo"), null);
  assert.equal(cell.querySelector("img").src.endsWith("?v=old"), true);
  assert.equal(p.document.querySelector(".content-image-editor"), null);
  assert.equal(p.calls.filter(call => call.url.endsWith("/questions/2/images")).length, 1);
  p.dom.window.close();
});

test("Larger portrait uses the same animated source and does not toggle a surrounding row", async () => {
  const p = page("survey-view");
  p.document.body.appendChild(p.document.getElementById("relationship-view-template").content.cloneNode(true));
  const container = p.document.querySelector(".relationship-view-results");
  await p.evaluate('renderRelationshipResults({ id: 2 }, document.querySelector(".relationship-view-results"))');
  const button = container.querySelector(".image-thumbnail");
  const row = button.closest("tr");
  let toggles = 0;
  row.addEventListener("click", () => toggles++);
  button.click();
  assert.equal(toggles, 0);
  const dialog = p.document.querySelector("dialog");
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector("img").src, button.querySelector("img").src);
  dialog.querySelector("button").click();
  assert.equal(p.document.querySelector("dialog"), null);
  assert.equal(p.document.activeElement, button);
  p.dom.window.close();
});

test("Participant View shows the portrait and requests only the selected participant's answers", async () => {
  const p = page("survey-participant-view");
  await p.evaluate('renderRelationshipAnswers({ id: 2 }, document.getElementById("question-list"))');
  assert.equal(p.document.querySelectorAll("#question-list .image-thumbnail").length, 1);
  assert.ok(p.calls.some(call => call.url.endsWith("/answers/relationship/7")));
  assert.equal(p.document.querySelector("input[type=file]"), null);
  p.dom.window.close();
});

async function editor() {
  const p = page("survey-edit");
  await p.evaluate("loadQuestions()");
  p.document.querySelector('button[title="Edit images"]').click();
  await tick();
  return p;
}

test("Shared editor uploads GIF with CSRF, replaces preview and removes without saving question fields", async () => {
  const p = await editor();
  p.evaluate('markDirty("question")');
  const panels = p.document.querySelectorAll(".content-image-editor");
  assert.equal(panels.length, 2);
  const panel = panels[1];
  const picker = panel.querySelector("input");
  assert.match(picker.accept, /image\/gif/);
  Object.defineProperty(picker, "files", { value: [new p.window.File(["GIF89a"], "portrait.gif", { type: "image/gif" })] });
  picker.dispatchEvent(new p.window.Event("change"));
  await tick();
  const post = p.calls.find(call => call.options.method === "POST");
  assert.equal(post.url, "/api/surveys/1/images/RELATIONSHIP_SUBJECT/3");
  assert.equal(post.options.headers["X-CSRF"], "test");
  assert.equal(post.options.body.get("file").type, "image/gif");
  assert.equal(panel.querySelector("img").src.endsWith("?v=new"), true);
  assert.equal(p.evaluate("hasUnsavedChanges()"), true);
  panel.querySelector('button[title^="Remove image"]').click();
  await tick();
  assert.equal(panel.querySelector("img"), null);
  assert.equal(p.calls.at(-1).options.method, "DELETE");
  assert.equal(p.calls.some(call => call.options.method === "POST" && call.url.endsWith("/relationship")), false);
  p.dom.window.close();
});

test("Failed replacement keeps the previous preview and re-enables the controls", async () => {
  const p = await editor();
  p.fail();
  const panel = p.document.querySelector(".content-image-editor");
  const picker = panel.querySelector("input");
  Object.defineProperty(picker, "files", { value: [new p.window.File(["GIF89a"], "portrait.gif", { type: "image/gif" })] });
  picker.dispatchEvent(new p.window.Event("change"));
  await tick();
  assert.equal(panel.querySelector("img").src.endsWith("?v=old"), true);
  assert.match(panel.querySelector('[role="status"]').textContent, /Unable to save/);
  assert.equal(panel.querySelector('button[title^="Upload"]').disabled, false);
  p.dom.window.close();
});

test("Unsupported files are rejected before upload", async () => {
  const p = await editor();
  const panel = p.document.querySelector(".content-image-editor");
  const picker = panel.querySelector("input");
  Object.defineProperty(picker, "files", { value: [new p.window.File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })] });
  picker.dispatchEvent(new p.window.Event("change"));
  await tick();
  assert.equal(p.calls.some(call => call.options.method === "POST"), false);
  assert.match(panel.querySelector('[role="status"]').textContent, /PNG/);
  p.dom.window.close();
});

test("Relationship editor sends existing subject identity when saving ordinary edits", async () => {
  const p = page("survey-edit");
  await p.evaluate("loadQuestions()");
  p.document.querySelector('button[title="Edit question"]').click();
  await tick();
  assert.equal(p.document.querySelector(".relationship-subject").dataset.subjectId, "3");
  p.document.getElementById("save-question-button").click();
  await tick();
  const post = p.calls.find(call => call.url.endsWith("/relationship") && call.options.method === "POST");
  assert.equal(JSON.parse(post.options.body).subjects[0].id, 3);
  p.dom.window.close();
});

test("All question pages include the shared controls and survey upload accepts GIF", () => {
  for (const name of ["survey", "survey-edit", "survey-view", "survey-participant-view"]) {
    assert.match(readFileSync(path.join(staticDir, name + ".html"), "utf8"), /src="\/js\/question-images.js"/);
  }
  assert.match(readFileSync(path.join(staticDir, "survey-edit.html"), "utf8"), /accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
});

test("Character descriptions expose a tooltip and safe full-text dialog without changing answers", async () => {
  const p = page("survey"), previous = detail.subjects[0].description;
  try {
    detail.subjects[0].description = "First line\n<script>unsafe()</script>\n" + "LongDescription".repeat(100);
    p.evaluate("currentUser = { id: 7 }; surveyAcceptingResponses = true;");
    await p.evaluate("loadQuestions()");
    const info = p.document.querySelector(".character-description-button");
    assert.equal(info.title, detail.subjects[0].description);
    assert.equal(info.getAttribute("aria-haspopup"), "dialog");
    assert.equal(info.getAttribute("aria-label"), "Description for <Arlo>");
    const comment = p.document.querySelector(".relationship-comment");
    comment.value = "Unsaved comment";
    const callCount = p.calls.length;
    info.click();
    const dialog = p.document.querySelector(".character-description-dialog");
    assert.equal(dialog.open, true);
    assert.equal(dialog.querySelector("p").textContent, detail.subjects[0].description);
    assert.equal(dialog.querySelector("script"), null);
    assert.equal(dialog.querySelector("h2").textContent, "<Arlo>");
    dialog.querySelector("button").click();
    assert.equal(dialog.isConnected, false);
    assert.equal(p.document.activeElement, info);
    assert.equal(comment.value, "Unsaved comment");
    assert.equal(p.document.querySelector(".relationship-like").value, "2");
    assert.equal(p.calls.length, callCount);
  } finally { detail.subjects[0].description = previous; p.dom.window.close(); }
});

test("Portrait-only characters and closed surveys still allow opening character information", async () => {
  const previous = detail.subjects[0].description;
  for (const description of ["  ", "Read this character description"]) {
    const p = page("survey");
    try {
      detail.subjects[0].description = description;
      p.evaluate("currentUser = { id: 7 }; surveyAcceptingResponses = false;");
      await p.evaluate("loadQuestions()");
      const info = p.document.querySelector(".character-description-button");
      if (!description.trim()) { info.click(); assert.ok(p.document.querySelector("dialog img")); assert.equal(p.document.querySelector("dialog p"), null); }
      else {
        assert.equal(info.disabled, false);
        info.click();
        assert.equal(p.document.querySelector("dialog").open, true);
      }
    } finally { detail.subjects[0].description = previous; p.dom.window.close(); }
  }
});
test("Admin View information popup shows the portrait before the description without expanding responses", async () => {
  const p = page("survey-view");
  try {
    p.document.body.appendChild(p.document.getElementById("relationship-view-template").content.cloneNode(true));
    await p.evaluate('renderRelationshipResults({ id: 2 }, document.querySelector(".relationship-view-results"))');
    const info = p.document.querySelector(".character-description-button");
    let rowClicks = 0;
    info.closest("tr").addEventListener("click", () => rowClicks++);
    info.click();
    const dialog = p.document.querySelector(".character-description-dialog");
    assert.equal(dialog.querySelector("img").getAttribute("src"), image("RELATIONSHIP_SUBJECT", 3).url);
    assert.equal(dialog.querySelector("img").nextElementSibling.textContent, "Character");
    assert.equal(rowClicks, 0);
    dialog.querySelector("button").click();
    assert.equal(p.document.activeElement, info);
  } finally { p.dom.window.close(); }
});

test("Saved character row opens its portrait uploader and saves to the existing attachment owner", async () => {
  const p = page("survey-edit");
  try {
    await p.evaluate("loadQuestions()");
    p.document.querySelector('button[title="Edit question"]').click(); await tick();
    const trigger = p.document.querySelector('button[title="Edit portrait for <Arlo>"]');
    trigger.click(); await tick();
    const picker = p.document.querySelector('dialog input[type="file"]');
    Object.defineProperty(picker, "files", { value: [new p.window.File(["GIF89a"], "portrait.gif", { type: "image/gif" })] });
    picker.dispatchEvent(new p.window.Event("change")); await tick();
    const post = p.calls.find(call => call.options.method === "POST");
    assert.equal(post.url, "/api/surveys/1/images/RELATIONSHIP_SUBJECT/3");
    assert.equal(post.options.headers["X-CSRF"], "test");
    assert.equal(p.document.querySelector("dialog [role=status]").textContent, "Image saved.");
    assert.equal(p.calls.some(call => call.options.method === "POST" && call.url.endsWith("/relationship")), false);
  } finally { p.dom.window.close(); }
});