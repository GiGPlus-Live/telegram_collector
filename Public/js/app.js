/**
 * Telegram Collector Management Panel - Application Logic
 * Interactive UI, Modal handlers, Step wizard, RTL data-tables, Live link parser.
 */

import { api } from './api.js';
import { isPrivateIPv4 } from './privateNetwork.js';
import { initializeLanguage, localTime, markup, phrase, setText, setValidity, text } from './i18n.js';
import { escapeHtml } from './viewText.js';

initializeLanguage();

// ==========================================================================
// Toast Notification Engine
// ==========================================================================
export function showToast(title, message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };

  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
    <div class="toast-content">
      <div class="toast-title">${markup(title)}</div>
      <div class="toast-msg">${markup(message ?? '')}</div>
    </div>
    <button class="toast-close" data-panel-close-label aria-label="${text('بستن')}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 250);
  };

  closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

// ==========================================================================
// Modal Helpers
// ==========================================================================
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Global modal close triggers
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    const modalId = closeBtn.getAttribute('data-close');
    closeModal(modalId);
  } else if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-backdrop.open');
    openModals.forEach(m => {
      m.classList.remove('open');
    });
    document.body.style.overflow = '';
  }
});

// Confirmation Dialog Helper
let confirmCallback = null;
export function confirmAction({ title, message, confirmText = 'بله، حذف کن', onConfirm }) {
  const modal = document.getElementById('modal-confirm');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-msg');
  const submitBtn = document.getElementById('btn-confirm-action-submit');

  if (titleEl) setText(titleEl, title);
  if (msgEl) setText(msgEl, message);
  if (submitBtn) setText(submitBtn, confirmText);

  confirmCallback = onConfirm;
  openModal('modal-confirm');
}

const confirmSubmitBtn = document.getElementById('btn-confirm-action-submit');
if (confirmSubmitBtn) {
  confirmSubmitBtn.addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
      confirmCallback = null;
    }
    closeModal('modal-confirm');
  });
}

// ==========================================================================
// Tab Switching & Navigation
// ==========================================================================
const TAB_INFO = {
  dashboard: { title: 'داشبورد مانیتورینگ', desc: 'خلاصه وضعیت، سرویس‌ها و اتصالات فعال' },
  accounts: { title: 'اکانت‌های تلگرام', desc: 'مدیریت حساب‌های ورود، سشن‌ها و احراز هویت' },
  channels: { title: 'مدیریت کانال‌ها', desc: 'پیکربندی کانال‌های مقصد و مقاصد ارسال ماتریکس' },
  matrix: { title: 'سرورهای ماتریکس', desc: 'پیکربندی سرورهای چندگانه و تست اعتبار ربات‌ها' },
  proxy: { title: 'تنظیمات پروکسی', desc: 'اتصال SOCKS5/4 و MTProto جهت دور زدن فیلترینگ' }
};

export function switchTab(tabId) {
  // Update sidebar active nav
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update tab-content active
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Update header title
  const info = TAB_INFO[tabId] || { title: 'پنل مدیریت', desc: '' };
  const titleEl = document.getElementById('current-tab-title');
  const descEl = document.getElementById('current-tab-desc');
  if (titleEl) setText(titleEl, info.title);
  if (descEl) setText(descEl, info.desc);

  // Auto-close sidebar on mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  // Trigger tab-specific refresh
  if (tabId === 'dashboard') loadDashboard();
  else if (tabId === 'accounts') loadAccounts();
  else if (tabId === 'channels') loadChannels();
  else if (tabId === 'matrix') { loadMatrixServers(); loadMatrixChannels(); }
  else if (tabId === 'proxy') loadProxySettings();
}

// Bind nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabId = item.getAttribute('data-tab');
    if (tabId) switchTab(tabId);
  });
});

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');
if (mobileMenuBtn && sidebar) {
  mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });
}

// Refresh all button
const btnRefreshAll = document.getElementById('btn-refresh-all');
if (btnRefreshAll) {
  btnRefreshAll.addEventListener('click', async () => {
    btnRefreshAll.disabled = true;
    showToast('بروزرسانی', 'در حال دریافت آخرین اطلاعات از سیستم...', 'info', 2000);
    await Promise.all([
      loadDashboard(),
      loadAccounts(),
      loadChannels(),
      loadMatrixServers(),
      loadMatrixChannels(),
      loadProxySettings()
    ]);
    btnRefreshAll.disabled = false;
    showToast('تکمیل شد', 'تمام داده‌ها بروزرسانی شدند.', 'success', 2500);
  });
}

// Quick action buttons in Dashboard
document.getElementById('btn-quick-add-account')?.addEventListener('click', () => {
  openLoginModal();
});
document.getElementById('btn-quick-add-channel')?.addEventListener('click', () => {
  openAddChannelModal();
});
document.getElementById('btn-quick-add-matrix')?.addEventListener('click', () => {
  openAddMatrixModal();
});

// ==========================================================================
// 1. Dashboard Logic
// ==========================================================================
async function loadDashboard() {
  try {
    const rawStats = await api.system.getStats();
    const stats = rawStats?.data || rawStats || {};
    
    // Stats cards
    const accEl = document.getElementById('dash-stat-accounts');
    const chanEl = document.getElementById('dash-stat-channels');
    const mxEl = document.getElementById('dash-stat-matrix');
    const prxEl = document.getElementById('dash-stat-proxy');
    const prxSubEl = document.getElementById('dash-stat-proxy-sub');

    if (accEl) accEl.textContent = stats.activeAccountsCount ?? 0;
    if (chanEl) chanEl.textContent = stats.activeChannelsCount ?? 0;
    if (mxEl) mxEl.textContent = stats.matrixServersCount ?? 0;

    const isProxyActive = stats.proxyStatus === "فعال" || (stats.proxyType && stats.proxyType !== "none");
    if (prxEl) {
      setText(prxEl, isProxyActive ? "فعال" : "غیرفعال");
      prxEl.style.color = isProxyActive ? "var(--success, #10b981)" : "var(--text-muted, #94a3b8)";
    }
    if (prxSubEl) {
      if (isProxyActive && stats.proxyType && stats.proxyType !== "none") {
        setText(prxSubEl, phrase("پروتکل: {0}", String(stats.proxyType).toUpperCase()));
      } else {
        setText(prxSubEl, "پروتکل: مستقیم (Direct)");
      }
    }

    // Sidebar badges
    const bAcc = document.getElementById('nav-badge-accounts');
    const bChan = document.getElementById('nav-badge-channels');
    const bMx = document.getElementById('nav-badge-matrix');
    if (bAcc) bAcc.textContent = stats.telegramAccountsCount;
    if (bChan) bChan.textContent = stats.channelsCount;
    if (bMx) bMx.textContent = stats.matrixServersCount;

    // Load preview channels
    const channels = await api.channels.getAll();
    const tbody = document.getElementById('dash-channels-preview-tbody');
    if (!tbody) return;

    if (!channels || channels.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <h4>${markup("هیچ کانالی ثبت نشده است")}</h4>
              <p>${markup("برای شروع رصد، اولین کانال تلگرام خود را ثبت نمایید.")}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = channels.slice(0, 5).map(c => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--tg-blue);"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <strong>@${escapeHtml(c.username)}</strong>
          </div>
        </td>
        <td><span class="badge badge-info">${markup(phrase('{0} ثانیه', c.checkIntervalSec || 60))}</span></td>
        <td><code style="font-size: 0.8rem; direction: ltr; display: inline-block;">${escapeHtml(Array.isArray(c.roomIds) ? c.roomIds.join(', ') : (c.roomIds || '-'))}</code></td>
        <td><span class="badge badge-warning">${c.lastMessageId || 0}</span></td>
        <td>
          <span class="badge ${c.enabled !== false ? 'badge-success' : 'badge-danger'}">
            ${markup(c.enabled !== false ? 'فعال' : 'غیرفعال')}
          </span>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// ==========================================================================
// 2. Telegram Accounts & Modern Telegram-Style Login Flow
// ==========================================================================
let currentLoginToken = null;

// Comprehensive Countries Dataset with Priority Ranking & Flags
const TG_COUNTRIES = [
  { name: "ایران", enName: "Iran", code: "+98", flag: "🇮🇷", priority: 1 },
  { name: "ایالات متحده آمریکا", enName: "United States", code: "+1", flag: "🇺🇸", priority: 2 },
  { name: "کانادا", enName: "Canada", code: "+1", flag: "🇨🇦", priority: 3 },
  { name: "آلمان", enName: "Germany", code: "+49", flag: "🇩🇪", priority: 4 },
  { name: "ترکیه", enName: "Turkey", code: "+90", flag: "🇹🇷", priority: 5 },
  { name: "بریتانیا (انگلستان)", enName: "United Kingdom", code: "+44", flag: "🇬🇧", priority: 6 },
  { name: "امارات متحده عربی", enName: "United Arab Emirates", code: "+971", flag: "🇦🇪", priority: 7 },
  { name: "افغانستان", enName: "Afghanistan", code: "+93", flag: "🇦🇫", priority: 8 },
  { name: "عراق", enName: "Iraq", code: "+964", flag: "🇮🇶", priority: 9 },
  { name: "فرانسه", enName: "France", code: "+33", flag: "🇫🇷", priority: 10 },
  { name: "روسیه", enName: "Russia", code: "+7", flag: "🇷🇺" },
  { name: "هلند", enName: "Netherlands", code: "+31", flag: "🇳🇱" },
  { name: "ایتالیا", enName: "Italy", code: "+39", flag: "🇮🇹" },
  { name: "سوئیس", enName: "Switzerland", code: "+41", flag: "🇨🇭" },
  { name: "سوئد", enName: "Sweden", code: "+46", flag: "🇸🇪" },
  { name: "اتریش", enName: "Austria", code: "+43", flag: "🇦🇹" },
  { name: "استرالیا", enName: "Australia", code: "+61", flag: "🇦🇺" },
  { name: "اسپانیا", enName: "Spain", code: "+34", flag: "🇪🇸" },
  { name: "ارمنستان", enName: "Armenia", code: "+374", flag: "🇦🇲" },
  { name: "گرجستان", enName: "Georgia", code: "+995", flag: "🇬🇪" },
  { name: "آذربایجان", enName: "Azerbaijan", code: "+994", flag: "🇦🇿" },
  { name: "قطر", enName: "Qatar", code: "+974", flag: "🇶🇦" },
  { name: "عمان", enName: "Oman", code: "+968", flag: "🇴🇲" },
  { name: "کویت", enName: "Kuwait", code: "+965", flag: "🇰🇼" },
  { name: "عربستان سعودی", enName: "Saudi Arabia", code: "+966", flag: "🇸🇦" },
  { name: "چین", enName: "China", code: "+86", flag: "🇨🇳" },
  { name: "ژاپن", enName: "Japan", code: "+81", flag: "🇯🇵" },
  { name: "کره جنوبی", enName: "South Korea", code: "+82", flag: "🇰🇷" },
  { name: "هند", enName: "India", code: "+91", flag: "🇮🇳" },
  { name: "پاکستان", enName: "Pakistan", code: "+92", flag: "🇵🇰" },
  { name: "مالزی", enName: "Malaysia", code: "+60", flag: "🇲🇾" },
  { name: "سنگاپور", enName: "Singapore", code: "+65", flag: "🇸🇬" },
  { name: "نروژ", enName: "Norway", code: "+47", flag: "🇳🇴" },
  { name: "دانمارک", enName: "Denmark", code: "+45", flag: "🇩🇰" },
  { name: "فنلاند", enName: "Finland", code: "+358", flag: "🇫🇮" },
  { name: "لهستان", enName: "Poland", code: "+48", flag: "🇵🇱" },
  { name: "اوکراین", enName: "Ukraine", code: "+380", flag: "🇺🇦" },
  { name: "بلژیک", enName: "Belgium", code: "+32", flag: "🇧🇪" },
  { name: "یونان", enName: "Greece", code: "+30", flag: "🇬🇷" },
  { name: "پرتغال", enName: "Portugal", code: "+351", flag: "🇵🇹" },
  { name: "ایرلند", enName: "Ireland", code: "+353", flag: "🇮🇪" },
  { name: "برزیل", enName: "Brazil", code: "+55", flag: "🇧🇷" },
  { name: "آفریقای جنوبی", enName: "South Africa", code: "+27", flag: "🇿🇦" },
  { name: "تاجیکستان", enName: "Tajikistan", code: "+992", flag: "🇹🇯" },
  { name: "ازبکستان", enName: "Uzbekistan", code: "+998", flag: "🇺🇿" },
  { name: "ترکمنستان", enName: "Turkmenistan", code: "+993", flag: "🇹🇲" },
  { name: "قزاقستان", enName: "Kazakhstan", code: "+7", flag: "🇰🇿" }
];

let selectedTgCountry = TG_COUNTRIES[0]; // Default Iran (+98)

// Render Country List in Dropdown
function renderTgCountryList(filterText = "") {
  const listEl = document.getElementById('tg-country-list');
  if (!listEl) return;

  const query = filterText.trim().toLowerCase();
  const filtered = TG_COUNTRIES.filter(c => {
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      c.enName.toLowerCase().includes(query) ||
      c.code.includes(query) ||
      c.code.replace('+', '').includes(query)
    );
  });

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = `<li style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.85rem;">${markup("کشوری یافت نشد")}</li>`;
    return;
  }

  filtered.forEach(country => {
    const li = document.createElement('li');
    li.className = `country-item ${country.code === selectedTgCountry.code && country.enName === selectedTgCountry.enName ? 'active' : ''}`;
    li.innerHTML = `
      <span class="item-flag">${country.flag}</span>
      <span class="item-name">${markup(phrase('{0} ({1})', country.name, country.enName))}</span>
      <span class="item-code">${country.code}</span>
    `;
    li.addEventListener('click', () => {
      selectTgCountry(country);
      closeTgCountryDropdown();
    });
    listEl.appendChild(li);
  });
}

function selectTgCountry(country) {
  selectedTgCountry = country;
  const flagEl = document.getElementById('tg-selected-flag');
  const nameEl = document.getElementById('tg-selected-country-name');
  const codeBadgeEl = document.getElementById('tg-selected-dial-code');
  const prefixEl = document.getElementById('tg-dial-prefix');

  if (flagEl) flagEl.textContent = country.flag;
  if (nameEl) setText(nameEl, phrase('{0} ({1})', country.name, country.enName));
  if (codeBadgeEl) codeBadgeEl.textContent = country.code;
  if (prefixEl) prefixEl.textContent = country.code;

  updateTgFullPhone();
}

function openTgCountryDropdown() {
  const dropdown = document.getElementById('tg-country-dropdown');
  const btn = document.getElementById('tg-country-select-btn');
  const searchInput = document.getElementById('tg-country-search-input');
  if (!dropdown) return;

  dropdown.style.display = 'flex';
  if (btn) btn.setAttribute('aria-expanded', 'true');
  renderTgCountryList('');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }
}

