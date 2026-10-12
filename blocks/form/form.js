/**
 * Form block — Core-style items (text, options, hidden, button) with REST / spreadsheet submit.
 * @param {Element} block The block element
 */

import { moveInstrumentation } from '../../scripts/scripts.js';

const TEXT_TYPES = new Set(['text', 'email', 'tel', 'textarea', 'date']);
const OPTION_TYPES = new Set(['radio', 'checkbox', 'select']);
const BUTTON_TYPES = new Set(['submit', 'reset']);
const LEGACY_FIELD_TYPES = new Set([...TEXT_TYPES, ...OPTION_TYPES]);

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
 * @param {string} name
 * @param {string} [suffix]
 * @returns {string}
 */
function fieldDomId(name, suffix = '') {
  const base = `form-${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Settings / choices cell: required / placeholder / help / choice lines.
 * @param {string} optionsText
 * @returns {object}
 */
function parseLegacyOptionsCell(optionsText = '') {
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
 * Legacy Form Settings row: formId | submitMode | submitUrl | spreadsheetPath
 * @param {string[]} texts
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {boolean}
 */
function applySettingsRow(texts, config) {
  if (texts.length !== 4) return false;
  const [formId, submitMode, submitUrl, spreadsheetPath] = texts;
  if (!formId || LEGACY_FIELD_TYPES.has(formId.toLowerCase())) return false;
  if (CONFIG_KEYS[formId.toLowerCase()]) return false;
  if (BUTTON_TYPES.has(formId.toLowerCase())) return false;

  config.formId = formId;
  if (submitMode) config.submitMode = submitMode;
  config.submitUrl = submitUrl || '';
  if (spreadsheetPath) config.spreadsheetPath = spreadsheetPath;
  return true;
}

/**
 * Block model / dataset / classes from UE.
 * @param {Element} block
 * @param {typeof DEFAULT_CONFIG} config
 */
function applyBlockLevelConfig(block, config) {
  ['formId', 'submitMode', 'submitUrl', 'spreadsheetPath', 'submitLabel'].forEach((key) => {
    if (block.dataset[key]) config[key] = block.dataset[key];
  });
  if (block.classList.contains('spreadsheet')) config.submitMode = 'spreadsheet';
  else if (block.classList.contains('rest')) config.submitMode = 'rest';
}

/**
 * @param {Element} row
 * @param {string[]} texts
 * @param {string} aueModel
 * @returns {{ kind: string, field?: object, button?: object }|null}
 */
function parseItemRow(row, texts, aueModel) {
  const instrumented = row.hasAttribute('data-aue-resource');

  if (aueModel === 'form-text'
    || (TEXT_TYPES.has(texts[0]?.toLowerCase()) && texts.length >= 3)) {
    const [constraint, fieldName, label, settingsRaw = ''] = texts;
    const type = TEXT_TYPES.has(constraint?.toLowerCase()) ? constraint.toLowerCase() : 'text';
    const settings = parseLegacyOptionsCell(settingsRaw);
    return {
      kind: 'field',
      field: {
        type,
        name: fieldName || '',
        label: label || '',
        required: settings.required,
        placeholder: settings.placeholder,
        help: settings.help,
        choices: [],
      },
    };
  }

  if (aueModel === 'form-options'
    || (OPTION_TYPES.has(texts[0]?.toLowerCase()) && texts.length >= 3)) {
    const [optionType, fieldName, label, choicesRaw = ''] = texts;
    const type = OPTION_TYPES.has(optionType?.toLowerCase()) ? optionType.toLowerCase() : 'select';
    const settings = parseLegacyOptionsCell(choicesRaw);
    return {
      kind: 'field',
      field: {
        type,
        name: fieldName || '',
        label: label || '',
        required: settings.required,
        placeholder: settings.placeholder,
        help: settings.help,
        choices: settings.choices,
      },
    };
  }

  if (aueModel === 'form-hidden'
    || (texts.length === 2
      && !CONFIG_KEYS[texts[0]?.toLowerCase()]
      && !BUTTON_TYPES.has(texts[0]?.toLowerCase())
      && !LEGACY_FIELD_TYPES.has(texts[0]?.toLowerCase()))) {
    const [fieldName, value = ''] = texts;
    if (aueModel === 'form-hidden' || instrumented || (fieldName && !CONFIG_KEYS[fieldName.toLowerCase()])) {
      return {
        kind: 'field',
        field: {
          type: 'hidden',
          name: fieldName || '',
          label: fieldName || 'hidden',
          value: value || '',
          required: false,
          placeholder: '',
          help: '',
          choices: [],
        },
      };
    }
  }

  if (aueModel === 'form-button'
    || (texts.length === 2 && BUTTON_TYPES.has(texts[0]?.toLowerCase()))) {
    const [buttonType, label = ''] = texts;
    const type = BUTTON_TYPES.has(buttonType?.toLowerCase()) ? buttonType.toLowerCase() : 'submit';
    return {
      kind: 'button',
      button: {
        type,
        label: label || (type === 'reset' ? 'Reset' : 'Submit'),
      },
    };
  }

  // Legacy Form Field: type | fieldName | label | options
  if (aueModel === 'form-field' || LEGACY_FIELD_TYPES.has(texts[0]?.toLowerCase())) {
    const [typeRaw, fieldName, label, optionsRaw = ''] = texts;
    const type = typeRaw?.toLowerCase();
    if (!LEGACY_FIELD_TYPES.has(type) || texts.length < 3) {
      if (instrumented || aueModel === 'form-field') {
        return {
          kind: 'field',
          field: {
            type: LEGACY_FIELD_TYPES.has(type) ? type : 'text',
            name: fieldName || '',
            label: label || '',
            required: false,
            placeholder: '',
            help: '',
            choices: [],
          },
        };
      }
      return null;
    }
    const optionsMeta = parseLegacyOptionsCell(optionsRaw);
    return {
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
    };
  }

  if (instrumented) {
    return {
      kind: 'field',
      field: {
        type: 'text',
        name: '',
        label: '',
        required: false,
        placeholder: '',
        help: '',
        choices: [],
      },
    };
  }

  return null;
}

/**
 * @param {Element} block
 * @returns {{
 *   config: typeof DEFAULT_CONFIG,
 *   items: Array<{ row: Element, kind: string, field?: object, button?: object }>
 * }}
 */
function parseBlock(block) {
  const config = { ...DEFAULT_CONFIG };
  applyBlockLevelConfig(block, config);
  const items = [];
  let settingsApplied = false;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (!cells.length) return;

    const texts = cells.map((cell) => cell.textContent.trim());
    const key = texts[0]?.toLowerCase();
    const aueModel = row.getAttribute('data-aue-model');

    if (cells.length === 2 && CONFIG_KEYS[key]) {
      const prop = CONFIG_KEYS[key];
      const [, value] = texts;
      if (value) config[prop] = value;
      // Key-value config rows are not form controls; keep UE node only if instrumented
      if (row.hasAttribute('data-aue-resource')) {
        items.push({ row, kind: 'config' });
      }
      return;
    }

    if ((!settingsApplied && applySettingsRow(texts, config))
      || aueModel === 'form-settings') {
      if (!settingsApplied) applySettingsRow(texts, config);
      settingsApplied = true;
      if (row.hasAttribute('data-aue-resource')) {
        items.push({ row, kind: 'settings' });
      }
      return;
    }

    const parsed = parseItemRow(row, texts, aueModel);
    if (parsed) items.push({ row, ...parsed });
  });

  return { config, items };
}

/**
 * @param {object} [field]
 * @returns {HTMLElement}
 */
function buildFieldPlaceholder(field) {
  const wrap = el('div', 'form-field form-field-placeholder');
  const type = field?.type || 'text';
  wrap.textContent = field?.label || field?.name || `Form field (${type}) — set properties in the rail`;
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
 * @returns {HTMLElement|null}
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
function buildHiddenField(field) {
  const input = el('input');
  input.type = 'hidden';
  input.name = field.name;
  input.value = field.value || '';
  input.className = 'form-field form-field-hidden';
  return input;
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
  if (!field.name) return null;
  if (field.type === 'hidden') return buildHiddenField(field);
  if (!field.label) return null;
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
 * @param {object} button
 * @returns {HTMLElement}
 */
function buildButton(button) {
  const btn = el('button', button.type === 'reset' ? 'form-reset' : 'form-submit');
  btn.type = button.type === 'reset' ? 'reset' : 'submit';
  btn.textContent = button.label || (button.type === 'reset' ? 'Reset' : 'Submit');
  return btn;
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
  const { config, items } = parseBlock(block);

  const form = el('form', 'form-element');
  form.setAttribute('novalidate', '');
  form.dataset.submitMode = config.submitMode;
  if (config.formId) form.dataset.formId = config.formId;
  if (config.spreadsheetPath) form.dataset.spreadsheetPath = config.spreadsheetPath;

  const actions = el('div', 'form-actions');
  let hasSubmitButton = false;

  items.forEach(({
    row, kind, field, button,
  }) => {
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

    if (kind === 'button') {
      const btn = buildButton(button);
      if (button.type === 'submit') hasSubmitButton = true;
      moveInstrumentation(row, btn);
      actions.append(btn);
      return;
    }

    // Legacy settings / stray config with UE instrumentation only
    if (!row.hasAttribute('data-aue-resource')) return;
    const wrap = el('div', `form-author-item form-author-${kind}`);
    wrap.textContent = kind === 'settings'
      ? `Form settings (${config.submitMode || 'rest'})`
      : 'Form configuration';
    moveInstrumentation(row, wrap);
    form.append(wrap);
  });

  if (!hasSubmitButton) {
    const submit = buildButton({ type: 'submit', label: config.submitLabel || 'Submit' });
    actions.append(submit);
  }

  if (actions.children.length) form.append(actions);

  const status = el('p', 'form-status');
  status.hidden = true;
  form.append(status);

  enableSubmit(form, config, status);
  block.replaceChildren(form);
}
