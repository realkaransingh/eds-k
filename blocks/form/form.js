/**
 * Form block — builds authorable fields and submits via REST or spreadsheet proxy.
 * @param {Element} block The block element
 */

import { moveInstrumentation } from '../../scripts/scripts.js';

const FIELD_TYPES = new Set([
  'text', 'email', 'tel', 'textarea', 'radio', 'checkbox', 'select', 'date',
]);

const CONFIG_KEYS = {
  formid: 'formId',
  'form id': 'formId',
  submitmode: 'submitMode',
  'submit mode': 'submitMode',
  submittype: 'submitMode',
  'submit type': 'submitMode',
  submiturl: 'submitUrl',
  'submit url': 'submitUrl',
  spreadsheetpath: 'spreadsheetPath',
  'spreadsheet path': 'spreadsheetPath',
  submitlabel: 'submitLabel',
  'submit label': 'submitLabel',
  'submit button label': 'submitLabel',
  successmessage: 'successMessage',
  'success message': 'successMessage',
  errormessage: 'errorMessage',
  'error message': 'errorMessage',
};

const DEFAULT_CONFIG = {
  formId: 'enquiry',
  submitMode: 'rest',
  submitUrl: '',
  spreadsheetPath: '/content/eds-k/test/form',
  submitLabel: 'Submit',
  successMessage: 'Thank you. Your enquiry has been submitted.',
  errorMessage: 'Sorry, something went wrong. Please try again.',
};

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Stable HTML id from a field name (payload name stays unchanged).
 * @param {string} name
 * @param {string} [suffix]
 * @returns {string}
 */