function closeTgCountryDropdown() {
  const dropdown = document.getElementById('tg-country-dropdown');
  const btn = document.getElementById('tg-country-select-btn');
  if (dropdown) dropdown.style.display = 'none';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function updateTgFullPhone() {
  const nationalInput = document.getElementById('tg-login-phone-number');
  const previewEl = document.getElementById('tg-full-phone-preview');
  const hiddenPhoneEl = document.getElementById('tg-login-phone');
  if (!nationalInput) return;

  let raw = nationalInput.value.replace(/\D/g, ''); // Digits only

  // If user pasted a full international number with + or 00
  if (nationalInput.value.trim().startsWith('+') || nationalInput.value.trim().startsWith('00')) {
    const fullPasted = nationalInput.value.trim().replace(/^00/, '+');
    // Match against country dial codes
    const matched = TG_COUNTRIES.find(c => fullPasted.startsWith(c.code));
    if (matched) {
      selectTgCountry(matched);
      raw = fullPasted.slice(matched.code.length).replace(/\D/g, '');
      nationalInput.value = raw;
    }
  }

  // If starts with 0 (e.g. 0912...), remove leading zero
  if (raw.startsWith('0')) {
    raw = raw.replace(/^0+/, '');
    nationalInput.value = raw;
  }

  const fullPhone = raw ? `${selectedTgCountry.code}${raw}` : selectedTgCountry.code;
  if (previewEl) previewEl.textContent = fullPhone;
  if (hiddenPhoneEl) hiddenPhoneEl.value = fullPhone;
}

// Check and display Proxy status in Modal
async function updateModalProxyStatus() {
  const statusCard = document.getElementById('tg-modal-proxy-status');
  const titleText = document.getElementById('tg-proxy-title-text');
  const typeBadge = document.getElementById('tg-proxy-badge-type');
  const addrBadge = document.getElementById('tg-proxy-badge-addr');
  const subtext = document.getElementById('tg-proxy-subtext');
  const actionBtn = document.getElementById('btn-modal-proxy-action');

  if (!statusCard) return;

  try {
    const settings = await api.settings.get();
    const proxy = settings?.proxy || {};
    const isEnabled = proxy.enabled === true || (proxy.enabled !== false && proxy.type && proxy.type !== 'none');

    if (isEnabled && proxy.host && proxy.port) {
      statusCard.className = 'modal-proxy-status-card proxy-active';
      if (titleText) setText(titleText, 'پروکسی فعال است (ترافیک تلگرام محافظت‌شده)');
      if (typeBadge) {
        typeBadge.textContent = String(proxy.type || 'SOCKS5').toUpperCase();
        typeBadge.style.display = 'inline-block';
      }
      if (addrBadge) {
        addrBadge.textContent = `${proxy.host}:${proxy.port}`;
        addrBadge.style.display = 'inline-block';
      }
      if (subtext) setText(subtext, 'تمام ارتباطات احراز هویت، دانلودها و مانیتورینگ تلگرام از این پروکسی عبور می‌کند.');
      if (actionBtn) {
        setText(actionBtn, 'تنظیمات پروکسی');
        actionBtn.style.display = 'block';
        actionBtn.onclick = () => {
          closeModal('modal-tg-login');
          switchTab('proxy');
        };
      }
    } else {
      statusCard.className = 'modal-proxy-status-card proxy-inactive';
      if (titleText) setText(titleText, 'هشدار: پروکسی غیرفعال است (اتصال مستقیم)');
      if (typeBadge) typeBadge.style.display = 'none';
      if (addrBadge) addrBadge.style.display = 'none';
      if (subtext) subtext.innerHTML = `<span style="color:#f59e0b;">${markup("به دلیل فیلترینگ تلگرام در ایران، لطفاً پروکسی را در تب تنظیمات فعال فرمایید.")}</span>`;
      if (actionBtn) {
        setText(actionBtn, 'فعالسازی پروکسی');
        actionBtn.style.display = 'block';
        actionBtn.onclick = () => {
          closeModal('modal-tg-login');
          switchTab('proxy');
        };
      }
    }
  } catch (err) {
    if (subtext) setText(subtext, phrase('خطا در بارگذاری وضعیت پروکسی: {0}', phrase(err.message)));
  }
}

export function openLoginModal() {
  currentLoginToken = null;
  setStep(1);

  const form = document.getElementById('form-tg-step1');
  form.reset();
  for (const field of form.querySelectorAll('input[required]')) {
    setValidity(field, '');
  }
  const codeInput = document.getElementById('tg-login-code');
  if (codeInput) codeInput.value = '';
  const passInput = document.getElementById('tg-login-password');
  if (passInput) passInput.value = '';

  // Reset to default Iran (+98)
  selectTgCountry(TG_COUNTRIES[0]);

  // Clear credentials cached by older versions of the panel.
  try {
    localStorage.removeItem('tg_saved_api_creds');
  } catch (e) {}

  // Update dynamic proxy status banner
  updateModalProxyStatus();

  openModal('modal-tg-login');
}

function setStep(stepNum) {
  for (let i = 1; i <= 3; i++) {
    const nav = document.getElementById(`step-nav-${i}`);
    const panel = document.getElementById(`step-panel-${i}`);
    if (nav) {
      nav.classList.remove('active', 'completed');
      if (i < stepNum) nav.classList.add('completed');
      if (i === stepNum) nav.classList.add('active');
    }
    if (panel) {
      panel.classList.toggle('active', i === stepNum);
    }
  }
}

// Bind Country Selector and Input events
document.addEventListener('DOMContentLoaded', () => {
  // Country select button toggle
  const countryBtn = document.getElementById('tg-country-select-btn');
  if (countryBtn) {
    countryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('tg-country-dropdown');
      if (dropdown && dropdown.style.display === 'flex') {
        closeTgCountryDropdown();
      } else {
        openTgCountryDropdown();
      }
    });
  }

  // Search input live filtering
  const searchInput = document.getElementById('tg-country-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderTgCountryList(e.target.value);
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('tg-country-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
      closeTgCountryDropdown();
    }
  });

  // Phone input formatting & live preview
  const nationalInput = document.getElementById('tg-login-phone-number');
  if (nationalInput) {
    nationalInput.addEventListener('input', updateTgFullPhone);
    nationalInput.addEventListener('paste', () => setTimeout(updateTgFullPhone, 10));
  }

  // Collapsible API Guide Accordion toggle
  const guideBtn = document.getElementById('tg-api-guide-btn');
  const guideAcc = document.getElementById('tg-api-guide-acc');
  const guideBody = document.getElementById('tg-api-guide-body');
  if (guideBtn && guideAcc && guideBody) {
    guideBtn.addEventListener('click', () => {
      const isOpen = guideAcc.classList.contains('open');
      if (isOpen) {
        guideAcc.classList.remove('open');
        guideBody.style.display = 'none';
      } else {
        guideAcc.classList.add('open');
        guideBody.style.display = 'block';
      }
    });
  }
});

