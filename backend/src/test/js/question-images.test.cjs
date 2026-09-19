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
  for (const script of ["getCsrfToken", "question-images", name]) {
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
    assert.equal(p.document.querySelector("dialog"), null);
    assert.equal(p.calls.some(call => call.options.method === "POST" && call.url.endsWith("/relationship")), false);
  } finally { p.dom.window.close(); }
});
async function choosePortrait(p, trigger, drop = false) {
  trigger.click(); await tick();
  const dialog = p.document.querySelector('dialog');
  const file = new p.window.File(['GIF89a'], 'portrait.gif', { type: 'image/gif' });
  if (drop) {
    const event = new p.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    dialog.dispatchEvent(event);
  } else {
    const picker = dialog.querySelector('input[type=file]');
    Object.defineProperty(picker, 'files', { value: [file] });
    picker.dispatchEvent(new p.window.Event('change'));
  }
  for (let i = 0; i < 50 && dialog.isConnected; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(dialog.isConnected, false);
  return file;
}

test('New character accepts a dropped portrait without saving the question', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate('showQuestionEditor("relationship-question-template")');
    p.evaluate('document.getElementById("relationship-editor-subject-list").appendChild(createRelationshipSubjectRow("New", "Description"))');
    const row = p.document.querySelector('.relationship-subject');
    const trigger = row.querySelector('button[title="Edit portrait for New"]');
    assert.equal(trigger.disabled, false);
    const file = await choosePortrait(p, trigger, true);
    assert.equal(row.pendingPortrait, file);
    assert.equal(p.calls.length, 0);
    assert.equal(p.evaluate('hasUnsavedChanges()'), true);
    trigger.click(); await tick();
    assert.match(p.document.querySelector('dialog img').src, /^data:image\/gif;base64,/);
  } finally { p.dom.window.close(); }
});

test('Failed draft portrait upload keeps the editor and retries using saved character IDs', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate('showQuestionEditor("relationship-question-template")');
    p.document.getElementById('relationship-editor-prompt').value = 'Relationships';
    p.evaluate('document.getElementById("relationship-editor-subject-list").appendChild(createRelationshipSubjectRow("Same", "First")); document.getElementById("relationship-editor-subject-list").appendChild(createRelationshipSubjectRow("Same", "Second"))');
    const rows = [...p.document.querySelectorAll('.relationship-subject')];
    await choosePortrait(p, rows[1].querySelector('button[title="Edit portrait for Same"]'));
    const originalFetch = p.window.fetch, saves = [], uploads = [];
    let fail = true;
    p.window.fetch = async (url, options = {}) => {
      if (url.endsWith('/relationship') && options.method === 'POST') {
        saves.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ id: 2, subjects: [{ id: 11, displayOrder: 1 }, { id: 10, displayOrder: 0 }] }) };
      }
      if (url.includes('/images/RELATIONSHIP_SUBJECT/') && options.method === 'POST') {
        uploads.push(url);
        return { ok: !fail, json: async () => image('RELATIONSHIP_SUBJECT', 11) };
      }
      return originalFetch(url, options);
    };
    const save = p.document.getElementById('save-question-button');
    save.click(); await tick(); await tick();
    assert.ok(rows[1].pendingPortrait);
    assert.equal(rows[1].dataset.subjectId, '11');
    assert.equal(p.document.getElementById('question-form-container').hidden, false);
    fail = false;
    save.click(); await tick(); await tick();
    assert.equal(saves.length, 2);
    assert.equal(saves[1].url, '/api/surveys/1/questions/2/relationship');
    assert.deepEqual(saves[1].body.subjects.map(subject => subject.id), [10, 11]);
    assert.deepEqual(uploads, ['/api/surveys/1/images/RELATIONSHIP_SUBJECT/11', '/api/surveys/1/images/RELATIONSHIP_SUBJECT/11']);
    assert.equal(p.document.getElementById('question-form-container').hidden, true);
  } finally { p.dom.window.close(); }
});

test('Invalid dropped portrait leaves the dialog open with an error', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate('showQuestionEditor("relationship-question-template")');
    p.evaluate('document.getElementById("relationship-editor-subject-list").appendChild(createRelationshipSubjectRow("New", ""))');
    p.document.querySelector('button[title="Edit portrait for New"]').click(); await tick();
    const dialog = p.document.querySelector('dialog');
    const event = new p.window.Event('drop', { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [new p.window.File(['text'], 'bad.txt', { type: 'text/plain' })] } });
    dialog.dispatchEvent(event); await tick();
    assert.ok(dialog.isConnected);
    assert.match(dialog.querySelector('[role=status]').textContent, /Choose a PNG/);
    assert.equal(p.calls.length, 0);
  } finally { p.dom.window.close(); }
});