function fieldDomId(name, suffix = '') {
  const base = `form-${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Parses the options/settings cell for a field.
 * @param {string} optionsText
 * @returns {object} required, placeholder, help, and choices
 */
function parseOptionsCell(optionsText = '') {
  const result = {
    required: false,
    placeholder: '',
    help: '',
    choices: [],
  };

  String(optionsText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const lower = line.toLowerCase();
      if (lower === 'required' || lower === 'required:true' || lower === 'required: true') {
        result.required = true;
        return;
      }
      if (lower.startsWith('placeholder:')) {
        result.placeholder = line.slice('placeholder:'.length).trim();
        return;
      }
      if (lower.startsWith('help:')) {
        result.help = line.slice('help:'.length).trim();
        return;
      }
      const [value, ...labelParts] = line.split('|');
      const label = labelParts.length ? labelParts.join('|').trim() : value.trim();
      result.choices.push({ value: value.trim(), label });
    });

  return result;
}

/**
 * Form Settings item row: formId | submitMode | submitUrl | spreadsheetPath
 * @param {string[]} texts
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {boolean}
 */
function applySettingsRow(texts, config) {
  if (texts.length !== 4) return false;
  const [formId, submitMode, submitUrl, spreadsheetPath] = texts;
  if (!formId || FIELD_TYPES.has(formId.toLowerCase())) return false;
  if (CONFIG_KEYS[formId.toLowerCase()]) return false;

  config.formId = formId;
  if (submitMode) config.submitMode = submitMode;
  config.submitUrl = submitUrl || '';
  if (spreadsheetPath) config.spreadsheetPath = spreadsheetPath;
  return true;
}

/**
 * @param {Element} block
 * @returns {{
 *   config: typeof DEFAULT_CONFIG,
 *   items: Array<{ row: Element, kind: 'config'|'settings'|'field', field?: object }>
 * }}
 */
function parseBlock(block) {
  const config = { ...DEFAULT_CONFIG };
  const items = [];
  let settingsApplied = false;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (!cells.length) return;

    const texts = cells.map((cell) => cell.textContent.trim());
    const key = texts[0]?.toLowerCase();

    if (cells.length === 2 && CONFIG_KEYS[key]) {
      const prop = CONFIG_KEYS[key];
      const [, value] = texts;
      if (value) config[prop] = value;
      items.push({ row, kind: 'config' });
      return;
    }

    const aueModel = row.getAttribute('data-aue-model');
    if ((!settingsApplied && applySettingsRow(texts, config))
      || aueModel === 'form-settings') {
      if (!settingsApplied) applySettingsRow(texts, config);
      settingsApplied = true;
      items.push({ row, kind: 'settings' });
      return;
    }

    const [typeRaw, fieldName, label, optionsRaw = ''] = texts;
    const type = typeRaw?.toLowerCase();
    if (!FIELD_TYPES.has(type) || cells.length < 3) {
      // Keep UE-instrumented rows even when properties are still empty
      if (row.hasAttribute('data-aue-resource') || aueModel === 'form-field') {
        items.push({
          row,
          kind: 'field',
          field: {
            type: FIELD_TYPES.has(type) ? type : 'text',
            name: fieldName || '',
            label: label || '',
            required: false,
            placeholder: '',
            help: '',
            choices: [],
          },
        });
      }
      return;
    }

    const optionsMeta = parseOptionsCell(optionsRaw);
    items.push({
      row,
      kind: 'field',
      field: {
        type,
        name: fieldName,
        label,
        required: optionsMeta.required,
        placeholder: optionsMeta.placeholder,
        help: optionsMeta.help,
        choices: optionsMeta.choices,
      },
    });
  });

  return { config, items };
}

/**
 * Placeholder so UE can select an item before name/label are authored.
 * @param {object} [field]
 * @returns {HTMLElement}
 */
function buildFieldPlaceholder(field) {
  const wrap = el('div', 'form-field form-field-placeholder');
  const type = field?.type || 'text';
  wrap.textContent = field?.label || field?.name || `Form field (${type}) — set Name and Label in Properties`;
  return wrap;
}

/**
 * @param {string} text
 * @param {string} [htmlFor]
 * @param {boolean} [required]
 * @param {'label'|'legend'} [tag]
 * @returns {HTMLElement}
 */
function buildLabel(text, htmlFor, required = false, tag = 'label') {
  const label = el(tag);
  label.textContent = text;
  if (tag === 'label' && htmlFor) label.setAttribute('for', htmlFor);
  if (required) label.dataset.required = 'true';
  return label;
}

/**
 * @param {object} field
 * @returns {HTMLElement}
 */
function buildHelp(field) {
  if (!field.help) return null;
  const help = el('p', 'form-field-help');
  help.id = `${fieldDomId(field.name)}-help`;
  help.textContent = field.help;
  return help;
}

/**
 * @param {object} field
 * @returns {HTMLElement}
 */
function buildTextLikeField(field) {
  const id = fieldDomId(field.name);
  const wrapper = el('div', `form-field form-field-${field.type}`);
  wrapper.append(buildLabel(field.label, id, field.required));

  const input = field.type === 'textarea' ? el('textarea') : el('input');
  if (field.type !== 'textarea') input.type = field.type;
  else input.rows = 5;
  input.id = id;
  input.name = field.name;
  input.required = field.required;
  if (field.placeholder) input.placeholder = field.placeholder;

  const help = buildHelp(field);
  if (help) {
    input.setAttribute('aria-describedby', help.id);
    wrapper.append(input, help);
  } else {
    wrapper.append(input);
  }
  return wrapper;
}

/**
 * @param {object} field
 * @returns {HTMLElement}
 */
function buildChoiceGroup(field) {
  const wrapper = el('fieldset', `form-field form-field-${field.type}`);
  wrapper.append(buildLabel(field.label, null, field.required, 'legend'));

  field.choices.forEach((choice, index) => {
    const id = fieldDomId(field.name, String(index));
    const optionLabel = el('label', 'form-option');
    optionLabel.setAttribute('for', id);

    const input = el('input');
    input.type = field.type;
    input.id = id;
    input.name = field.name;
    input.value = choice.value;
    if (field.required && index === 0) {
      input.required = true;
    }

    const span = el('span');
    span.textContent = choice.label;
    optionLabel.append(input, span);
    wrapper.append(optionLabel);
  });

  const help = buildHelp(field);
  if (help) wrapper.append(help);
  return wrapper;
}

/**
 * @param {object} field
 * @returns {HTMLElement}
 */
function buildSelectField(field) {
  const id = fieldDomId(field.name);
  const wrapper = el('div', 'form-field form-field-select');
  wrapper.append(buildLabel(field.label, id, field.required));

  const select = el('select');
  select.id = id;
  select.name = field.name;
  select.required = field.required;

  const placeholder = el('option');
  placeholder.value = '';
  placeholder.textContent = field.placeholder || 'Please select';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);

  field.choices.forEach((choice) => {
    const option = el('option');
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  });

  const help = buildHelp(field);
  if (help) {
    select.setAttribute('aria-describedby', help.id);
    wrapper.append(select, help);
  } else {
    wrapper.append(select);
  }
  return wrapper;
}

/**
 * @param {object} field
 * @returns {HTMLElement|null}
 */
function buildField(field) {
  if (!field.name || !field.label) return null;
  if (field.type === 'radio' || field.type === 'checkbox') {
    if (!field.choices.length) return null;
    return buildChoiceGroup(field);
  }
  if (field.type === 'select') {
    if (!field.choices.length) return null;
    return buildSelectField(field);
  }
  return buildTextLikeField(field);
}

/**
 * @param {HTMLFormElement} form
 * @returns {Record<string, string>}
 */
function collectPayload(form) {
  const data = {};
  const fd = new FormData(form);
  fd.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== '') {
      data[key] = `${data[key]},${value}`;
    } else {
      data[key] = String(value);
    }
  });
  return data;
}

/**
 * @param {HTMLFormElement} form
 * @param {boolean} disabled
 */
function setFormDisabled(form, disabled) {
  [...form.elements].forEach((control) => {
    control.disabled = disabled;
  });
}

/**
 * @param {HTMLElement} statusEl
 * @param {'success'|'error'|''} kind
 * @param {string} message
 */
function setStatus(statusEl, kind, message) {
  statusEl.textContent = message || '';
  statusEl.hidden = !message;
  statusEl.classList.remove('form-status-success', 'form-status-error');
  if (kind === 'success') statusEl.classList.add('form-status-success');
  if (kind === 'error') statusEl.classList.add('form-status-error');
  if (message) statusEl.setAttribute('role', 'status');
  else statusEl.removeAttribute('role');
}

/**
 * Both submit modes use the same JSON POST; spreadsheet mode targets a proxy URL.
 * @param {string} url
 * @param {object} payload
 * @returns {Promise<Response>}
 */
async function postSubmission(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * @param {HTMLFormElement} form
 * @param {typeof DEFAULT_CONFIG} config
 * @param {HTMLElement} statusEl
 */
function enableSubmit(form, config, statusEl) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(statusEl, '', '');

    if (!form.reportValidity()) {
      const firstInvalid = form.querySelector(':invalid:not(fieldset)');
      if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const submitUrl = config.submitUrl?.trim();
    if (!submitUrl) {
      setStatus(statusEl, 'error', 'Submit URL is not configured.');
      return;
    }

    const payload = {
      data: collectPayload(form),
      meta: {
        formId: config.formId,
        submitType: config.submitMode,
        spreadsheetPath: config.spreadsheetPath,
        pagePath: window.location.pathname,
        submittedAt: new Date().toISOString(),
      },
    };

    setFormDisabled(form, true);
    try {
      const response = await postSubmission(submitUrl, payload);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setStatus(statusEl, 'success', config.successMessage);
      form.reset();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Form submission failed', error);
      setStatus(statusEl, 'error', config.errorMessage);
    } finally {
      setFormDisabled(form, false);
    }
  });
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rowsBefore = [...block.children].map((row) => ({
    aueResource: row.getAttribute('data-aue-resource'),
    aueType: row.getAttribute('data-aue-type'),
    aueModel: row.getAttribute('data-aue-model'),
    aueLabel: row.getAttribute('data-aue-label'),
    cellTexts: [...row.children].map((c) => c.textContent.trim().slice(0, 40)),
  }));
  const aueBefore = block.querySelectorAll('[data-aue-resource]').length;

  const { config, items } = parseBlock(block);
  // #region agent log
  fetch('http://127.0.0.1:7505/ingest/b2ae6543-003b-473d-b806-369c0339e478', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6850fe' },
    body: JSON.stringify({
      sessionId: '6850fe',
      runId: 'post-fix',
      hypothesisId: 'H1-H3-H5',
      location: 'form.js:decorate:before',
      message: 'form decorate input',
      data: {
        rowCount: rowsBefore.length,
        aueBefore,
        itemsParsed: items.length,
        fieldItems: items.filter((i) => i.kind === 'field').length,
        configMode: config.submitMode,
        formId: config.formId,
        blockHasAue: block.hasAttribute('data-aue-resource'),
        htmlUeEdit: document.documentElement.className,
        rowsBefore,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const form = el('form', 'form-element');
  form.setAttribute('novalidate', '');
  form.dataset.submitMode = config.submitMode;
  if (config.formId) form.dataset.formId = config.formId;
  if (config.spreadsheetPath) form.dataset.spreadsheetPath = config.spreadsheetPath;

  items.forEach(({ row, kind, field }) => {
    if (kind === 'field') {
      let fieldEl = buildField(field);
      if (!fieldEl && row.hasAttribute('data-aue-resource')) {
        fieldEl = buildFieldPlaceholder(field);
      }
      if (!fieldEl) return;
      moveInstrumentation(row, fieldEl);
      form.append(fieldEl);
      return;
    }

    // Settings / config rows: keep a selectable node in UE only
    if (!row.hasAttribute('data-aue-resource')) return;
    const wrap = el('div', `form-author-item form-author-${kind}`);
    wrap.textContent = kind === 'settings'
      ? `Form settings (${config.submitMode || 'rest'})`
      : 'Form configuration';
    moveInstrumentation(row, wrap);
    form.append(wrap);
  });

  const actions = el('div', 'form-actions');
  const submit = el('button', 'form-submit');
  submit.type = 'submit';
  submit.textContent = config.submitLabel || 'Submit';
  actions.append(submit);
  form.append(actions);

  const status = el('p', 'form-status');
  status.hidden = true;
  form.append(status);

  enableSubmit(form, config, status);
  block.replaceChildren(form);
  // #region agent log
  const aueAfter = block.querySelectorAll('[data-aue-resource]').length;
  fetch('http://127.0.0.1:7505/ingest/b2ae6543-003b-473d-b806-369c0339e478', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6850fe' },
    body: JSON.stringify({
      sessionId: '6850fe',
      runId: 'post-fix',
      hypothesisId: 'H1-H5',
      location: 'form.js:decorate:after',
      message: 'form decorate after replaceChildren',
      data: {
        aueAfter,
        childCount: block.children.length,
        formFieldCount: form.querySelectorAll('.form-field').length,
        placeholderCount: form.querySelectorAll('.form-field-placeholder').length,
        authorItemCount: form.querySelectorAll('.form-author-item').length,
        strippedAue: aueBefore > 0 && aueAfter === 0,
        movedAue: aueBefore > 0 && aueAfter > 0,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