// Step 1: Send Code Form
const formStep1 = document.getElementById('form-tg-step1');
if (formStep1) {
  const nationalInput = document.getElementById('tg-login-phone-number');
  const apiIdInput = document.getElementById('tg-login-api-id');
  const apiHashInput = document.getElementById('tg-login-api-hash');
  for (const field of [nationalInput, apiIdInput, apiHashInput]) {
    field.addEventListener('input', () => setValidity(field, ''));
  }

  formStep1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-tg-send-code');
    if (btn.disabled) return;
    updateTgFullPhone();

    const phone = document.getElementById('tg-login-phone').value.trim();
    const nationalDigits = nationalInput.value.replace(/\D/g, '');
    const apiId = apiIdInput.value.trim();
    const apiHash = apiHashInput.value.trim();
    const invalidFields = [];

    if (nationalDigits.length < 4 || phone.length > 16) {
      invalidFields.push([nationalInput, 'شمارهٔ موبایل معتبر وارد کنید.']);
    }
    if (!apiId) {
      invalidFields.push([apiIdInput, 'API ID برنامهٔ تلگرام را وارد کنید.']);
    } else if (!/^[0-9]+$/.test(apiId) || Number(apiId) <= 0 || Number(apiId) > 2147483647) {
      invalidFields.push([apiIdInput, 'API ID باید یک عدد صحیح مثبت و معتبر باشد.']);
    }
    if (!apiHash) {
      invalidFields.push([apiHashInput, 'API Hash برنامهٔ تلگرام را وارد کنید.']);
    } else if (!/^[a-f0-9]{32}$/i.test(apiHash)) {
      invalidFields.push([apiHashInput, 'API Hash باید ۳۲ نویسه از اعداد ۰ تا ۹ و حروف A تا F باشد.']);
    }
    for (const field of [nationalInput, apiIdInput, apiHashInput]) {
      setValidity(field, '');
    }
    for (const [field, message] of invalidFields) {
      setValidity(field, message);
    }
    if (!formStep1.reportValidity()) return;

    const originalLabel = [...btn.childNodes];
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true" style="display:inline-block; width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> ${markup("در حال درخواست کد از تلگرام…")}`;

    try {
      const res = await api.telegram.sendCode({ phone, apiId, apiHash });
      currentLoginToken = res?.loginToken || res?.data?.loginToken;
      if (!currentLoginToken) {
        throw new Error('جلسهٔ ورود ایجاد نشد. دوباره درخواست کد بدهید.');
      }
      sessionStorage.setItem('current_tg_login_token', currentLoginToken);

      showToast('کد ارسال شد', 'کد تأیید را که از تلگرام دریافت می‌کنید وارد کنید.', 'success');

      const note = document.getElementById('tg-code-sent-note');
      if (note) setText(note, phrase("کد تأیید ارسال‌شده برای شمارهٔ {0} را وارد کنید.", phone));

      setStep(2);
      const codeInput = document.getElementById('tg-login-code');
      if (codeInput) codeInput.focus();
    } catch (err) {
      showToast('خطا در ارسال کد', err.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.replaceChildren(...originalLabel);
    }
  });
}

// Step 2: Verify Code Form
const formStep2 = document.getElementById('form-tg-step2');
if (formStep2) {
  formStep2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('tg-login-code').value.trim();

    if (!code) {
      showToast('خطا', 'لطفاً کد تایید را وارد نمایید.', 'danger');
      return;
    }

    const token = currentLoginToken || sessionStorage.getItem('current_tg_login_token');
    if (!token) {
      showToast('خطا', 'جلسه ورود نامعتبر است. لطفاً مجدداً شماره را ارسال کنید.', 'danger');
      setStep(1);
      return;
    }

    const btn = document.getElementById('btn-tg-verify-code');
    btn.disabled = true;
    setText(btn, 'در حال بررسی...');

    try {
      const res = await api.telegram.verifyCode({ loginToken: token, code });
      
      if (res.needs2FA) {
        showToast('نیاز به تایید دومرحله‌ای', res.message || 'گذرواژه ابری (2FA) مورد نیاز است.', 'warning');
        setStep(3);
        const passInput = document.getElementById('tg-login-password');
        if (passInput) passInput.focus();
      } else {
        // Success
        showToast('ورود موفق', res.message || 'اکانت تلگرام با موفقیت افزوده شد.', 'success');
        closeModal('modal-tg-login');
        await loadAccounts();
        await loadDashboard();
      }
    } catch (err) {
      showToast('کد نامعتبر است', err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${markup("بررسی کد و ورود")} <svg class="wizard-direction-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    }
  });
}

// Step 3: Verify 2FA Form
const formStep3 = document.getElementById('form-tg-step3');
if (formStep3) {
  formStep3.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('tg-login-password').value;

    if (!password) {
      showToast('خطا', 'لطفاً رمز دو مرحله‌ای را وارد کنید.', 'danger');
      return;
    }

    const token = currentLoginToken || sessionStorage.getItem('current_tg_login_token');
    if (!token) {
      showToast('خطا', 'جلسه ورود نامعتبر است. لطفاً مجدداً اقدام فرمایید.', 'danger');
      setStep(1);
      return;
    }

    const btn = document.getElementById('btn-tg-verify-2fa');
    btn.disabled = true;
    setText(btn, 'در حال تایید رمز...');

    try {
      const res = await api.telegram.verify2FA({ loginToken: token, password });
      showToast('اتصال برقرار شد', res.message || 'احراز هویت کامل شد و اکانت متصل گردید.', 'success');
      closeModal('modal-tg-login');
      await loadAccounts();
      await loadDashboard();
    } catch (err) {
      showToast('خطا در احراز هویت 2FA', err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${markup("تکمیل ورود و ثبت اکانت")} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
  });
}

// Stepper back buttons
document.getElementById('btn-tg-back-to-step1')?.addEventListener('click', () => setStep(1));
document.getElementById('btn-tg-back-to-step2')?.addEventListener('click', () => setStep(2));
document.getElementById('btn-open-login-modal')?.addEventListener('click', openLoginModal);

async function loadAccounts() {
  try {
    const accounts = await api.telegram.getAccounts();
    const tbody = document.getElementById('accounts-tbody');
    if (!tbody) return;

    if (!accounts || accounts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <h4>${markup("هیچ اکانت تلگرامی متصل نشده است")}</h4>
              <p>${markup("با زدن دکمه «ورود اکانت تلگرام جدید» اولین سشن خود را اضافه کنید.")}</p>
              <button class="btn btn-primary btn-sm" id="btn-empty-add-account">${markup("ورود اکانت")}</button>
            </div>
          </td>
        </tr>
      `;
      document.getElementById('btn-empty-add-account')?.addEventListener('click', openLoginModal);
      return;
    }

    tbody.innerHTML = accounts.map(a => {
      const id = a._id || a.id;
      const displayName = a.title || a.firstName || a.username || a.phone;
      const isAccActive = a.isActive !== undefined ? a.isActive : (a.enabled !== undefined ? a.enabled : true);
      const lastSeen = a.updatedAt || a.lastActive || a.createdAt;
      return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--tg-blue-glow); color: var(--tg-blue-light); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
              TG
            </div>
            <strong style="direction: ltr; font-family: monospace;">${escapeHtml(a.phone)}</strong>
          </div>
        </td>
        <td>
          <div>
            <strong dir="auto">${displayName ? escapeHtml(displayName) : markup('کاربر تلگرام')}</strong>
            ${a.username ? `<span style="display: block; font-size: 0.75rem; color: var(--text-muted); direction: ltr;">@${escapeHtml(a.username)}</span>` : ''}
          </div>
        </td>
        <td><code style="font-size: 0.8rem;">${escapeHtml(String(a.apiId || '—'))}</code></td>
        <td>
          <label class="switch">
            <input type="checkbox" class="acc-toggle" data-id="${id}" ${isAccActive ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">
            ${markup(lastSeen ? localTime(lastSeen) : 'هم‌اکنون')}
          </span>
        </td>
        <td>
          <button class="btn btn-danger btn-sm btn-delete-account" data-id="${id}" data-phone="${escapeHtml(a.phone)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            ${markup("حذف")}
          </button>
        </td>
      </tr>
    `;
    }).join('');

    // Bind toggles
    tbody.querySelectorAll('.acc-toggle').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        const id = chk.getAttribute('data-id');
        const enabled = chk.checked;
        await api.telegram.toggleAccount(id, enabled);
        showToast('وضعیت اکانت بروز شد', phrase("اکانت {0} گردید.", phrase(enabled ? 'فعال' : 'غیرفعال')), 'info', 2000);
        await loadDashboard();
      });
    });

    // Bind delete
    tbody.querySelectorAll('.btn-delete-account').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const phone = btn.getAttribute('data-phone');
        confirmAction({
          title: 'حذف اکانت تلگرام',
          message: phrase("آیا از حذف اکانت شماره {0} و ابطال سشن آن اطمینان دارید؟", phone),
          onConfirm: async () => {
            await api.telegram.deleteAccount(id);
            showToast('حذف اکانت', 'اکانت مورد نظر با موفقیت حذف گردید.', 'success');
            await loadAccounts();
            await loadDashboard();
          }
        });
      });
    });

  } catch (err) {
    console.error('Error loading accounts:', err);
  }
}

// ==========================================================================
// 3. Channels Management & Live Link Parsing
// ==========================================================================
function parseChannelInput(input) {
  if (!input) return '';
  let clean = input.trim();
  const invite = clean.match(/(?:joinchat\/|\/\+)([\w-]+)/i);
  if (invite) return `+${invite[1]}`;
  // Strip url patterns: https://t.me/channel, http://t.me/channel, t.me/channel
  clean = clean.replace(/^(https?:\/\/)?(www\.)?t\.me\//i, '');
  // Strip leading @
  clean = clean.replace(/^@+/, '');
  // Strip any trailing query or slashes
  clean = clean.split(/[/?#]/)[0];
  return clean;
}

const channelInputLink = document.getElementById('channel-input-link');
const channelNormalizedVal = document.getElementById('channel-normalized-val');
if (channelInputLink && channelNormalizedVal) {
  channelInputLink.addEventListener('input', () => {
    const parsed = parseChannelInput(channelInputLink.value);
    channelNormalizedVal.textContent = parsed ? `@${parsed}` : '-';
  });
}

export async function openAddChannelModal(channelToEdit = null) {
  const modalTitle = document.getElementById('modal-channel-title');
  const editIdInput = document.getElementById('channel-edit-id');
  const linkInput = document.getElementById('channel-input-link');
  const titleInput = document.getElementById('channel-title');
  const intervalInput = document.getElementById('channel-interval');
  const roomIdsInput = document.getElementById('channel-room-ids');
  const enabledSwitch = document.getElementById('channel-enabled-switch');
  const pickersContainer = document.getElementById('channel-matrix-pickers-list');

  // Load and populate Matrix Channels picker
  let matrixChannels = [];
  try {
    matrixChannels = await api.matrixChannels.getAll();
  } catch (err) {
    console.error('Failed to load matrix channels for picker:', err);
  }

  // Selected matrix channel IDs for this channel
  const selectedMxIds = new Set();
  if (channelToEdit && Array.isArray(channelToEdit.matrixChannelIds)) {
    channelToEdit.matrixChannelIds.forEach(target => {
      const id = typeof target === 'object' ? (target._id || target.id) : target;
      if (id) selectedMxIds.add(String(id));
    });
  }

  if (pickersContainer) {
    if (!matrixChannels || matrixChannels.length === 0) {
      pickersContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 12px;">
          ${markup("هیچ کانال ماتریکسی تعریف نشده است.")}
          <br>
          <button type="button" class="btn btn-matrix btn-sm" id="btn-picker-add-mx" style="margin-top: 6px; font-size: 0.78rem;">
            ${markup("➕ تعریف اولین کانال ماتریکس")}
          </button>
        </div>
      `;
      document.getElementById('btn-picker-add-mx')?.addEventListener('click', () => openMatrixChannelModal());
    } else {
      pickersContainer.innerHTML = matrixChannels.map(mx => {
        const id = mx._id || mx.id;
        const isChecked = selectedMxIds.has(String(id));
        const srvName = mx.matrixServerId?.name || (typeof mx.matrixServerId === 'string' ? mx.matrixServerId : phrase('سرور ماتریکس'));
        const uploadRule = mx.mediaSettings?.textOnly ? phrase('فقط متن') : (mx.mediaSettings?.maxMb ? phrase('سقف {0}MB', mx.mediaSettings.maxMb) : phrase('مدیا آزاد'));
        return `
          <div class="matrix-channel-pick-item">
            <label>
              <input type="checkbox" name="tg-dest-matrix-channel" value="${id}" ${isChecked ? 'checked' : ''}>
              <div class="matrix-channel-pick-info">
                <span class="matrix-channel-pick-title">${escapeHtml(mx.name)}</span>
                <span class="matrix-channel-pick-meta">${markup(phrase('سرور: {0} | اتاق: {1} | ({2})', srvName, mx.roomId, uploadRule))}</span>
              </div>
            </label>
          </div>
        `;
      }).join('');
    }
  }

  if (channelToEdit) {
    setText(modalTitle, 'ویرایش کانال تلگرام');
    editIdInput.value = channelToEdit._id || channelToEdit.id;
    linkInput.value = channelToEdit.username;
    titleInput.value = channelToEdit.title || '';
    intervalInput.value = channelToEdit.checkIntervalSec || 60;
    if (roomIdsInput) {
      roomIdsInput.value = Array.isArray(channelToEdit.roomIds) ? channelToEdit.roomIds.join(', ') : (channelToEdit.roomIds || '');
    }
    enabledSwitch.checked = channelToEdit.enabled !== false;

    // Populate Telegram media download settings
    const tgMs = channelToEdit.mediaSettings?.telegram || {};
    const tgTextOnly = document.getElementById('tg-media-textonly');
    const tgMaxMb = document.getElementById('tg-media-maxmb');
    if (tgTextOnly) tgTextOnly.checked = !!tgMs.textOnly;
    if (tgMaxMb) tgMaxMb.value = tgMs.maxMb || 0;
    const tgPerCat = tgMs.perCategory || {};
    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`tg-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`tg-cat-${cat}-enable`);
      const catVal = tgPerCat[cat];
      if (elMb) elMb.value = catVal?.maxMb !== undefined ? catVal.maxMb : '';
      if (elEn) elEn.checked = catVal?.enabled !== undefined ? Boolean(catVal.enabled) : (cat === 'documents' || cat === 'stickers' ? false : true);
    }
  } else {
    setText(modalTitle, 'ثبت کانال تلگرام جدید');
    editIdInput.value = '';
    linkInput.value = '';
    titleInput.value = '';
    intervalInput.value = '60';
    enabledSwitch.checked = true;
    if (roomIdsInput) roomIdsInput.value = '';

    // Reset Telegram media fields
    const tgTextOnly = document.getElementById('tg-media-textonly');
    const tgMaxMb = document.getElementById('tg-media-maxmb');
    if (tgTextOnly) tgTextOnly.checked = false;
    if (tgMaxMb) tgMaxMb.value = 0;
    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`tg-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`tg-cat-${cat}-enable`);
      if (elMb) elMb.value = '';
      if (elEn) elEn.checked = (cat === 'documents' || cat === 'stickers') ? false : true;
    }
  }

  if (channelNormalizedVal) {
    const parsed = parseChannelInput(linkInput.value);
    channelNormalizedVal.textContent = parsed ? `@${parsed}` : '-';
  }

  openModal('modal-channel');
}

