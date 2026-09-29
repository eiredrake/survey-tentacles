const editor = document.getElementById('editor');
const pages = document.getElementById('pages');
const preview = document.getElementById('image-preview');
const removeImage = document.getElementById('remove-image');
const imageInput = document.getElementById('page-image');
const chooseImage = document.getElementById('choose-image');
const dateInput = document.getElementById('expires-at');
const contentInput = document.getElementById('page-content');
let richEditor;
let editing, currentImage, previewUrl;

function editContent(html) {
  contentInput.value = html || '';
  richEditor = SUNEDITOR.create(contentInput, {
    plugins: ['blockStyle', 'list_bulleted', 'list_numbered', 'link', 'table', 'blockquote', 'hr'].map(name => SUNEDITOR.plugins[name]),
    buttonList: [['undo', 'redo'], ['bold', 'italic', 'underline', 'strike'], ['blockStyle'],
      ['list_bulleted', 'list_numbered'], ['link', 'table', 'blockquote', 'hr']],
    blockStyle: { items: ['p', 'h2', 'h3', 'h4'] },
    convertTextTags: { bold: 'strong', italic: 'em', underline: 'u', strike: 's' },
    elementBlacklist: 'script|style|iframe|object|embed|form|input|button|textarea|select|option|canvas|svg|video|audio|img|h1|h5|h6',
    attributeBlacklist: { '*': 'style|class|id|on.*' },
    link: { openNewWindow: false, noAutoPrefix: true, defaultRel: { default: 'noopener noreferrer' }, enableFileUpload: false },
    height: '300px', width: '100%', toolbar_sticky: false,
    events: { onChange: ({ data }) => { contentInput.value = data; } }
  });
  const editable = richEditor.$.frameContext.get('wysiwyg');
  editable.setAttribute('role', 'textbox');
  editable.setAttribute('aria-multiline', 'true');
  editable.setAttribute('aria-labelledby', 'content-label');
  editable.setAttribute('aria-describedby', 'content-help page-content-error');
  document.getElementById('content-label').onclick = () => editable.focus();
}

function releasePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

function renderImage() {
  const source = previewUrl || currentImage;
  preview.hidden = !source;
  if (source) preview.src = source;
  else preview.removeAttribute('src');
  document.getElementById('image-state').textContent = previewUrl ? 'Selected image — save to upload.'
    : currentImage ? 'Current image' : 'No promotional image selected.';
  preview.alt = previewUrl ? 'Selected promotional image preview' : 'Current promotional image';
  chooseImage.textContent = source ? 'Replace Image' : 'Choose Image';
  removeImage.hidden = !source;
  removeImage.textContent = previewUrl ? 'Discard selected image' : 'Remove Image';
}

function fieldError(field, message) {
  const output = document.getElementById(field.id + '-error');
  if (output) { output.textContent = message; output.hidden = !message; }
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  if (field === contentInput && richEditor) richEditor.$.frameContext.get('wysiwyg').setAttribute('aria-invalid', String(!!message));
}

function validateField(field) {
  const value = field.value.trim();
  let error = '';
  if (field.id === 'page-title' && !value) error = 'Enter a title for this promotional page.';
  if (field.id === 'page-slug' && (!value || !new RegExp('^(?:' + field.pattern + ')$').test(value)))
    error = 'Enter only letters A–Z, numbers, and single hyphens between words, such as october-event-2026. Do not include /p/ or a full URL.';
  if (field.maxLength > 0 && field.value.length > field.maxLength) error = 'Use no more than ' + field.maxLength + ' characters.';
  if (field.id === 'visitor-limit' && (field.validity.badInput || value && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > Number(field.max))))
    error = 'Enter a whole number from 1 to 2,147,483,647, or leave blank for no visitor limit.';
  if (field === dateInput && value) {
    const picker = dateInput._fdatepicker;
    const date = picker?.selectedDate;
    if (!date || Number.isNaN(date.getTime()) || value !== picker.formatDate(date))
      error = 'Choose a valid expiration date and time using the date picker, or leave blank.';
  }
  if (field.id === 'expired-destination' && value) {
    try {
      // Give early format feedback; the backend remains authoritative for redirect safety.
      const path = decodeURIComponent(value.split(/[?#]/)[0]);
      if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)
          || /%(?![0-9a-f]{2})/i.test(value) || path.startsWith('//') || /[\\\u0000-\u001f\u007f-\u009f]/.test(path))
        throw new Error();
      new URL(value, window.location.origin);
    } catch {
      error = 'Enter an internal Tentacles path beginning with "/". External web addresses and unsafe paths are not supported. You may leave this blank.';
    }
  }
  if (field === imageInput && field.files[0]) {
    const file = field.files[0];
    if (!imageInput.accept.split(',').includes(file.type)) error = 'Choose a PNG, JPEG, WEBP, or GIF image.';
    else if (file.size > 5 * 1024 * 1024) error = 'Choose an image of 5 MB or smaller.';
  }
  fieldError(field, error);
  return !error;
}