test('Plus opens an editable character row; Cancel discards it and Save adds its portrait to the list', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate('showQuestionEditor("relationship-question-template")');
    const doc = p.document, editor = doc.getElementById('relationship-subject-editor');
    const plus = doc.getElementById('show-relationship-subject-editor-button');
    plus.click();
    assert.equal(editor.tagName, 'TR');
    assert.equal(editor.hidden, false);
    assert.equal(doc.getElementById('relationship-editor-name').value, '');
    const upload = editor.querySelector('.character-upload-button');
    assert.ok(upload);
    upload.click(); await tick();
    let dialog = doc.querySelector('dialog');
    assert.ok(dialog.querySelector('.image-drop-area'));
    dialog.dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }));
    assert.equal(doc.querySelector('dialog'), null);
    await choosePortrait(p, upload);
    doc.getElementById('cancel-relationship-subject-button').click();
    assert.equal(editor.hidden, true);
    assert.equal(doc.querySelectorAll('.relationship-subject').length, 0);
    plus.click();
    doc.getElementById('relationship-editor-name').value = 'Arlo';
    doc.getElementById('relationship-editor-description').value = 'A character';
    await choosePortrait(p, editor.querySelector('.character-upload-button'));
    doc.getElementById('add-relationship-subject-button').click();
    assert.equal(editor.hidden, true);
    const row = doc.querySelector('.relationship-subject');
    assert.equal(row.cells[0].textContent, 'Arlo');
    assert.equal(row.cells[1].textContent, 'A character');
    assert.ok(row.querySelector('.image-thumbnail img'));
    assert.ok(row.querySelector('.character-upload-button'));
    assert.ok(row.querySelector('button[title="Remove character"]'));
    assert.equal(p.calls.length, 0);
  } finally { p.dom.window.close(); }
});
test('Opening the relationship editor shows saved portraits before character names', async () => {
  const p = page('survey-edit');
  try {
    await p.evaluate('loadQuestions()');
    p.document.querySelector('button[title="Edit question"]').click();
    await tick(); await tick();
    const row = p.document.querySelector('.relationship-subject');
    const portrait = row.cells[0].querySelector('.image-thumbnail');
    assert.ok(portrait);
    assert.equal(row.cells[0].firstElementChild, portrait);
    assert.equal(portrait.querySelector('img').getAttribute('src'), image('RELATIONSHIP_SUBJECT', 3).url);
    assert.equal(portrait.nextElementSibling.textContent, '<Arlo>');
    assert.equal(row.cells[1].textContent, 'Character');
    assert.ok(row.querySelector('.character-upload-button'));
    assert.ok(row.querySelector('button[title="Remove character"]'));
  } finally { p.dom.window.close(); }
});
test('Character edits preserve identity and portrait, and Cancel restores the original text', async () => {
  const p = page('survey-edit');
  try {
    await p.evaluate('loadQuestions()');
    p.document.querySelector('button[title="Edit question"]').click(); await tick(); await tick();
    const row = p.document.querySelector('.relationship-subject');
    const portrait = row.querySelector('.image-thumbnail');
    row.querySelector('.character-edit-button').click();
    row.querySelector('input[aria-label="Character name"]').value = 'Discard me';
    row.querySelector('button[title="Cancel character edits"]').click();
    assert.equal(row.dataset.name, '<Arlo>');
    row.querySelector('.character-edit-button').click();
    row.querySelector('input[aria-label="Character name"]').value = 'Arlo corrected';
    row.querySelector('input[aria-label="Character description"]').value = 'Corrected description';
    row.querySelector('button[title="Save character edits"]').click();
    assert.equal(row.dataset.subjectId, '3');
    assert.equal(row.dataset.name, 'Arlo corrected');
    assert.equal(row.cells[1].textContent, 'Corrected description');
    assert.equal(row.querySelector('.image-thumbnail'), portrait);
    assert.equal(p.evaluate('hasUnsavedChanges()'), true);
    assert.equal(row.querySelector('input'), null);
  } finally { p.dom.window.close(); }
});
for (const mode of ['survey', 'survey-edit', 'survey-view', 'survey-participant-view']) {
  test(`${mode}: question thumbnail belongs to the prompt, never the answer area`, async () => {
    const p = page(mode);
    try {
      if (mode === 'survey') p.evaluate('currentUser = { id: 7 }; surveyAcceptingResponses = true;');
      await p.evaluate('loadQuestions()');
      const target = mode === 'survey' ? p.document.querySelector('.question-prompt') : p.document.querySelector('#question-list > tr > td');
      const thumbnail = target.querySelector('.question-image');
      assert.ok(thumbnail);
      assert.equal(target.firstElementChild, thumbnail);
      assert.equal(p.document.querySelector('.question-detail-row .question-image'), null);
      assert.equal(target.textContent, question.prompt);
      let clicks = 0;
      target.addEventListener('click', () => clicks++);
      thumbnail.click();
      assert.equal(clicks, 0);
      assert.ok(p.document.querySelector('dialog img'));
    } finally { p.dom.window.close(); }
  });
}