document.getElementById('btn-open-add-channel-modal')?.addEventListener('click', () => openAddChannelModal());
document.getElementById('btn-quick-add-matrix-channel')?.addEventListener('click', () => openMatrixChannelModal());

// Channel form submit
const formChannel = document.getElementById('form-channel');
if (formChannel) {
  formChannel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('channel-edit-id').value;
    const rawLink = document.getElementById('channel-input-link').value;
    const username = parseChannelInput(rawLink);
    const title = document.getElementById('channel-title').value.trim();
    const checkIntervalSec = Number(document.getElementById('channel-interval').value) || 60;
    const rawRooms = document.getElementById('channel-room-ids')?.value || '';
    const enabled = document.getElementById('channel-enabled-switch').checked;

    if (!username) {
      showToast('خطا', 'لطفاً نام کاربری یا لینک معتبر کانال تلگرام را وارد کنید.', 'danger');
      return;
    }

    if (checkIntervalSec < 10) {
      showToast('خطا', 'بازه بررسی پیام‌ها باید حداقل ۱۰ ثانیه باشد.', 'danger');
      return;
    }

    // Collect selected Matrix Channel IDs
    const checkedMxBoxes = document.querySelectorAll('input[name="tg-dest-matrix-channel"]:checked');
    const matrixChannelIds = Array.from(checkedMxBoxes).map(cb => cb.value);

    // Fallback direct roomIds
    const roomIds = rawRooms.split(',').map(r => r.trim()).filter(Boolean);

    // Collect Telegram download media settings
    const tgMediaSettings = {
      textOnly: !!document.getElementById('tg-media-textonly')?.checked,
      maxMb: Number(document.getElementById('tg-media-maxmb')?.value) || 0,
      perCategory: {},
    };
    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`tg-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`tg-cat-${cat}-enable`);
      const isEnabled = elEn ? elEn.checked : true;
      const mbVal = elMb?.value ? Number(elMb.value) : (cat === 'videos' ? 10 : cat === 'audio' ? 5 : 0);
      tgMediaSettings.perCategory[cat] = {
        enabled: isEnabled,
        maxMb: mbVal,
      };
    }

    const payload = {
      username,
      title: title || username,
      checkIntervalSec,
      matrixChannelIds,
      roomIds,
      enabled,
      mediaSettings: {
        telegram: tgMediaSettings,
      },
    };

    const submitBtn = document.getElementById('btn-save-channel');
    submitBtn.disabled = true;

    try {
      if (editId) {
        await api.channels.update(editId, payload);
        showToast('بروزرسانی موفق', phrase("کانال @{0} با موفقیت ویرایش شد.", username), 'success');
      } else {
        await api.channels.create(payload);
        showToast('ثبت موفق', phrase("کانال @{0} به لیست مانیتورینگ افزوده شد.", username), 'success');
      }

      closeModal('modal-channel');
      await loadChannels();
      await loadDashboard();
    } catch (err) {
      showToast('خطا در ثبت کانال', err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Search filter for channels
let channelsCache = [];
const channelSearchInput = document.getElementById('channel-search-input');
if (channelSearchInput) {
  channelSearchInput.addEventListener('input', () => {
    renderChannelsList(channelsCache, channelSearchInput.value);
  });
}

async function loadChannels() {
  try {
    channelsCache = await api.channels.getAll();
    renderChannelsList(channelsCache, channelSearchInput?.value || '');
  } catch (err) {
    console.error('Error loading channels:', err);
  }
}

function renderChannelsList(channels, filterText = '') {
  const tbody = document.getElementById('channels-tbody');
  if (!tbody) return;

  let filtered = channels;
  if (filterText.trim()) {
    const q = filterText.trim().toLowerCase();
    filtered = channels.filter(c => 
      c.username.toLowerCase().includes(q) || 
      (c.title && c.title.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h4>${markup("هیچ کانالی یافت نشد")}</h4>
            <p>${markup("کانالی با مشخصات وارد شده پیدا نشد یا هنوز کانالی ثبت نکرده‌اید.")}</p>
            <button class="btn btn-primary btn-sm" id="btn-empty-add-channel">${markup("ثبت اولین کانال")}</button>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('btn-empty-add-channel')?.addEventListener('click', () => openAddChannelModal());
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const id = c._id || c.id;
    const rooms = Array.isArray(c.roomIds) ? c.roomIds : (c.roomIds ? [c.roomIds] : []);
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--tg-blue);"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <div>
              <strong style="direction: ltr; font-family: monospace;">@${escapeHtml(c.username)}</strong>
              <a href="https://t.me/${escapeHtml(c.username)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.74rem; color: var(--tg-blue-light); display: block; text-decoration: none;">
                ${markup('مشاهده در تلگرام ↗')}
              </a>
            </div>
          </div>
        </td>
        <td><strong>${escapeHtml(c.title || c.username)}</strong></td>
        <td><span class="badge badge-info">${markup(phrase('{0} ثانیه', c.checkIntervalSec || 60))}</span></td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 260px;">
            ${(c.matrixChannelIds || []).map(mx => `<span class="badge badge-matrix" style="font-size: 0.72rem;">[m] ${escapeHtml(mx.name || mx.roomId || mx)}</span>`).join('')}
            ${rooms.map(r => `<code style="font-size: 0.72rem; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; direction: ltr;">${escapeHtml(r)}</code>`).join('')}
            ${(!c.matrixChannelIds?.length && !rooms.length) ? '<span style="color: var(--text-muted);">-</span>' : ''}
          </div>
        </td>
        <td><span class="badge badge-warning">${c.lastMessageId || 0}</span></td>
        <td>
          <label class="switch">
            <input type="checkbox" class="channel-toggle" data-id="${id}" ${c.enabled !== false ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm btn-edit-channel" data-id="${id}">
              ${markup('ویرایش')}
            </button>
            <button class="btn btn-danger btn-sm btn-delete-channel" data-id="${id}" data-user="${escapeHtml(c.username)}">
              ${markup('حذف')}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Bind toggles
  tbody.querySelectorAll('.channel-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id = chk.getAttribute('data-id');
      const enabled = chk.checked;
      await api.channels.update(id, { enabled });
      showToast('وضعیت کانال تغییر کرد', phrase("رصد کانال {0} گردید.", phrase(enabled ? 'فعال' : 'غیرفعال')), 'info', 2000);
      await loadDashboard();
    });
  });

  // Bind edit
  tbody.querySelectorAll('.btn-edit-channel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const channel = channelsCache.find(c => (c._id || c.id) === id);
      if (channel) openAddChannelModal(channel);
    });
  });

  // Bind delete
  tbody.querySelectorAll('.btn-delete-channel').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const user = btn.getAttribute('data-user');
      confirmAction({
        title: 'حذف کانال',
        message: phrase("آیا از حذف کانال @{0} از لیست رصد و عدم استخراج پیام‌های بعدی اطمینان دارید؟", user),
        onConfirm: async () => {
          await api.channels.delete(id);
          showToast('حذف شد', phrase("کانال @{0} حذف گردید.", user), 'success');
          await loadChannels();
          await loadDashboard();
        }
      });
    });
  });
}

// ==========================================================================
// 4. Matrix Multi-Server Management
// ==========================================================================
export function openAddMatrixModal() {
  const form = document.getElementById('form-matrix-server');
  if (form) form.reset();
  const testBox = document.getElementById('matrix-modal-test-result');
  if (testBox) {
    testBox.className = 'test-result-box';
    testBox.style.display = 'none';
    testBox.innerHTML = '';
  }
  openModal('modal-matrix');
}

document.getElementById('btn-open-add-matrix-modal')?.addEventListener('click', openAddMatrixModal);
const matrixServerUrlInput = document.getElementById('matrix-server-url');

// Button: Fetch Matrix token automatically using password
const btnFetchMatrixToken = document.getElementById('btn-fetch-matrix-token');
if (btnFetchMatrixToken) {
  btnFetchMatrixToken.addEventListener('click', async () => {
    const serverUrl = matrixServerUrlInput.value.trim();
    const userId = document.getElementById('matrix-bot-userid').value.trim();
    const password = document.getElementById('matrix-bot-password').value.trim();

    if (!serverUrl || !userId || !password) {
      showToast('فیلدهای ناقص', 'لطفاً آدرس URL سرور، شناسه ربات و رمز عبور را ابتدا وارد نمایید.', 'warning');
      return;
    }

    btnFetchMatrixToken.disabled = true;
    btnFetchMatrixToken.innerHTML = `<span>⏳</span> ${markup("در حال ارتباط با سینپس...")}`;

    try {
      const res = await api.matrix.loginWithPassword({ serverUrl, userId, password });
      if (res?.accessToken) {
        matrixServerUrlInput.value = res.serverUrl || serverUrl;
        document.getElementById('matrix-bot-token').value = res.accessToken;
        showToast('توکن دریافت شد', 'توکن دسترسی ربات با موفقیت از سرور استخراج شد.', 'success');
      }
    } catch (err) {
      showToast('خطا در دریافت توکن', err.message, 'danger');
    } finally {
      btnFetchMatrixToken.disabled = false;
      btnFetchMatrixToken.innerHTML = `<span>🔑</span> ${markup("دریافت خودکار توکن")}`;
    }
  });
}

// Modal test connection button
const btnTestMatrixInModal = document.getElementById('btn-test-matrix-in-modal');
if (btnTestMatrixInModal) {
  btnTestMatrixInModal.addEventListener('click', async () => {
    const serverUrl = matrixServerUrlInput.value.trim();
    const userId = document.getElementById('matrix-bot-userid').value.trim();
    const password = document.getElementById('matrix-bot-password').value.trim();
    const token = document.getElementById('matrix-bot-token').value.trim();
    const defaultRoomId = document.getElementById('matrix-default-room').value.trim();
    const testBox = document.getElementById('matrix-modal-test-result');

    if (!serverUrl || !userId || (!token && !password)) {
      showToast('فیلدهای الزامی', 'لطفاً آدرس سرور، شناسه ربات و توکن (یا رمز عبور) را وارد کنید.', 'danger');
      return;
    }

    btnTestMatrixInModal.disabled = true;
    setText(btnTestMatrixInModal, 'در حال تست اتصال...');
    testBox.className = 'test-result-box visible';
    testBox.innerHTML = `<span style="color: var(--text-muted);">${markup("در حال برقراری ارتباط با سرور ماتریکس...")}</span>`;

    try {
      const res = await api.matrix.testServer({ serverUrl, userId, token, password, defaultRoomId });
      matrixServerUrlInput.value = res.serverUrl || serverUrl;
      if (res.accessToken && !token) {
        document.getElementById('matrix-bot-token').value = res.accessToken;
      }
      testBox.className = 'test-result-box visible success';
      testBox.innerHTML = `
        <strong style="color: var(--success); display: block; margin-bottom: 4px;">✓ ${markup(res.message || 'اتصال موفق')}</strong>
        <div>${markup("نام نمایشی ربات:")} <strong>${escapeHtml(res.profile?.displayname || userId)}</strong></div>
        <div style="font-size: 0.78rem; margin-top: 4px; color: var(--text-secondary);">${markup(phrase('اتاق‌های ملحق شده: {0} اتاق', res.joinedRooms?.length || 0))}</div>
      `;
      showToast('اتصال ماتریکس موفق بود', 'ارتباط با سرور ماتریکس با موفقیت تایید شد.', 'success');
    } catch (err) {
      testBox.className = 'test-result-box visible error';
      testBox.innerHTML = `<strong style="color: var(--danger);">${markup("✗ خطا در اتصال:")}</strong> ${markup(err.message)}`;
      showToast('خطا در تست ماتریکس', err.message, 'danger');
    } finally {
      btnTestMatrixInModal.disabled = false;
      btnTestMatrixInModal.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg> ${markup("تست اتصال سرور")}`;
    }
  });
}