function validateEditor() {
  const fields = [...editor.querySelectorAll('input:not([type="hidden"]), textarea')];
  const invalid = fields.filter(field => !validateField(field));
  if (invalid.length) {
    (invalid[0] === imageInput ? chooseImage : invalid[0] === contentInput && richEditor ? richEditor.$.frameContext.get('wysiwyg') : invalid[0]).focus();
    showToast('Please correct the highlighted fields.', 'error');
  }
  return !invalid.length;
}

function closeEditor() {
  richEditor?.destroy(); richEditor = undefined;
  releasePreview();
  currentImage = undefined; editing = undefined;
  editor.reset();
  dateInput._fdatepicker?.setDate(null, false);
  dateInput._fdatepicker?.close();
  for (const field of editor.querySelectorAll('input, textarea')) fieldError(field, '');
  renderImage();
  editor.hidden = true;
  document.getElementById('editor-heading').textContent = 'Create Promotional Page';
  document.getElementById('editing-page').textContent = '';
  document.getElementById('editing-page').hidden = true;
}

function busy(value) {
  editor.setAttribute('aria-busy', String(value));
  for (const button of document.querySelectorAll('main button')) if (!button.closest('.sun-editor')) button.disabled = value;
  if (richEditor) value ? richEditor.$.ui.disable() : richEditor.$.ui.enable();
}

async function request(url, method = 'GET', body, failure = 'Unable to load promotional pages.') {
  const options = { method };
  if (method !== 'GET') {
    const { token, headerName } = await getCsrfToken();
    options.headers = { [headerName]: token };
    if (body instanceof FormData) options.body = body;
    else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || error.error || failure);
  }
  return response.status === 204 ? null : response.json();
}

function form(page = { enabled: true }) {
  closeEditor();
  editing = page.id;
  for (const field of editor.elements) {
    if (!field.name || field.type === 'file' || field.name === 'expiresAt') continue;
    if (field.type === 'checkbox') field.checked = !!page[field.name];
    else field.value = page[field.name] ?? '';
  }
  const picker = dateInput._fdatepicker || new FDatepicker(dateInput, { timepicker: true, ampm: true, format: 'm/d/Y h:i a', minutesStep: 1 });
  picker.setDate(page.expiresAt ? new Date(page.expiresAt) : null, false);
  currentImage = page.imageFilename ? '/api/promotional-pages/' + page.id + '/image' : undefined;
  renderImage();
  document.getElementById('editor-heading').textContent = editing ? 'Edit Promotional Page' : 'Create Promotional Page';
  document.getElementById('editing-page').textContent = editing ? page.title : '';
  document.getElementById('editing-page').hidden = !editing;
  editor.hidden = false;
  editContent(page.content);
  editor.elements.title.focus();
}

async function load() {
  const list = await request('/api/promotional-pages');
  pages.replaceChildren(...list.map(page => {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td>';
    row.cells[0].textContent = page.title;
    const link = document.createElement('a');
    link.href = page.publicUrl;
    link.textContent = '/p/' + page.slug;
    link.target = '_blank'; link.rel = 'noopener';
    row.cells[1].append(link);
    row.cells[2].textContent = !page.enabled ? 'Unpublished' : page.expired ? 'Expired' : 'Published';
    row.cells[3].textContent = page.totalViews;
    row.cells[4].textContent = page.uniqueVisitors;
    const actions = [
      ['Edit', 'pen', () => form(page)],
      [page.enabled ? 'Unpublish' : 'Publish', page.enabled ? 'eye-slash' : 'eye', async () => {
        await request('/api/promotional-pages/' + page.id, 'POST', { ...page, enabled: !page.enabled }, 'Unable to change publication status.');
        if (editing === page.id) closeEditor();
        await load();
      }],
      ['Copy promotional page link', 'share-nodes', async () => {
        try {
          await navigator.clipboard.writeText(page.publicUrl);
          showToast('Promotional page link copied.', 'success');
        } catch {
          showToast('Unable to copy promotional page link. Please copy the public link manually.', 'error');
        }
      }],
      ['Analytics', 'chart-simple', () => analytics(page.id)],
      ['Delete', 'trash', async () => {
        if (!confirm('Delete "' + page.title + '"?')) return;
        await request('/api/promotional-pages/' + page.id, 'DELETE', undefined, 'Unable to delete promotional page.');
        showToast('Promotional page deleted.', 'success');
        if (editing === page.id) closeEditor();
        document.getElementById('analytics').hidden = true;
        await load();
      }]
    ];
    for (const [label, icon, action] of actions) {
      row.cells[5].append(createIconButton(label, icon, async () => {
        try { await action(); } catch (error) { showToast(error.message, 'error'); }
      }));
    }
    return row;
  }));
}