test('Question without an image has no thumbnail or placeholder', async () => {
  const p = page('survey-edit');
  try {
    const fetch = p.window.fetch;
    p.window.fetch = (url, options) => url.endsWith('/images') ? Promise.resolve({ ok: true, json: async () => [] }) : fetch(url, options);
    await p.evaluate('loadQuestions()');
    assert.equal(p.document.querySelector('#question-list .question-image'), null);
    assert.equal(p.document.querySelector('#question-list > tr > td').textContent, question.prompt);
  } finally { p.dom.window.close(); }
});
test('Shared section headings retain character sorting and Add controls', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate('showQuestionEditor("relationship-question-template")');
    p.evaluate('populateRelationshipSubjects([{id:3,name:"Arlo",description:"Zulu"},{id:4,name:"Zed",description:"Alpha"}])');
    const plus = p.document.getElementById('show-relationship-subject-editor-button');
    p.evaluate(readFileSync(path.join(staticDir, 'js/table-sections.js'), 'utf8'));
    await tick();
    const header = p.document.querySelector('.relationship-editor-table th');
    assert.ok(header.textContent.includes('Characters'));
    assert.equal(plus.closest('th'), header);
    plus.click();
    assert.equal(p.document.getElementById('relationship-subject-editor').hidden, false);
    assert.deepEqual([...p.document.querySelectorAll('.relationship-subject')].map(row => row.dataset.name), ['Arlo', 'Zed']);
    header.click();
    assert.deepEqual([...p.document.querySelectorAll('.relationship-subject')].map(row => row.dataset.name), ['Zed', 'Arlo']);
    assert.ok(header.classList.contains('sort-descending'));
    assert.equal(p.document.querySelectorAll('#show-relationship-subject-editor-button').length, 1);
  } finally { p.dom.window.close(); }
});

test('Expanded accordion uses its table heading and retains collapse/expand', async () => {
  const p = page('survey-view');
  try {
    const details = p.document.querySelector('details');
    const table = p.document.createElement('table');
    table.className = 'survey-table';
    table.innerHTML = '<thead><tr><th>Name</th><th>Required</th></tr></thead><tbody></tbody>';
    p.document.getElementById('participants-view').appendChild(table);
    p.evaluate(readFileSync(path.join(staticDir, 'js/table-sections.js'), 'utf8'));
    details.open = true;
    const toggle = table.querySelector('.table-section-toggle');
    assert.equal(toggle.textContent, 'Participants');
    assert.ok(details.classList.contains('consolidated-table-section'));
    toggle.click();
    assert.equal(details.open, false);
    details.querySelector('summary').click();
    assert.equal(details.open, true);
    assert.equal(table.querySelectorAll('th')[1].textContent, 'Required');
  } finally { p.dom.window.close(); }
});
test('Participant plus belongs to its header and opens the picker without collapsing', async () => {
  const p = page('survey-edit');
  try {
    p.evaluate(readFileSync(path.join(staticDir, 'js/participant-picker.js'), 'utf8'));
    await p.evaluate('loadParticipants()');
    p.evaluate(readFileSync(path.join(staticDir, 'js/table-sections.js'), 'utf8'));
    await tick();
    const section = p.document.getElementById('participants-view');
    const details = section.closest('details');
    details.open = true;
    const plus = section.querySelector('button[title="Add participant"]');
    assert.ok(plus.closest('th.table-section-heading'));
    assert.equal(plus.textContent.trim(), '');
    assert.ok(plus.querySelector('.fa-plus'));
    assert.equal(section.querySelector('[data-table-actions]'), null);
    plus.click(); await tick();
    assert.equal(details.open, true);
    assert.equal(section.querySelector('.expected-participant-picker').hidden, false);
    assert.ok(section.querySelector('a[href="/admin/participant-groups.html"]'));
  } finally { p.dom.window.close(); }
});