// Add Matrix Server form submit
const formMatrixServer = document.getElementById('form-matrix-server');
if (formMatrixServer) {
  formMatrixServer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('matrix-server-name').value.trim();
    const serverUrl = matrixServerUrlInput.value.trim();
    const userId = document.getElementById('matrix-bot-userid').value.trim();
    const password = document.getElementById('matrix-bot-password').value.trim();
    const token = document.getElementById('matrix-bot-token').value.trim();
    const defaultRoomId = document.getElementById('matrix-default-room').value.trim();

    if (!token && !password) {
      showToast('فیلد الزامی', 'لطفاً توکن دسترسی ربات یا رمز عبور آن را وارد نمایید.', 'danger');
      return;
    }

    const saveBtn = document.getElementById('btn-save-matrix-server');
    saveBtn.disabled = true;

    try {
      await api.matrix.createServer({ name, serverUrl, userId, token, password, defaultRoomId });
      showToast('سرور ذخیره شد', phrase("سرور {0} با موفقیت اضافه شد.", name), 'success');
      closeModal('modal-matrix');
      await loadMatrixServers();
      await loadDashboard();
    } catch (err) {
      showToast('خطا در ذخیره سرور', err.message, 'danger');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

const matrixConnectionStates = {
  untested: { style: 'info', label: 'بررسی نشده' },
  connected: { style: 'success', label: 'متصل' },
  expired: { style: 'warning', label: 'نیاز به ورود مجدد' },
  failed: { style: 'danger', label: 'خطا در اتصال' },
};
const matrixConnections = new Map();
const matrixPanelOverLan = location.protocol === 'http:' && isPrivateIPv4(location.hostname);
const matrixReconnectModal = document.getElementById('modal-matrix-reconnect');
const matrixReconnectForm = document.getElementById('form-matrix-reconnect');
const matrixReconnectPassword = document.getElementById('matrix-reconnect-password');
const matrixReconnectConsent = document.getElementById('matrix-reconnect-lan-ack');
const matrixReconnectSubmit = document.getElementById('btn-matrix-reconnect');
const matrixReconnectError = document.getElementById('matrix-reconnect-error');
let matrixReconnectView;

function renderMatrixReconnect() {
  const allowed = window.isSecureContext || (matrixPanelOverLan && matrixReconnectConsent.checked);
  matrixReconnectSubmit.disabled = !allowed || Boolean(matrixReconnectView?.busy);
  setText(matrixReconnectSubmit, matrixReconnectView?.busy ? 'در حال ورود…' : 'ورود مجدد');
  const message = matrixReconnectView?.error || '';
  setText(matrixReconnectError, message);
  matrixReconnectError.classList.toggle('visible', Boolean(message));
}

function openMatrixReconnect({ id, name, userId }) {
  matrixReconnectForm.reset();
  matrixReconnectView = { id, name };
  document.getElementById('matrix-reconnect-server').textContent = name;
  document.getElementById('matrix-reconnect-user').textContent = userId;
  document.getElementById('matrix-reconnect-lan-note').hidden = !matrixPanelOverLan;
  document.getElementById('matrix-reconnect-secure-help').hidden = window.isSecureContext || matrixPanelOverLan;
  renderMatrixReconnect();
  openModal('modal-matrix-reconnect');
}

new MutationObserver(() => {
  if (matrixReconnectModal.classList.contains('open')) return;
  matrixReconnectView = null;
  matrixReconnectForm.reset();
}).observe(matrixReconnectModal, { attributes: true, attributeFilter: ['class'] });
matrixReconnectConsent.addEventListener('input', renderMatrixReconnect);

matrixReconnectForm.addEventListener('submit', async event => {
  event.preventDefault();
  const view = matrixReconnectView;
  const password = matrixReconnectPassword.value;
  if (!view || matrixReconnectSubmit.disabled || !password) return;
  view.busy = true;
  view.error = '';
  matrixReconnectPassword.value = '';
  renderMatrixReconnect();
  try {
    const result = await api.matrix.reconnectServer(view.id, {
      password,
      allowLanHttp: matrixPanelOverLan && matrixReconnectConsent.checked,
    });
    matrixConnections.set(view.id, 'connected');
    if (matrixReconnectView === view) closeModal('modal-matrix-reconnect');
    showToast('ورود مجدد انجام شد', result.sameDevice
      ? 'دسترسی همان دستگاه Matrix برقرار شد.'
      : 'دسترسی حساب برقرار شد. برای اتاق رمزنگاری‌شده، از «تأیید دستگاه» استفاده کنید.', 'success', 6500);
    await loadMatrixServers();
  } catch (error) {
    view.error = error.message;
  } finally {
    view.busy = false;
    if (matrixReconnectView === view) renderMatrixReconnect();
  }
});

const matrixVerificationModal = document.getElementById('modal-matrix-verification');
const matrixVerificationControls = {
  start: document.getElementById('btn-matrix-verification-start'),
  confirm: document.getElementById('btn-matrix-verification-confirm'),
  cancel: document.getElementById('btn-matrix-verification-cancel'),
};
const matrixRecoveryPanel = document.getElementById('matrix-verification-recovery');
const matrixRecoveryForm = document.getElementById('form-matrix-recovery');
const matrixRecoveryInput = document.getElementById('matrix-recovery-key');
const matrixRecoveryGenerated = document.getElementById('matrix-recovery-generated-key');
const matrixRecoveryLanAck = document.getElementById('matrix-recovery-lan-ack');
const matrixRecoveryResetPassword = document.getElementById('matrix-recovery-reset-password');
const matrixRecoveryResetAck = document.getElementById('matrix-recovery-reset-ack');
const matrixRecoveryControls = {
  verify: document.getElementById('btn-matrix-recovery-verify'),
  prepare: document.getElementById('btn-matrix-recovery-prepare'),
  resetPrepare: document.getElementById('btn-matrix-recovery-reset-prepare'),
  setup: document.getElementById('btn-matrix-recovery-setup'),
};
const matrixVerificationMessages = {
  idle: 'صاحب حساب هنوز دستگاه Collector را تأیید نکرده است.',
  waiting: 'درخواست ارسال شد. آن را در نشست تأییدشدهٔ Element بپذیرید و روش مقایسه را انتخاب کنید.',
  compare: 'نشانه‌ها را از چپ به راست با Element مقایسه کنید. فقط اگر همه یکسان‌اند، در هر دو طرف تأیید کنید.',
  confirming: 'در انتظار تأیید در Element…',
  checking: 'در حال بررسی امضای دستگاه در Matrix…',
  verified: 'دستگاه Collector توسط صاحب حساب تأیید شده است.',
  cancelled: 'درخواست تأیید لغو شد.',
  expired: 'زمان تأیید تمام شد. می‌توانید درخواست تازه بفرستید.',
  failed: 'تأیید دستگاه کامل نشد.',
};
const matrixVerificationPending = new Set(['waiting', 'compare', 'confirming', 'checking']);
let matrixVerificationView;

function renderMatrixVerification(view) {
  const data = view.data;
  const state = data?.state;
  const status = document.getElementById('matrix-verification-status');
  const message = view.resetting ? 'در حال بازنشانی هویت و ثبت کلید جدید در Matrix…'
    : (view.error || data?.message || matrixVerificationMessages[state] || 'در حال خواندن وضعیت دستگاه…');
  setText(status, message);
  status.classList.toggle('success', state === 'verified' && !view.error);
  status.classList.toggle('error', Boolean(view.error) || state === 'failed');

  const identity = document.getElementById('matrix-verification-identity');
  identity.hidden = !data;
  document.getElementById('matrix-verification-user').textContent = data?.userId || '';
  document.getElementById('matrix-verification-device').textContent = data?.deviceId || '';

  const sas = document.getElementById('matrix-verification-sas');
  const symbols = data?.sas?.emoji?.length ? data.sas.emoji
    : (data?.sas?.decimal || []).map(number => [String(number), String(number)]);
  const fingerprint = JSON.stringify(symbols);
  if (sas.dataset.symbols !== fingerprint) {
    sas.replaceChildren(...symbols.map(([symbol, description]) => {
      const item = document.createElement('span');
      item.textContent = symbol;
      item.title = description;
      return item;
    }));
    sas.dataset.symbols = fingerprint;
  }
  sas.hidden = state !== 'compare' || !symbols.length;
  matrixVerificationControls.start.hidden = !data || state === 'verified' || matrixVerificationPending.has(state);
  matrixVerificationControls.confirm.hidden = sas.hidden;
  matrixVerificationControls.cancel.hidden = !data?.attemptId || !matrixVerificationPending.has(state);
  setText(matrixVerificationControls.cancel, state === 'compare' ? 'مطابقت ندارند' : 'لغو درخواست');
  for (const button of Object.values(matrixVerificationControls)) button.disabled = view.acting;

  matrixRecoveryPanel.hidden = !data || matrixVerificationPending.has(state);
  document.getElementById('matrix-verification-secure-help').hidden = window.isSecureContext || matrixPanelOverLan;
  document.getElementById('matrix-recovery-lan-consent').hidden = !matrixPanelOverLan;
  matrixRecoveryForm.hidden = Boolean(view.generatedKey) || state === 'verified';
  matrixRecoveryControls.prepare.hidden = Boolean(view.generatedKey);
  matrixRecoveryControls.resetPrepare.hidden = Boolean(view.generatedKey);
  document.getElementById('matrix-recovery-generated').hidden = !view.generatedKey;
  document.getElementById('matrix-recovery-reset-fields').hidden = !view.reset;
  if (matrixRecoveryGenerated.value !== (view.generatedKey || '')) matrixRecoveryGenerated.value = view.generatedKey || '';
  const allowed = window.isSecureContext || (matrixPanelOverLan && matrixRecoveryLanAck.checked);
  for (const button of Object.values(matrixRecoveryControls)) button.disabled = view.acting || !allowed;
  setText(matrixRecoveryControls.setup, view.reset ? 'بازنشانی و تأیید دستگاه' : 'ذخیره کردم، ثبت و تأیید');
  matrixRecoveryControls.setup.classList.toggle('btn-danger', Boolean(view.reset));
  matrixRecoveryControls.setup.classList.toggle('btn-primary', !view.reset);
  if (view.reset && (!matrixRecoveryResetAck.checked || !matrixRecoveryResetPassword.value)) {
    matrixRecoveryControls.setup.disabled = true;
  }
}

async function refreshMatrixVerification(view, { method = 'GET', attemptId, recovery, payload } = {}) {
  if (!view || matrixVerificationView !== view || view.acting || !matrixVerificationModal.classList.contains('open')) return;
  const allowLanHttp = matrixPanelOverLan && matrixRecoveryLanAck.checked;
  if (recovery && !window.isSecureContext && !allowLanHttp) return;
  clearTimeout(view.timer);
  const version = ++view.version;
  view.acting = Boolean(recovery) || method !== 'GET';
  view.resetting = recovery === 'reset';
  if (view.acting) renderMatrixVerification(view);
  try {
    const data = recovery
      ? await api.matrix.deviceRecovery(view.serverId, recovery === 'verify' ? '' : recovery, { ...payload, allowLanHttp })
      : await api.matrix.deviceVerification(view.serverId, method, attemptId);
    if (matrixVerificationView !== view || view.version !== version) return;
    if (recovery === 'prepare' || recovery === 'reset/prepare') {
      view.generatedKey = data.recoveryKey;
      view.reset = recovery === 'reset/prepare';
      matrixRecoveryResetAck.checked = false;
    } else {
      view.data = data;
      if (recovery === 'setup' || recovery === 'reset') {
        view.generatedKey = '';
        view.reset = false;
      }
    }
    view.error = '';
  } catch (error) {
    if (view.version !== version) return;
    view.error = error.message;
  } finally {
    if (matrixVerificationView === view && view.version === version && matrixVerificationModal.classList.contains('open')) {
      view.acting = false;
      view.resetting = false;
      renderMatrixVerification(view);
      if (matrixVerificationPending.has(view.data?.state)) {
        view.timer = setTimeout(() => refreshMatrixVerification(view), 2000);
      }
    }
  }
}

function openMatrixVerification(serverId) {
  clearTimeout(matrixVerificationView?.timer);
  matrixVerificationView = { serverId, version: 0, acting: false };
  renderMatrixVerification(matrixVerificationView);
  openModal('modal-matrix-verification');
  refreshMatrixVerification(matrixVerificationView);
}

new MutationObserver(() => {
  if (matrixVerificationModal.classList.contains('open') || !matrixVerificationView) return;
  clearTimeout(matrixVerificationView.timer);
  matrixVerificationView.generatedKey = '';
  matrixVerificationView = null;
  matrixRecoveryInput.value = '';
  matrixRecoveryGenerated.value = '';
  matrixRecoveryResetPassword.value = '';
  matrixRecoveryResetAck.checked = false;
  matrixRecoveryLanAck.checked = false;
  matrixRecoveryPanel.open = false;
}).observe(matrixVerificationModal, { attributes: true, attributeFilter: ['class'] });

matrixVerificationControls.start.addEventListener('click', () => refreshMatrixVerification(matrixVerificationView, { method: 'POST' }));
matrixVerificationControls.confirm.addEventListener('click', () => {
  const view = matrixVerificationView;
  if (view?.data?.state === 'compare') refreshMatrixVerification(view, { method: 'POST', attemptId: view.data.attemptId });
});
matrixVerificationControls.cancel.addEventListener('click', () => {
  const view = matrixVerificationView;
  if (view?.data?.attemptId) refreshMatrixVerification(view, { method: 'DELETE', attemptId: view.data.attemptId });
});
matrixRecoveryForm.addEventListener('submit', event => {
  event.preventDefault();
  const recoveryKey = matrixRecoveryInput.value.trim();
  if (!recoveryKey) return;
  matrixRecoveryInput.value = '';
  refreshMatrixVerification(matrixVerificationView, { recovery: 'verify', payload: { recoveryKey } });
});
matrixRecoveryControls.prepare.addEventListener('click', () => refreshMatrixVerification(matrixVerificationView, { recovery: 'prepare' }));
matrixRecoveryControls.resetPrepare.addEventListener('click', () => refreshMatrixVerification(matrixVerificationView, { recovery: 'reset/prepare' }));
for (const field of [matrixRecoveryLanAck, matrixRecoveryResetPassword, matrixRecoveryResetAck]) {
  field.addEventListener('input', () => {
    if (matrixVerificationView) renderMatrixVerification(matrixVerificationView);
  });
}
matrixRecoveryControls.setup.addEventListener('click', () => {
  const view = matrixVerificationView;
  if (!view?.generatedKey) return;
  const payload = { recoveryKey: view.generatedKey };
  if (view.reset) {
    if (!matrixRecoveryResetAck.checked || !matrixRecoveryResetPassword.value) return;
    payload.password = matrixRecoveryResetPassword.value;
    payload.confirm = 'reset-matrix-encryption';
    payload.deviceId = view.data.deviceId;
    matrixRecoveryResetPassword.value = '';
  }
  refreshMatrixVerification(view, { recovery: view.reset ? 'reset' : 'setup', payload });
});

async function loadMatrixServers() {
  try {
    const servers = await api.matrix.getServers();
    const tbody = document.getElementById('matrix-tbody');
    if (!tbody) return;

    if (!servers || servers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <h4>${markup("هیچ سرور ماتریکسی ثبت نشده است")}</h4>
              <p>${markup("برای ارسال پیام‌های استخراج شده، حداقل یک سرور سینپس یا ماتریکس اضافه کنید.")}</p>
              <button class="btn btn-matrix btn-sm" id="btn-empty-add-matrix">${markup("افزودن سرور")}</button>
            </div>
          </td>
        </tr>
      `;
      document.getElementById('btn-empty-add-matrix')?.addEventListener('click', openAddMatrixModal);
      return;
    }

    tbody.innerHTML = servers.map(s => {
      const id = s._id || s.id;
      const status = matrixConnectionStates[matrixConnections.get(id) || 'untested'];
      return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--matrix-green-glow); color: var(--matrix-green); display: flex; align-items: center; justify-content: center; font-weight: 700;">
              [m]
            </div>
            <strong>${escapeHtml(s.name)}</strong>
          </div>
        </td>
        <td><code style="direction: ltr; font-size: 0.82rem;">${escapeHtml(s.serverUrl)}</code></td>
        <td><code style="direction: ltr; font-size: 0.82rem; color: var(--matrix-green);">${escapeHtml(s.userId)}</code></td>
        <td><code style="direction: ltr; font-size: 0.82rem;">${escapeHtml(s.defaultRoomId || '-')}</code></td>
        <td>
          <span class="badge badge-${status.style} matrix-connection-status">${markup(status.label)}</span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm btn-test-matrix" data-id="${escapeHtml(id)}">
              ${markup('تست اتصال')}
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-reconnect-matrix" data-id="${escapeHtml(id)}" data-name="${escapeHtml(s.name)}" data-user-id="${escapeHtml(s.userId)}">
              ${markup('ورود مجدد')}
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-verify-matrix" data-id="${escapeHtml(s._id || s.id)}">
              ${markup('تأیید دستگاه')}
            </button>
            <button class="btn btn-danger btn-sm btn-delete-matrix" data-id="${s._id || s.id}" data-name="${escapeHtml(s.name)}">
              ${markup('حذف')}
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    // Bind test buttons
    tbody.querySelectorAll('.btn-test-matrix').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const badge = btn.closest('tr').querySelector('.matrix-connection-status');
        let result = 'connected';
        btn.disabled = true;
        setText(btn, 'در حال تست...');

        try {
          const res = await api.matrix.testSavedServer(id);
          showToast('اتصال ماتریکس سالم است', res.message || 'پاسخ سرور دریافت شد.', 'success');
        } catch (err) {
          result = err.data?.code === 'MATRIX_RELOGIN_REQUIRED' ? 'expired' : 'failed';
          showToast('خطا در اتصال ماتریکس', err.message, 'danger');
        } finally {
          matrixConnections.set(id, result);
          const status = matrixConnectionStates[result];
          badge.className = `badge badge-${status.style} matrix-connection-status`;
          setText(badge, status.label);
          btn.disabled = false;
          setText(btn, 'تست اتصال');
        }
      });
    });

    tbody.querySelectorAll('.btn-reconnect-matrix').forEach(btn => {
      btn.addEventListener('click', () => openMatrixReconnect(btn.dataset));
    });

    tbody.querySelectorAll('.btn-verify-matrix').forEach(btn => {
      btn.addEventListener('click', () => openMatrixVerification(btn.dataset.id));
    });

    // Bind delete buttons
    tbody.querySelectorAll('.btn-delete-matrix').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        confirmAction({
          title: 'حذف سرور ماتریکس',
          message: phrase("آیا از حذف سرور \"{0}\" اطمینان دارید؟", name),
          onConfirm: async () => {
            await api.matrix.deleteServer(id);
            showToast('حذف سرور', 'سرور ماتریکس حذف گردید.', 'success');
            await loadMatrixServers();
            await loadDashboard();
          }
        });
      });
    });

  } catch (err) {
    console.error('Error loading matrix servers:', err);
  }
}

// ==========================================================================
// 4.2 Matrix Channels (Rooms & Upload Policies Management)
// ==========================================================================
let matrixChannelsCache = [];

async function loadMatrixChannels() {
  try {
    matrixChannelsCache = await api.matrixChannels.getAll();
    const tbody = document.getElementById('matrix-channels-tbody');
    if (!tbody) return;

    if (!matrixChannelsCache || matrixChannelsCache.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <h4>${markup("هیچ کانال ماتریکسی تعریف نشده است")}</h4>
              <p>${markup("برای نگاشت کانال‌های تلگرام و ارسال اختصاصی پیام یا مدیا، ابتدا یک کانال ماتریکس بسازید.")}</p>
              <button class="btn btn-primary btn-sm" id="btn-empty-add-matrix-channel">${markup("تعریف اولین کانال ماتریکس")}</button>
            </div>
          </td>
        </tr>
      `;
      document.getElementById('btn-empty-add-matrix-channel')?.addEventListener('click', () => openMatrixChannelModal());
      return;
    }

    tbody.innerHTML = matrixChannelsCache.map(ch => {
      const id = ch._id || ch.id;
      const srv = ch.matrixServerId;
      const srvName = srv && (srv.name || srv.serverUrl || srv);
      const isTextOnly = ch.mediaSettings?.textOnly;
      const maxMb = ch.mediaSettings?.maxMb || 0;
      const policyBadge = isTextOnly 
        ? `<span class="badge badge-warning">${markup("فقط متن (Text-Only)")}</span>`
        : `<span class="badge badge-info">${markup(maxMb > 0 ? phrase("سقف {0}MB", maxMb) : 'مدیا آزاد (نامحدود)')}</span>`;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 28px; height: 28px; border-radius: var(--radius-sm); background: var(--matrix-green-glow); color: var(--matrix-green); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
                #
              </div>
              <strong>${escapeHtml(ch.name)}</strong>
            </div>
          </td>
          <td><span class="badge badge-secondary">${srvName ? escapeHtml(srvName) : markup('سرور نامشخص')}</span></td>
          <td><code style="direction: ltr; font-size: 0.82rem;">${escapeHtml(ch.roomId)}</code></td>
          <td>${policyBadge}</td>
          <td>
            <span class="badge ${ch.isActive !== false ? 'badge-success' : 'badge-danger'}">
              <span class="status-dot"></span> ${markup(ch.isActive !== false ? 'فعال' : 'غیرفعال')}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-sm btn-edit-matrix-channel" data-id="${id}">
                ${markup('ویرایش')}
              </button>
              <button class="btn btn-danger btn-sm btn-delete-matrix-channel" data-id="${id}" data-name="${escapeHtml(ch.name)}">
                ${markup('حذف')}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind edit buttons
    tbody.querySelectorAll('.btn-edit-matrix-channel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const channel = matrixChannelsCache.find(c => (c._id || c.id) === id);
        if (channel) openMatrixChannelModal(channel);
      });
    });

    // Bind delete buttons
    tbody.querySelectorAll('.btn-delete-matrix-channel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        confirmAction({
          title: 'حذف کانال ماتریکس',
          message: phrase("آیا از حذف کانال ماتریکس \"{0}\" اطمینان دارید؟ پیام‌های کانال‌های تلگرام دیگر به این اتاق ارسال نخواهند شد.", name),
          onConfirm: async () => {
            await api.matrixChannels.delete(id);
            showToast('حذف کانال ماتریکس', phrase("کانال \"{0}\" حذف گردید.", name), 'success');
            await loadMatrixChannels();
          }
        });
      });
    });

  } catch (err) {
    console.error('Error loading matrix channels:', err);
  }
}

