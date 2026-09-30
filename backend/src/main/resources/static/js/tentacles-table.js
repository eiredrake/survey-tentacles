// Enhances caller-owned semantic tables. Domain rendering, persistence and permissions stay with callers.
// API: createTentaclesTable(table, { body?, rows?, companions?, columns?, defaultSort?,
//   toolbarActions?, rowActions?, actionCell?, onRowActivate?, emptyMessage? }).
// columns[key]: { value(row), type: 'text'|'number', compare(a, b, rowA, rowB)?, cell(row)?, onActivate? }.
// Headers opt in with data-sort-key; activation-only columns need cell/onActivate, not value.
// Actions: { action: 'add'|'edit'|'delete'|'view'|'share', icon?, title?, ariaLabel?, visible?, enabled?, onActivate }.
// Custom actions omit action and supply icon/title. Labels/state may be callbacks receiving { table, row };
// onActivate receives that context plus the event (and cell for row/cell activation). Toolbar row is null.
// Supply actionCell(row) for row actions and rows() excluding companions for grouped tables.
// refresh({ reapplySort: true }) updates rows/action state/empty presentation; getSort() returns a copy.
// destroy() removes owned UI/listeners. Initializing again on the same table destroys its prior controller.
window.createTentaclesTable = (() => {
  const instances = new WeakMap();
  const standardActions = {
    add: ['Add', 'plus'], edit: ['Edit', 'pen-to-square'], delete: ['Delete', 'trash'],
    view: ['View', 'eye'], share: ['Share', 'share-nodes']
  };
  const interactive = 'button, a, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [tabindex]';
  const textCompare = (a, b) => String(a ?? '').trim().localeCompare(String(b ?? '').trim(), undefined, { sensitivity: 'base' });
  const numberValue = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  function numberCompare(a, b) {
    a = numberValue(a); b = numberValue(b);
    return a === b ? 0 : a === null ? -1 : b === null ? 1 : a - b;
  }

  return function createTentaclesTable(table, options = {}) {
    instances.get(table)?.destroy();
    const body = options.body || table.tBodies[0] || table.createTBody();
    const columns = options.columns || {};
    const headers = [...(table.tHead?.querySelectorAll('[data-sort-key]') || [])].filter(header => typeof columns[header.dataset.sortKey]?.value === 'function');
    const sortButtons = new Map(), actionGroups = new Map(), attributes = new Map();
    let sort = options.defaultSort ? { direction: 'ascending', ...options.defaultSort } : null;
    let destroyed = false;
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'table-empty-state';
    const emptyCell = emptyRow.insertCell();
    emptyCell.textContent = options.emptyMessage ?? 'No items to display.';
    const toolbar = options.toolbarActions?.length ? document.createElement('div') : null;
    if (toolbar) { toolbar.className = 'table-toolbar'; table.before(toolbar); }
    const context = row => ({ table, row });
    const setting = (value, row, fallback) => value === undefined ? fallback : typeof value === 'function' ? value(context(row)) : value;
    const rows = () => [...(options.rows ? options.rows() : body.children)].filter(row => row !== emptyRow && row.parentElement === body);

    function remember(element, name, value) {
      if (!attributes.has(element)) attributes.set(element, new Map());
      const original = attributes.get(element);
      if (!original.has(name)) original.set(name, element.getAttribute(name));
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
    function restoreAttributes() {
      for (const [element, original] of attributes) for (const [name, value] of original) {
        if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      }
      attributes.clear();
    }
    for (const header of headers) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'table-sort-button';
      const original = [...header.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
      button.textContent = original.map(node => node.textContent).join('').trim() || header.dataset.sortKey;
      button.setAttribute('aria-label', 'Sort by ' + button.textContent);
      original.forEach(node => node.remove());
      header.prepend(button);
      sortButtons.set(header, { button, original, sortable: header.classList.contains('sortable-header') });
      header.classList.add('sortable-header');
    }

    function actions(host, definitions, row) {
      let group = actionGroups.get(host);
      if (group && (group.buttons.length !== definitions.length || group.buttons.some(({ action }, index) => action !== definitions[index]))) {
        group.element.remove(); actionGroups.delete(host); group = null;
      }
      if (!group) {
        const element = document.createElement('span'); element.className = 'table-actions';
        const buttons = definitions.map(action => {
          const standard = standardActions[action.action];
          const button = createIconButton(setting(action.title, row, standard?.[0] || 'Action'), action.icon || standard?.[1] || 'ellipsis', event => {
            event.stopPropagation();
            if (!button.disabled && !button.hidden) action.onActivate?.(context(row), event);
          });
          element.append(button);
          return { button, action, standard };
        });
        host.append(element); group = { element, buttons }; actionGroups.set(host, group);
      }
      for (const { button, action, standard } of group.buttons) {
        button.title = setting(action.title, row, standard?.[0] || 'Action');
        button.setAttribute('aria-label', setting(action.ariaLabel, row, button.title));
        button.querySelector('i').className = 'fa-solid fa-' + (action.icon || standard?.[1] || 'ellipsis');
        button.hidden = !setting(action.visible, row, true);
        button.disabled = !setting(action.enabled, row, true);
      }
    }

    function indicators() {
      for (const header of headers) {
        const active = header.dataset.sortKey === sort?.key;
        header.classList.toggle('sort-ascending', active && sort.direction !== 'descending');
        header.classList.toggle('sort-descending', active && sort.direction === 'descending');
        remember(header, 'aria-sort', active ? (sort.direction || 'ascending') : null);
        remember(header, 'scope', 'col');
      }
    }
    function reapply(dataRows) {
      const column = columns[sort?.key];
      if (typeof column?.value !== 'function') return;
      const compare = column.compare || (column.type === 'number' ? numberCompare : textCompare);
      const ordered = dataRows.map((row, index) => ({ row, index, value: column.value(row) }));
      ordered.sort((a, b) => {
        const comparison = Number(compare(a.value, b.value, a.row, b.row)) || 0;
        return (sort.direction === 'descending' ? -comparison : comparison) || a.index - b.index;
      });
      const focused = document.activeElement;
      const selection = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
      for (const { row } of ordered) {
        body.append(row);
        for (const companion of options.companions?.(row) || []) body.append(companion);
      }
      if (focused && body.contains(focused) && document.activeElement !== focused) {
        focused.focus({ preventScroll: true });
        if (selection) focused.setSelectionRange(...selection);
      }
    }
    function refresh({ reapplySort = true } = {}) {
      if (destroyed) return;
      emptyRow.remove();
      restoreAttributes();
      const dataRows = rows();
      for (const [host, group] of actionGroups) if (host !== toolbar && !body.contains(host)) {
        group.element.remove(); actionGroups.delete(host);
      }
      if (toolbar) actions(toolbar, options.toolbarActions, null);
      for (const row of dataRows) {
        if (options.rowActions && options.actionCell) actions(options.actionCell(row), options.rowActions, row);
        if (options.onRowActivate) { remember(row, 'tabindex', '0'); remember(row, 'data-table-interactive', 'true'); }
        for (const column of Object.values(columns)) if (column.onActivate) {
          const cell = column.cell(row);
          if (cell) { remember(cell, 'tabindex', '0'); remember(cell, 'data-table-interactive', 'true'); }
        }
      }
      if (reapplySort) reapply(dataRows);
      if (!dataRows.length) {
        const cells = [...(table.tHead?.rows[table.tHead.rows.length - 1]?.cells || [])];
        emptyCell.colSpan = Math.max(1, cells.filter(cell => !cell.hidden && getComputedStyle(cell).display !== 'none').reduce((total, cell) => total + cell.colSpan, 0));
        body.append(emptyRow);
      }
      indicators();
    }
    function activate(event) {
      if (event.target.closest('table') !== table) return;
      const keyboard = event.type === 'keydown';
      if (keyboard && (event.repeat || !['Enter', ' '].includes(event.key))) return;
      const header = event.target.closest('th[data-sort-key]');
      if (sortButtons.has(header)) {
        const { button } = sortButtons.get(header);
        if (keyboard && event.target !== button || event.target.closest(interactive) && !button.contains(event.target)) return;
        if (keyboard) event.preventDefault();
        const key = header.dataset.sortKey;
        sort = { key, direction: sort?.key === key && sort.direction !== 'descending' ? 'descending' : 'ascending' };
        refresh(); return;
      }
      const row = event.target.closest('tr');
      if (!rows().includes(row)) return;
      const cell = event.target.closest('td, th');
      const column = Object.values(columns).find(column => column.onActivate && column.cell(row) === cell);
      const target = column ? cell : row;
      const child = event.target.closest(interactive);
      if ((child && child !== target) || (keyboard && event.target !== target)) return;
      const callback = column?.onActivate || options.onRowActivate;
      if (callback) { if (keyboard) event.preventDefault(); callback({ ...context(row), cell }, event); }
    }
    table.addEventListener('click', activate);
    table.addEventListener('keydown', activate);
    const controller = {
      refresh,
      getSort: () => sort ? { ...sort } : null,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        table.removeEventListener('click', activate); table.removeEventListener('keydown', activate);
        restoreAttributes(); emptyRow.remove(); toolbar?.remove();
        for (const group of actionGroups.values()) group.element.remove();
        actionGroups.clear();
        for (const [header, { button, original, sortable }] of sortButtons) {
          button.replaceWith(...original);
          header.classList.remove('sort-ascending', 'sort-descending');
          if (!sortable) header.classList.remove('sortable-header');
        }
        instances.delete(table);
      }
    };
    instances.set(table, controller); refresh();
    return controller;
  };
})();
