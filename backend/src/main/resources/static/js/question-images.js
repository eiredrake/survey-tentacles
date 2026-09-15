window.QuestionImages = (() => {
  const surveyId = new URLSearchParams(window.location.search).get("id");
  const cache = new Map();
  const base = "/api/surveys/" + encodeURIComponent(surveyId);

  function list(questionId) {
    if (!cache.has(questionId)) {
      cache.set(questionId, fetch(base + "/questions/" + questionId + "/images").then(response => {
        if (!response.ok) throw new Error("Unable to load question images.");
        return response.json();
      }));
    }
    return cache.get(questionId);
  }

  function icon(name, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.title = title;
    button.setAttribute("aria-label", title);
    const symbol = document.createElement("i");
    symbol.className = "fa-solid " + name;
    symbol.setAttribute("aria-hidden", "true");
    button.appendChild(symbol);
    return button;
  }

  function thumbnail(image, label, large = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-thumbnail" + (large ? " question-image" : "");
    button.setAttribute("aria-label", "View larger image: " + label);
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = label;
    img.loading = "lazy";
    button.appendChild(img);
    button.addEventListener("click", event => {
      event.stopPropagation();
      const dialog = document.createElement("dialog");
      dialog.className = "image-lightbox";
      dialog.setAttribute("aria-label", label);
      const close = icon("fa-xmark", "Close image");
      const full = document.createElement("img");
      full.src = image.url;
      full.alt = label;
      const caption = document.createElement("p");
      caption.textContent = label;
      dialog.append(close, full, caption);
      document.body.appendChild(dialog);
      close.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
      dialog.addEventListener("close", () => { dialog.remove(); button.focus(); });
      dialog.showModal();
    });
    return button;
  }

  async function render(questionId, type, ownerId, container, label, large = false) {
    if (!container) return;
    try {
      const image = (await list(questionId)).find(item => item.ownerType === type && item.ownerId === ownerId);
      if (image) {
        const button = thumbnail(image, label, large);
        const prompt = container.querySelector(".question-prompt");
        if (prompt) prompt.after(button); else container.prepend(button);
      }
    } catch (error) {
      console.warn(error.message);
    }
  }

  async function edit(question, row) {
    const next = row.nextElementSibling;
    if (next?.classList.contains("question-image-editor-row")) { next.remove(); return; }
    const detailRow = document.createElement("tr");
    detailRow.className = "question-image-editor-row";
    const cell = detailRow.insertCell();
    cell.colSpan = row.cells.length;
    cell.textContent = "Loading images…";
    row.after(detailRow);
    try {
      cache.delete(question.id);
      const [images, response] = await Promise.all([list(question.id), fetch(base + "/questions/" + question.id)]);
      if (!response.ok) throw new Error("Unable to load question.");
      const detail = await response.json();
      cell.replaceChildren();
      const heading = document.createElement("p");
      heading.textContent = "Images — changes save immediately. PNG, JPEG, WebP or GIF, up to 5 MB.";
      cell.appendChild(heading);
      cell.appendChild(editor(question.id, "QUESTION", question.id, question.prompt, images));
      for (const subject of detail.subjects ?? []) {
        cell.appendChild(editor(question.id, "RELATIONSHIP_SUBJECT", subject.id, subject.name, images));
      }
    } catch (error) { cell.textContent = error.message; }
  }

  function editor(questionId, type, ownerId, label, images) {
    let image = images.find(item => item.ownerType === type && item.ownerId === ownerId);
    const container = document.createElement("div");
    container.className = "content-image-editor";
    const title = document.createElement("span");
    title.textContent = label;
    const preview = document.createElement("span");
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/png,image/jpeg,image/webp,image/gif";
    picker.hidden = true;
    picker.setAttribute("aria-label", "Image for " + label);
    const upload = icon("fa-upload", "Upload or replace image for " + label);
    const remove = icon("fa-xmark", "Remove image for " + label);
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    const refresh = () => {
      preview.replaceChildren();
      if (image) preview.appendChild(thumbnail(image, label));
      remove.disabled = !image;
    };
    refresh();
    upload.addEventListener("click", () => picker.click());
    async function save(file) {
      if (file && (!picker.accept.split(",").includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size)) {
        status.textContent = "Choose a PNG, JPEG, WebP or GIF image up to 5 MB.";
        picker.value = "";
        return;
      }
      upload.disabled = remove.disabled = true;
      status.textContent = "Saving…";
      try {
        const tokenResponse = await fetch("/csrf");
        if (!tokenResponse.ok) throw new Error("Unable to authorize image change.");
        const csrf = await tokenResponse.json();
        const options = { method: file ? "POST" : "DELETE", headers: { [csrf.headerName]: csrf.token } };
        if (file) { options.body = new FormData(); options.body.append("file", file); }
        const response = await fetch(base + "/images/" + type + "/" + ownerId, options);
        if (!response.ok) throw new Error("Unable to save image. Please try again.");
        image = file ? await response.json() : null;
        cache.delete(questionId);
        status.textContent = file ? "Image saved." : "Image removed.";
      } catch (error) { status.textContent = error.message; }
      finally { picker.value = ""; upload.disabled = false; refresh(); }
    }
    picker.addEventListener("change", () => { if (picker.files[0]) save(picker.files[0]); });
    remove.addEventListener("click", () => save(null));
    container.append(preview, title, picker, upload, remove, status);
    return container;
  }

  function characterDialog(subject, trigger) {
    const dialog = document.createElement("dialog");
    dialog.className = "character-description-dialog";
    dialog.setAttribute("aria-label", "Description for " + subject.name);
    const close = icon("fa-xmark", "Close description");
    const heading = document.createElement("h2");
    heading.textContent = subject.name;
    dialog.append(close, heading);
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); trigger.focus(); });
    document.body.appendChild(dialog);
    return dialog;
  }

  async function renderSubject(question, subject, container) {
    let image;
    try { image = (await list(question.id)).find(item => item.ownerType === "RELATIONSHIP_SUBJECT" && item.ownerId === subject.id); }
    catch (error) { console.warn(error.message); }
    if (image) container.prepend(thumbnail(image, subject.name));
    if (!image && !subject.description?.trim()) return;
    const info = icon("fa-circle-question", "Description for " + subject.name);
    info.classList.add("character-description-button");
    info.title = subject.description?.trim() ? subject.description : "View " + subject.name;
    info.setAttribute("aria-haspopup", "dialog");
    info.addEventListener("click", event => {
      event.stopPropagation();
      const dialog = characterDialog(subject, info);
      if (image) {
        const portrait = document.createElement("img");
        portrait.src = image.url; portrait.alt = subject.name;
        dialog.appendChild(portrait);
      }
      if (subject.description?.trim()) {
        const description = document.createElement("p");
        description.textContent = subject.description;
        dialog.appendChild(description);
      }
      dialog.showModal();
    });
    container.appendChild(info);
  }

  async function editSubject(questionId, subject, trigger) {
    const dialog = characterDialog(subject, trigger);
    const content = document.createElement("div");
    content.textContent = "Loading portrait…";
    dialog.appendChild(content); dialog.showModal();
    try {
      cache.delete(questionId);
      const images = await list(questionId);
      content.replaceChildren(editor(questionId, "RELATIONSHIP_SUBJECT", subject.id, subject.name, images));
      const note = document.createElement("p");
      note.textContent = "Portrait changes save immediately. PNG, JPEG, WebP or GIF, up to 5 MB.";
      content.appendChild(note);
    } catch (error) { content.textContent = error.message; }
  }

  return { thumbnail, edit, editSubject,
    renderQuestion: (question, container) => render(question.id, "QUESTION", question.id, container, question.prompt, true),
    renderSubject
  };
})();