export async function openMatrixChannelModal(channelToEdit = null) {
  const modalTitle = document.getElementById('modal-matrix-channel-title');
  const editIdInput = document.getElementById('matrix-channel-edit-id');
  const nameInput = document.getElementById('matrix-channel-name');
  const serverSelect = document.getElementById('matrix-channel-server');
  const roomIdInput = document.getElementById('matrix-channel-room-id');
  const activeSwitch = document.getElementById('matrix-channel-active-switch');

  // Populate Matrix servers dropdown
  const servers = await api.matrix.getServers();
  if (serverSelect) {
    serverSelect.innerHTML = servers.length > 0
      ? servers.map(s => {
          const sId = s._id || s.id;
          return `<option value="${sId}" data-room="${escapeHtml(s.defaultRoomId || '')}">${escapeHtml(s.name)} (${escapeHtml(s.serverUrl)})</option>`;
        }).join('')
      : '<option value=""></option>';
    if (servers.length === 0) setText(serverSelect.options[0], 'هیچ سرور ماتریکسی تعریف نشده (ابتدا سرور بسازید)');

    serverSelect.onchange = () => {
      const selected = serverSelect.options[serverSelect.selectedIndex];
      const defRoom = selected?.getAttribute('data-room');
      if (defRoom && (!roomIdInput.value || roomIdInput.value.trim() === '')) {
        roomIdInput.value = defRoom;
      }
    };
  }

  if (channelToEdit) {
    setText(modalTitle, 'ویرایش کانال ماتریکس');
    editIdInput.value = channelToEdit._id || channelToEdit.id;
    nameInput.value = channelToEdit.name || '';
    roomIdInput.value = channelToEdit.roomId || '';
    if (activeSwitch) activeSwitch.checked = channelToEdit.isActive !== false;

    if (serverSelect && channelToEdit.matrixServerId) {
      const srvId = typeof channelToEdit.matrixServerId === 'object' 
        ? (channelToEdit.matrixServerId._id || channelToEdit.matrixServerId.id) 
        : channelToEdit.matrixServerId;
      serverSelect.value = srvId;
    }

    // Populate Matrix upload rules
    const ms = channelToEdit.mediaSettings || {};
    const textOnly = document.getElementById('mx-upload-textonly');
    const maxMb = document.getElementById('mx-upload-maxmb');
    if (textOnly) textOnly.checked = !!ms.textOnly;
    if (maxMb) maxMb.value = ms.maxMb || 0;

    const perCat = ms.perCategory || {};
    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`mx-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`mx-cat-${cat}-enable`);
      const catVal = perCat[cat];
      if (elMb) elMb.value = catVal?.maxMb !== undefined ? catVal.maxMb : '';
      if (elEn) elEn.checked = catVal?.enabled !== undefined ? Boolean(catVal.enabled) : (cat === 'documents' || cat === 'stickers' ? false : true);
    }
  } else {
    setText(modalTitle, 'تعریف کانال ماتریکس جدید');
    editIdInput.value = '';
    nameInput.value = '';
    roomIdInput.value = '';
    if (activeSwitch) activeSwitch.checked = true;

    // Pick first server default room if available
    const firstOption = serverSelect?.options[0];
    const defaultRoom = firstOption?.getAttribute('data-room');
    if (defaultRoom) roomIdInput.value = defaultRoom;

    // Reset upload settings
    const textOnly = document.getElementById('mx-upload-textonly');
    const maxMb = document.getElementById('mx-upload-maxmb');
    if (textOnly) textOnly.checked = false;
    if (maxMb) maxMb.value = 0;

    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`mx-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`mx-cat-${cat}-enable`);
      if (elMb) elMb.value = '';
      if (elEn) elEn.checked = (cat === 'documents' || cat === 'stickers') ? false : true;
    }
  }

  openModal('modal-matrix-channel');
}

