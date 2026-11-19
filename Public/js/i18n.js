import { apiEnglish, apiPersian, panelEnglish } from './locales.js';
import { escapeHtml } from './viewText.js';

const preferenceKey = 'tg_collector_language';
const translatableAttributes = ['aria-label', 'placeholder', 'title'];
const staticBindings = [];
const liveBindings = new WeakMap();

function readPreference() {
  try {
    return localStorage.getItem(preferenceKey);
  } catch {
    return null;
  }
}

let language = readPreference() === 'fa' ? 'fa' : 'en';

const locale = () => language === 'fa' ? 'fa-IR' : 'en';
const normalize = value => value.trim().replace(/\s+/gu, ' ');

export function phrase(key, ...args) {
  return { key, args };
}

export function localTime(value) {
  return { time: value };
}

const apiPrefixes = [
  ['Proxy test failed:', 'تست پروکسی ناموفق بود:'],
  ['Matrix connection failed:', 'اتصال به ماتریکس ناموفق بود:'],
  ['Could not connect to the Matrix server:', 'خطا در ارتباط با سرور ماتریکس:'],
  ['Could not connect to Matrix to get a token:', 'خطا در ارتباط با سرور ماتریکس جهت دریافت توکن:'],
  ['Could not sign in to Matrix:', 'ورود به سرور ماتریکس ناموفق بود:'],
  ['Status code:', 'کد خطا:'],
];

const apiPatterns = [
  [
    /^خطا در اتصال به تلگرام از طریق پروکسی \(([^)]+)\): (.+)\. لطفاً وضعیت اتصال/u,
    'Could not connect to Telegram through the proxy ({0}): {1}. Check the connection in Proxy Settings.',
  ],
  [
    /^خطا در اتصال مستقیم به سرورهای تلگرام: (.+)\. به دلیل محدودیت‌های اینترنت/u,
    'Could not connect directly to Telegram: {0}. If Telegram is blocked, enable SOCKS5 or MTProto in Proxy Settings.',
  ],
  [
    /^تنظیمات پروکسی فعال است اما هاست \(([^)]+)\) یا پورت \(([^)]+)\) نامعتبر است/u,
    'The proxy host ({0}) or port ({1}) is invalid. The connection was stopped.',
  ],
];

function translateApiFeedback(value) {
  if (language === 'en') {
    for (const [pattern, template] of apiPatterns) {
      const match = value.match(pattern);
      if (match) return text(phrase(template, ...match.slice(1).map(argument => argument === 'خالی' ? 'empty' : argument)));
    }
  }
  for (const [english, persian] of apiPrefixes) {
    for (const prefix of [english, persian]) {
      if (value.startsWith(prefix)) {
        const detail = text(value.slice(prefix.length).trim());
        return `${language === 'fa' ? persian : english} ${detail}`;
      }
    }
  }
  return value;
}

export function text(value) {
  if (value && typeof value === 'object' && 'time' in value) {
    return new Date(value.time).toLocaleTimeString(locale());
  }
  if (value && typeof value === 'object' && 'key' in value) {
    const template = text(value.key);
    if (value.args.length === 0) return template;
    return template.replace(/\{(\d+)\}/gu, (_, index) => {
      const argument = value.args[index];
      return typeof argument === 'object' && argument !== null ? text(argument) : String(argument ?? '');
    });
  }
  const source = String(value ?? '');
  if (!source) return '';
  const key = normalize(source);
  const translations = language === 'fa' ? apiPersian : apiEnglish;
  return (language === 'en' ? panelEnglish.get(key) : undefined)
    ?? translations.get(key) ?? translateApiFeedback(source);
}

export function setText(element, value) {
  let node = liveBindings.get(element)?.node;
  if (node?.parentNode !== element) {
    node = document.createTextNode('');
    element.replaceChildren(node);
  }
  liveBindings.set(element, { node, value });
  element.dataset.panelText = '';
  const label = text(value);
  if (node.data !== label) node.data = label;
}

export function setValidity(field, message) {
  if (message) {
    liveBindings.set(field, message);
    field.dataset.panelValidity = '';
  } else {
    liveBindings.delete(field);
    delete field.dataset.panelValidity;
  }
  field.setCustomValidity(text(message));
}

export function markup(value) {
  return `<span data-panel-message="${escapeHtml(JSON.stringify(value))}">${escapeHtml(text(value))}</span>`;
}

function staticTextParts(value) {
  const key = normalize(value);
  if (!panelEnglish.has(key)) return null;
  const start = value.match(/^\s*/u)[0];
  const end = value.match(/\s*$/u)[0];
  return { key, start, end, original: value };
}

function captureStaticLabels() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parts = staticTextParts(node.data);
    if (parts) {
      staticBindings.push(() => {
        node.data = language === 'fa' ? parts.original : parts.start + text(parts.key) + parts.end;
      });
    }
  }
  const selector = translatableAttributes.map(attribute => `[${attribute}]`).join(',');
  document.querySelectorAll(selector).forEach(element => {
    for (const attribute of translatableAttributes) {
      const value = element.getAttribute(attribute);
      if (value && panelEnglish.has(normalize(value))) {
        staticBindings.push(() => element.setAttribute(attribute, text(value)));
      }
    }
  });
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
  document.title = language === 'fa' ? 'پنل مدیریت کالکتور تلگرام و ماتریکس' : 'Telegram Collector Administration';
  staticBindings.forEach(update => update());

  document.querySelectorAll('[data-panel-language]').forEach(picker => {
    picker.value = language;
    picker.setAttribute('aria-label', text('زبان پنل'));
  });
  document.querySelectorAll('[data-panel-text]').forEach(element => {
    const binding = liveBindings.get(element);
    if (binding?.node.parentNode === element) binding.node.data = text(binding.value);
  });
  document.querySelectorAll('[data-panel-validity]').forEach(field => field.setCustomValidity(text(liveBindings.get(field))));
  document.querySelectorAll('[data-panel-message]').forEach(element => {
    element.textContent = text(JSON.parse(element.dataset.panelMessage));
  });
  document.querySelectorAll('[data-panel-close-label]').forEach(element => {
    element.setAttribute('aria-label', text('بستن'));
  });
}

export function initializeLanguage() {
  const template = document.getElementById('panel-language-template');
  document.querySelectorAll('.modal-header, .topbar-right, .login-language, .sidebar-language').forEach(host => {
    const picker = template.content.cloneNode(true);
    const close = host.querySelector('.modal-close-btn');
    if (close && !close.hasAttribute('aria-label')) close.setAttribute('aria-label', 'بستن');
    host.insertBefore(picker, close);
  });
  captureStaticLabels();
  applyLanguage();

  document.querySelectorAll('[data-panel-language]').forEach(picker => {
    picker.addEventListener('change', () => {
      language = picker.value === 'fa' ? 'fa' : 'en';
      try {
        localStorage.setItem(preferenceKey, language);
      } catch {
        // The current page still supports switching when storage is unavailable.
      }
      applyLanguage();
    });
  });
}