async function analytics(id) {
  const data = await request('/api/promotional-pages/' + id + '/visitors', 'GET', undefined, 'Unable to load visitor analytics.');
  const section = document.getElementById('analytics');
  section.querySelector('tbody').replaceChildren(...data.map(visitor => {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td><td></td>';
    row.cells[0].textContent = visitor.name || visitor.username || visitor.anonymousIp;
    row.cells[1].textContent = visitor.firstVisitedAt;
    row.cells[2].textContent = visitor.lastVisitedAt;
    row.cells[3].textContent = visitor.viewCount;
    return row;
  }));
  section.hidden = false;
}

document.getElementById('create').onclick = () => form();
document.getElementById('cancel').onclick = () => { closeEditor(); document.getElementById('create').focus(); };
chooseImage.onclick = () => imageInput.click();
imageInput.onchange = () => {
  releasePreview();
  if (validateField(imageInput) && imageInput.files[0]) previewUrl = URL.createObjectURL(imageInput.files[0]);
  renderImage();
};
for (const field of editor.querySelectorAll('input:not([type="file"]), textarea')) {
  field.addEventListener('input', () => { if (field.hasAttribute('aria-invalid')) validateField(field); });
  field.addEventListener('change', () => validateField(field));
}
window.addEventListener('pagehide', releasePreview);

removeImage.onclick = async () => {
  if (previewUrl) {
    releasePreview(); imageInput.value = ''; fieldError(imageInput, ''); renderImage();
    return;
  }
  busy(true);
  try {
    await request('/api/promotional-pages/' + editing + '/image', 'DELETE', undefined, 'Unable to remove image.');
    currentImage = undefined; imageInput.value = ''; fieldError(imageInput, ''); renderImage();
    showToast('Image removed.', 'success');
    await load();
  } catch (error) { showToast(error.message, 'error'); }
  finally { busy(false); }
};
editor.onsubmit = async event => {
  event.preventDefault();
  contentInput.value = richEditor.isEmpty() ? '' : richEditor.$.html.get();
  if (!validateEditor()) return;
  busy(true);
  try {
    const values = Object.fromEntries(new FormData(editor));
    delete values.image;
    values.contentFormat = 'html';
    values.title = values.title.trim();
    values.slug = values.slug.trim();
    values.expiredDestination = values.expiredDestination.trim() || null;
    values.enabled = editor.elements.enabled.checked;
    values.uniqueVisitorLimit = values.uniqueVisitorLimit === '' ? null : Number(values.uniqueVisitorLimit);
    const date = dateInput._fdatepicker?.selectedDate;
    values.expiresAt = dateInput.value.trim() ? date.toISOString() : null;
    const saved = await request('/api/promotional-pages' + (editing ? '/' + editing : ''), 'POST', values, 'Unable to save promotional page.');
    // Keep the saved ID so retrying a failed image upload cannot create a second page.
    editing = saved.id;
    document.getElementById('editor-heading').textContent = 'Edit Promotional Page';
    const image = imageInput.files[0];
    if (image) {
      const data = new FormData();
      data.append('file', image);
      try {
        await request('/api/promotional-pages/' + saved.id + '/image', 'POST', data, 'Please retry.');
      } catch (error) { throw new Error('Page saved, but image upload failed: ' + error.message); }
      releasePreview(); imageInput.value = '';
      currentImage = '/api/promotional-pages/' + saved.id + '/image?t=' + Date.now();
      renderImage();
      showToast('Image updated.', 'success');
    }
    await load();
    closeEditor();
    showToast('Promotional page saved.', 'success');
    document.getElementById('create').focus();
  } catch (error) { showToast(error.message, 'error'); }
  finally { busy(false); }
};
load().catch(error => showToast(error.message, 'error'));