document.getElementById('btn-open-add-matrix-channel-modal')?.addEventListener('click', () => openMatrixChannelModal());

// Matrix Channel Form Submit
const formMatrixChannel = document.getElementById('form-matrix-channel');
if (formMatrixChannel) {
  formMatrixChannel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('matrix-channel-edit-id').value;
    const name = document.getElementById('matrix-channel-name').value.trim();
    const serverSelect = document.getElementById('matrix-channel-server');
    const matrixServerId = serverSelect?.value;
    const roomId = document.getElementById('matrix-channel-room-id').value.trim();
    const isActive = document.getElementById('matrix-channel-active-switch')?.checked !== false;

    if (!name || !roomId || !matrixServerId) {
      showToast('خطا', 'لطفاً نام کانال، سرور ماتریکس و آدرس اتاق را وارد کنید.', 'danger');
      return;
    }

    // Collect Matrix upload media settings
    const mxMediaSettings = {
      textOnly: !!document.getElementById('mx-upload-textonly')?.checked,
      maxMb: Number(document.getElementById('mx-upload-maxmb')?.value) || 0,
      perCategory: {},
    };
    for (const cat of ['photos', 'videos', 'audio', 'documents', 'stickers']) {
      const elMb = document.getElementById(`mx-cat-${cat}-maxmb`);
      const elEn = document.getElementById(`mx-cat-${cat}-enable`);
      const isEnabled = elEn ? elEn.checked : true;
      const mbVal = elMb?.value ? Number(elMb.value) : (cat === 'videos' ? 10 : cat === 'audio' ? 5 : 0);
      mxMediaSettings.perCategory[cat] = {
        enabled: isEnabled,
        maxMb: mbVal,
      };
    }

    const payload = {
      name,
      matrixServerId,
      roomId,
      isActive,
      mediaSettings: mxMediaSettings,
    };

    const submitBtn = document.getElementById('btn-save-matrix-channel');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (editId) {
        await api.matrixChannels.update(editId, payload);
        showToast('بروزرسانی موفق', phrase("کانال ماتریکس \"{0}\" با موفقیت ویرایش شد.", name), 'success');
      } else {
        await api.matrixChannels.create(payload);
        showToast('ثبت موفق', phrase("کانال ماتریکس \"{0}\" با موفقیت ایجاد شد.", name), 'success');
      }

      closeModal('modal-matrix-channel');
      await loadMatrixChannels();

      // If Telegram channel modal is currently open, refresh the picker options
      const modalChannel = document.getElementById('modal-channel');
      if (modalChannel && modalChannel.classList.contains('open')) {
        const pickersContainer = document.getElementById('channel-matrix-pickers-list');
        const mChannels = await api.matrixChannels.getAll();
        if (pickersContainer && mChannels.length > 0) {
          pickersContainer.innerHTML = mChannels.map(mx => `
            <div class="matrix-channel-pick-item">
              <label>
                <input type="checkbox" name="tg-dest-matrix-channel" value="${mx._id || mx.id}" checked>
                <div class="matrix-channel-pick-info">
                  <span class="matrix-channel-pick-title">${escapeHtml(mx.name)}</span>
                  <span class="matrix-channel-pick-meta">${markup(phrase('اتاق: {0}', mx.roomId))}</span>
                </div>
              </label>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      showToast('خطا در ثبت کانال ماتریکس', err.message, 'danger');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ==========================================================================
// 5. SOCKS Proxy Settings
// ==========================================================================
let currentProxyProtocol = 'socks5';

function selectProxyProtocol(protocol) {
  currentProxyProtocol = protocol;
  document.querySelectorAll('.protocol-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('data-protocol') === protocol);
  });

  const stdAuth = document.getElementById('proxy-standard-auth');
  const mtAuth = document.getElementById('proxy-mtproto-auth');

  if (protocol === 'mtproto') {
    if (stdAuth) stdAuth.style.display = 'none';
    if (mtAuth) mtAuth.style.display = 'block';
  } else {
    if (stdAuth) stdAuth.style.display = 'flex';
    if (mtAuth) mtAuth.style.display = 'none';
  }
}

document.querySelectorAll('.protocol-card').forEach(card => {
  card.addEventListener('click', () => {
    const proto = card.getAttribute('data-protocol');
    if (proto) selectProxyProtocol(proto);
  });
});

async function loadProxySettings() {
  try {
    const settings = await api.settings.get();
    const proxy = settings.proxy || {};

    const masterSwitch = document.getElementById('proxy-master-enable');
    const hostInput = document.getElementById('proxy-host');
    const portInput = document.getElementById('proxy-port');
    const userInput = document.getElementById('proxy-username');
    const passInput = document.getElementById('proxy-password');
    const secretInput = document.getElementById('proxy-secret');

    if (masterSwitch) masterSwitch.checked = proxy.enabled || (proxy.type && proxy.type !== 'none');
    if (hostInput) hostInput.value = proxy.host || '';
    if (portInput) portInput.value = proxy.port || '';
    if (userInput) userInput.value = proxy.username || '';
    if (passInput) passInput.value = proxy.password || '';
    if (secretInput) secretInput.value = proxy.secret || '';

    const proto = (proxy.type && proxy.type !== 'none') ? proxy.type : 'socks5';
    selectProxyProtocol(proto);
    setProxyTestAvailability(settings.proxyTestAvailable);

  } catch (err) {
    setProxyTestAvailability(false);
    console.error('Error loading proxy settings:', err);
  }
}

// Proxy Test Button
const btnTestProxy = document.getElementById('btn-test-proxy');
const proxyTestRequirements = document.getElementById('proxy-test-requirements');
let canTestProxy = false;
let testingProxy = false;

function setProxyTestAvailability(available) {
  canTestProxy = available === true;
  if (btnTestProxy) btnTestProxy.disabled = !canTestProxy || testingProxy;
  if (proxyTestRequirements) {
    setText(proxyTestRequirements, canTestProxy
      ? 'تست با تنظیمات ذخیره‌شدهٔ پروکسی انجام می‌شود.'
      : 'برای تست، پروکسی را فعال و ذخیره کنید و یک اکانت فعال تلگرام ثبت کنید.');
  }
}

if (btnTestProxy) {
  btnTestProxy.addEventListener('click', async () => {
    if (!canTestProxy || testingProxy) return;
    const testBox = document.getElementById('proxy-test-result');

    testingProxy = true;
    setProxyTestAvailability(canTestProxy);
    setText(btnTestProxy, 'در حال تست پینگ...');
    testBox.className = 'test-result-box visible';
    testBox.innerHTML = `<span style="color: var(--text-muted);">${markup("در حال اتصال به پروکسی و سنجش زمان پاسخ...")}</span>`;

    try {
      const res = await api.settings.testProxy();

      testBox.className = 'test-result-box visible success';
      testBox.innerHTML = `
        <strong style="color: var(--success); display: block;">✓ ${markup(res.message || 'اتصال برقرار شد')}</strong>
        <span style="font-size: 0.78rem; color: var(--text-secondary);">${markup(phrase('زمان پاسخ تلگرام: {0} ms', res.latencyMs))}</span>
      `;
      showToast('پروکسی سالم است', res.message, 'success');
    } catch (err) {
      testBox.className = 'test-result-box visible error';
      testBox.innerHTML = `<strong style="color: var(--danger);">${markup("✗ خطا در اتصال پروکسی:")}</strong> ${markup(err.message)}`;
      showToast('خطا در تست پروکسی', err.message, 'danger');
    } finally {
      testingProxy = false;
      setProxyTestAvailability(canTestProxy);
      btnTestProxy.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg> ${markup("تست اتصال پروکسی")}`;
    }
  });
}

// Save Proxy Form
const formProxy = document.getElementById('proxy-form');
if (formProxy) {
  formProxy.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enabled = document.getElementById('proxy-master-enable').checked;
    const host = document.getElementById('proxy-host').value.trim();
    const port = Number(document.getElementById('proxy-port').value);
    const username = document.getElementById('proxy-username').value.trim();
    const password = document.getElementById('proxy-password').value;
    const secret = document.getElementById('proxy-secret').value.trim();

    const saveBtn = document.getElementById('btn-save-proxy');
    saveBtn.disabled = true;

    try {
      const settings = await api.settings.update({
        proxy: {
          enabled,
          type: enabled ? currentProxyProtocol : 'none',
          host,
          port,
          username,
          password,
          secret
        }
      });
      setProxyTestAvailability(settings.proxyTestAvailable);
      showToast('تنظیمات ذخیره شد', 'تنظیمات پروکسی با موفقیت بروزرسانی شد.', 'success');
      await loadDashboard();
    } catch (err) {
      showToast('خطا در ذخیره پروکسی', err.message, 'danger');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ==========================================================================
// 6. Authentication, Security & 2FA Management
// ==========================================================================
const loginOverlay = document.getElementById('login-overlay');
const formLogin = document.getElementById('form-login');
const loginStepCredentials = document.getElementById('login-step-credentials');
const loginStep2FA = document.getElementById('login-step-2fa');
const loginErrorAlert = document.getElementById('login-error-alert');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const login2faCodeInput = document.getElementById('login-2fa-code');
const btnVerify2faSubmit = document.getElementById('btn-verify-2fa-submit');
const btnBackToCredentials = document.getElementById('btn-back-to-credentials');
const topbarUsername = document.getElementById('topbar-username');
const btnLogout = document.getElementById('btn-logout');

// Security Modal Elements
const btnOpenSecurity = document.getElementById('btn-open-security');
const sec2faBadge = document.getElementById('sec-2fa-badge');
const secStartView = document.getElementById('sec-start-view');
const secSetupView = document.getElementById('sec-setup-view');
const secDisableView = document.getElementById('sec-disable-view');
const btnStartSetup2fa = document.getElementById('btn-start-setup-2fa');
const btnConfirmEnable2fa = document.getElementById('btn-confirm-enable-2fa');
const btnCopySecret = document.getElementById('btn-copy-secret');
const secSecretText = document.getElementById('sec-secret-text');
const secConfirmCode = document.getElementById('sec-confirm-code');
const secQrSvg = document.getElementById('sec-qr-svg');
const btnSubmitDisable2fa = document.getElementById('btn-submit-disable-2fa');
const secDisablePassword = document.getElementById('sec-disable-password');
const btnChangePasswordSubmit = document.getElementById('btn-change-password-submit');
const secOldPass = document.getElementById('sec-old-pass');
const secNewPass = document.getElementById('sec-new-pass');

let tempLoginCredentials = { username: '', password: '' };

function showLoginError(msg) {
  if (loginErrorAlert) {
    setText(loginErrorAlert, msg);
    loginErrorAlert.style.display = 'block';
  }
}

function hideLoginError() {
  if (loginErrorAlert) {
    loginErrorAlert.textContent = '';
    loginErrorAlert.style.display = 'none';
  }
}

function showLoginScreen() {
  if (loginOverlay) {
    loginOverlay.classList.remove('hidden');
    if (loginStepCredentials) loginStepCredentials.style.display = 'block';
    if (loginStep2FA) loginStep2FA.style.display = 'none';
    hideLoginError();
    if (loginUsernameInput) loginUsernameInput.focus();
  }
}

function hideLoginScreen() {
  if (loginOverlay) {
    loginOverlay.classList.add('hidden');
    hideLoginError();
  }
}

async function checkAuthStatus() {
  const token = api.auth.getToken();
  if (!token) {
    showLoginScreen();
    return false;
  }

  try {
    const res = await api.auth.getMe();
    if (res && res.user) {
      if (topbarUsername) topbarUsername.textContent = res.user.username;
      hideLoginScreen();
      return true;
    }
  } catch (err) {
    console.warn('Auth token invalid or expired:', err.message);
    api.auth.logout();
    showLoginScreen();
    return false;
  }
  return false;
}

// Login Form Submit (Step 1)
if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();

    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    if (!username || !password) {
      showLoginError('لطفاً نام کاربری و رمز عبور را وارد نمایید.');
      return;
    }

    const submitBtn = document.getElementById('btn-login-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await api.auth.login({ username, password });

      if (res.needs2FA) {
        tempLoginCredentials = { username, password };
        if (loginStepCredentials) loginStepCredentials.style.display = 'none';
        if (loginStep2FA) loginStep2FA.style.display = 'block';
        if (login2faCodeInput) {
          login2faCodeInput.value = '';
          login2faCodeInput.focus();
        }
        return;
      }

      if (res.token) {
        if (topbarUsername) topbarUsername.textContent = res.user?.username || username;
        hideLoginScreen();
        showToast('ورود موفق', res.message || 'با موفقیت وارد پنل شدید.', 'success');
        switchTab('dashboard');
      }
    } catch (err) {
      showLoginError(err.message || 'نام کاربری یا رمز عبور اشتباه است.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// 2FA Verification Submit (Step 2)
if (btnVerify2faSubmit) {
  btnVerify2faSubmit.addEventListener('click', async () => {
    hideLoginError();
    const code = login2faCodeInput.value.trim();
    if (!code || code.length !== 6) {
      showLoginError('لطفاً کد ۶ رقمی تایید دو مرحله‌ای را وارد کنید.');
      return;
    }

    btnVerify2faSubmit.disabled = true;
    try {
      const res = await api.auth.login({
        username: tempLoginCredentials.username,
        password: tempLoginCredentials.password,
        twoFactorCode: code
      });

      if (res.token) {
        if (topbarUsername) topbarUsername.textContent = res.user?.username || tempLoginCredentials.username;
        hideLoginScreen();
        tempLoginCredentials = { username: '', password: '' };
        showToast('ورود موفق', 'هویت دو مرحله‌ای با موفقیت تایید شد.', 'success');
        switchTab('dashboard');
      }
    } catch (err) {
      showLoginError(err.message || 'کد تایید اشتباه یا منقضی شده است.');
    } finally {
      btnVerify2faSubmit.disabled = false;
    }
  });
}

// Back to credentials from 2FA
if (btnBackToCredentials) {
  btnBackToCredentials.addEventListener('click', () => {
    hideLoginError();
    if (loginStep2FA) loginStep2FA.style.display = 'none';
    if (loginStepCredentials) loginStepCredentials.style.display = 'block';
    if (loginPasswordInput) loginPasswordInput.focus();
  });
}

// Logout handler
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    api.auth.logout();
    showToast('خروج', 'از سیستم خارج شدید.', 'info');
    showLoginScreen();
  });
}

// Handle global unauthorized 401 event
window.addEventListener('auth:unauthorized', () => {
  showLoginScreen();
  showToast('نشست منقضی شد', 'لطفاً مجدداً وارد حساب کاربری خود شوید.', 'warning');
});

// Security & 2FA Modal Handlers
async function refreshSecurityView() {
  try {
    const res = await api.auth.getMe();
    const user = res.user || {};
    const is2fa = !!user.twoFactorEnabled;

    if (sec2faBadge) {
      setText(sec2faBadge, is2fa ? 'فعال' : 'غیرفعال');
      sec2faBadge.className = `badge ${is2fa ? 'badge-success' : 'badge-secondary'}`;
    }

    if (is2fa) {
      if (secStartView) secStartView.style.display = 'none';
      if (secSetupView) secSetupView.style.display = 'none';
      if (secDisableView) secDisableView.style.display = 'block';
    } else {
      if (secStartView) secStartView.style.display = 'block';
      if (secSetupView) secSetupView.style.display = 'none';
      if (secDisableView) secDisableView.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load user profile for security view:', err);
  }
}

if (btnOpenSecurity) {
  btnOpenSecurity.addEventListener('click', async () => {
    openModal('modal-security');
    await refreshSecurityView();
  });
}

if (btnStartSetup2fa) {
  btnStartSetup2fa.addEventListener('click', async () => {
    btnStartSetup2fa.disabled = true;
    try {
      const res = await api.auth.setup2FA();
      if (res.success) {
        if (secStartView) secStartView.style.display = 'none';
        if (secSetupView) secSetupView.style.display = 'block';

        if (secQrSvg) {
          secQrSvg.innerHTML = res.qrCodeSvg;
        }
        if (secSecretText) {
          secSecretText.value = res.secret;
        }
        if (secConfirmCode) {
          secConfirmCode.value = '';
          secConfirmCode.focus();
        }
      }
    } catch (err) {
      showToast('خطا در ایجاد 2FA', err.message, 'danger');
    } finally {
      btnStartSetup2fa.disabled = false;
    }
  });
}

if (btnCopySecret) {
  btnCopySecret.addEventListener('click', async () => {
    if (secSecretText && secSecretText.value) {
      try {
        await navigator.clipboard.writeText(secSecretText.value);
        showToast('کپی شد', 'کلید دستی در حافظه کلیپ‌بورد ذخیره شد.', 'success', 2000);
      } catch (e) {
        secSecretText.select();
        document.execCommand('copy');
        showToast('کپی شد', 'کلید دستی کپی شد.', 'success', 2000);
      }
    }
  });
}

if (btnConfirmEnable2fa) {
  btnConfirmEnable2fa.addEventListener('click', async () => {
    const code = secConfirmCode ? secConfirmCode.value.trim() : '';
    if (!code || code.length !== 6) {
      showToast('کد نامعتبر', 'لطفاً کد ۶ رقمی تولید شده در اپلیکیشن را وارد نمایید.', 'warning');
      return;
    }

    btnConfirmEnable2fa.disabled = true;
    try {
      const res = await api.auth.confirm2FA(code);
      showToast('ورود دومرحله‌ای فعال شد', res.message || 'با موفقیت ثبت گردید.', 'success');
      await refreshSecurityView();
    } catch (err) {
      showToast('خطا در تایید کد', err.message, 'danger');
    } finally {
      btnConfirmEnable2fa.disabled = false;
    }
  });
}

if (btnSubmitDisable2fa) {
  btnSubmitDisable2fa.addEventListener('click', async () => {
    const password = secDisablePassword ? secDisablePassword.value : '';
    if (!password) {
      showToast('رمز عبور الزامی است', 'جهت غیرفعال‌سازی، ورود رمز عبور حساب الزامی است.', 'warning');
      return;
    }

    btnSubmitDisable2fa.disabled = true;
    try {
      const res = await api.auth.disable2FA(password);
      showToast('ورود دومرحله‌ای غیرفعال شد', res.message || '2FA خاموش گردید.', 'success');
      if (secDisablePassword) secDisablePassword.value = '';
      await refreshSecurityView();
    } catch (err) {
      showToast('خطا در غیرفعال‌سازی', err.message, 'danger');
    } finally {
      btnSubmitDisable2fa.disabled = false;
    }
  });
}

if (btnChangePasswordSubmit) {
  btnChangePasswordSubmit.addEventListener('click', async () => {
    const oldPassword = secOldPass ? secOldPass.value : '';
    const newPassword = secNewPass ? secNewPass.value : '';

    if (!oldPassword || !newPassword) {
      showToast('فیلدهای خالی', 'لطفاً هم رمز عبور فعلی و هم جدید را وارد نمایید.', 'warning');
      return;
    }
    if (newPassword.length < 6) {
      showToast('طول رمز عبور', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 'warning');
      return;
    }

    btnChangePasswordSubmit.disabled = true;
    try {
      const res = await api.auth.changePassword(oldPassword, newPassword);
      showToast('رمز عبور تغییر یافت', res.message || 'رمز عبور با موفقیت بروز شد.', 'success');
      if (secOldPass) secOldPass.value = '';
      if (secNewPass) secNewPass.value = '';
    } catch (err) {
      showToast('خطا در تغییر رمز عبور', err.message, 'danger');
    } finally {
      btnChangePasswordSubmit.disabled = false;
    }
  });
}

// ==========================================================================
// Application Bootstrap
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check user authentication first
  const isAuthed = await checkAuthStatus();
  if (isAuthed) {
    switchTab('dashboard');
  }
});
