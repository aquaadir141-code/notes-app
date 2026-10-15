/**
 * Script.js - Note Manager
 * Copyright: Adir Aqua
 */

// --- 1. פונקציות עזר בסיסיות ---

function tryParseJSON(key, defaultValue) {
    try {
        const value = localStorage.getItem(key);
        if (value && value.trim().startsWith('U2FsdGVkX1')) {
            console.warn(`Data for ${key} reset due to old encryption format.`);
            localStorage.setItem(key, JSON.stringify(defaultValue));
            return defaultValue;
        }
        return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// --- 1b. פונקציית בטיחות למניעת XSS ---

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- 1c. חלונות מעוצבים במקום alert/confirm/prompt ---

// יוצר חלון נגיש: role=dialog, מלכודת פוקוס, Escape לסגירה, החזרת פוקוס לכפתור שפתח אותו
function createDialog(opts = {}) {
    const { id, title, message, icon, tone, wide, dismissible = true, layer, onDismiss } = opts;
    if (id) {
        const existing = document.getElementById(id);
        if (existing) { if (existing._closeDialog) existing._closeDialog(true); else existing.remove(); }
    }
    const trigger = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay' + (layer ? ' is-' + layer : '');
    if (id) overlay.id = id;

    const box = document.createElement('div');
    box.className = 'dialog' + (wide ? ' dialog--wide' : '');
    box.setAttribute('role', tone === 'danger' || tone === 'warning' ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');

    if (icon) {
        const iconEl = document.createElement('div');
        iconEl.className = 'dialog-icon' + (tone ? ' is-' + tone : '');
        iconEl.innerHTML = ICONS[icon] || '';
        box.appendChild(iconEl);
    }
    const uid = 'dlg-' + Math.random().toString(36).slice(2, 8);
    if (title) {
        const h = document.createElement('h2');
        h.className = 'dialog-title';
        h.id = uid + '-title';
        h.textContent = title;
        box.appendChild(h);
        box.setAttribute('aria-labelledby', h.id);
    }
    if (message) {
        const p = document.createElement('p');
        p.className = 'dialog-message';
        p.id = uid + '-desc';
        p.textContent = message;
        box.appendChild(p);
        if (title) box.setAttribute('aria-describedby', p.id); else box.setAttribute('aria-labelledby', p.id);
    }
    const body = document.createElement('div');
    body.className = 'dialog-body';
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    box.appendChild(body);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let closed = false;
    function close(immediate) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        if (immediate) { overlay.remove(); return; }
        overlay.dataset.state = 'closed';
        setTimeout(() => overlay.remove(), 240);
        if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) trigger.focus({ preventScroll: true });
    }
    function dismiss() {
        if (!dismissible) return;
        close();
        if (onDismiss) onDismiss();
    }
    function onKey(e) {
        if (overlay !== topmostDialog()) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); return; }
        if (e.key !== 'Tab') return;
        const items = [...box.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) dismiss(); });
    overlay._closeDialog = close;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!closed) overlay.dataset.state = 'open'; }));

    function addButton(text, variant, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-' + (variant || 'secondary');
        b.textContent = text;
        if (onClick) b.addEventListener('click', onClick);
        actions.appendChild(b);
        return b;
    }
    return { overlay, box, body, actions, close, addButton };
}

function topmostDialog() {
    const all = document.querySelectorAll('.dialog-overlay:not([data-state="closed"])');
    return all[all.length - 1] || null;
}

function showAlert(message, onClose) {
    const d = createDialog({ id: '_customAlertModal', message, layer: 'top', onDismiss: onClose });
    d.body.remove();
    const btn = d.addButton('אישור', 'primary', () => { d.close(); if (onClose) onClose(); });
    btn.focus();
}

// --- focus trap למודאלים ---
function trapFocus(modalEl, triggerEl) {
    const focusable = modalEl.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first) first.focus();
    function onKey(e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    function onClose() {
        modalEl.removeEventListener('keydown', onKey);
        if (triggerEl) triggerEl.focus();
    }
    modalEl.addEventListener('keydown', onKey);
    return onClose;
}

let _toastTimer = null;
function showToast(message, duration = 2500, action) {
    let toast = document.getElementById('_toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_toast';
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('has-action', !!action);
    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.onclick = () => {
            clearTimeout(_toastTimer);
            toast.dataset.state = 'closed';
            action.onClick();
        };
        toast.appendChild(btn);
    }
    clearTimeout(_toastTimer);
    // מעבר (ולא keyframes) כדי שטוסט חדש יחליף את הקודם בלי לקפוץ
    requestAnimationFrame(() => { toast.dataset.state = 'open'; });
    _toastTimer = setTimeout(() => { toast.dataset.state = 'closed'; }, duration);
}

function showConfirm(message, onConfirm, onCancel, opts = {}) {
    const d = createDialog({
        id: '_customConfirmModal',
        title: opts.title || 'לאשר את הפעולה?',
        message,
        icon: opts.icon || 'delete',
        tone: opts.tone || 'danger',
        layer: 'top',
        onDismiss: onCancel
    });
    d.body.remove();
    const cancelBtn = d.addButton(opts.cancelText || 'ביטול', 'secondary', () => { d.close(); if (onCancel) onCancel(); });
    d.addButton(opts.confirmText || 'אישור', opts.tone === 'danger' || !opts.tone ? 'danger' : 'primary', () => { d.close(); if (onConfirm) onConfirm(); });
    cancelBtn.focus();
}

function showPrompt({ title, label, placeholder, maxLength, confirmText, value }, onSubmit) {
    const d = createDialog({ id: '_customPromptModal', title, icon: 'folderPlus', layer: 'top' });
    const inputId = 'prompt-input-' + Date.now();
    d.body.innerHTML = `<label class="field-label" for="${inputId}"></label><input type="text" id="${inputId}" autocomplete="off" enterkeyhint="done">`;
    d.body.querySelector('label').textContent = label || '';
    const input = d.body.querySelector('input');
    if (placeholder) input.placeholder = placeholder;
    if (maxLength) input.maxLength = maxLength;
    if (value) input.value = value;
    d.addButton('ביטול', 'secondary', () => d.close());
    const ok = d.addButton(confirmText || 'שמירה', 'primary', submit);
    function submit() {
        const result = onSubmit(input.value);
        if (result !== false) d.close();
        else input.focus();
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(() => input.focus(), 30);
    return ok;
}

// --- 2. משתנים גלובליים ---

let selectedColor = localStorage.getItem('selectedColor') || 'green';
let selectedFolder = 'תיקייה כללית';
let isFolderViewActive = false;
let isBoardViewActive = false;
let notePositions = tryParseJSON('notePositions', {});
let isLoading = false;
let folderColors = tryParseJSON('folderColors', {});

const validColors = ['pink', 'yellow', 'purple', 'green', 'orange', 'cyan', 'red'];
const fixedFolders = ['תיקייה כללית', 'משימות שהושלמו', 'אשפה'];

// --- הגדרת סאונד ---
const SOUND_FILES = {
    'sound1': 'sound 1.wav',
    'sound2': 'sound 2.wav',
    'sound3': 'sound 3.wav'
};

let currentSoundKey = localStorage.getItem('selectedSound') || 'sound1';
let alertSound = new Audio(SOUND_FILES[currentSoundKey]);

// --- 3. העיצוב כולו נמצא ב-styles.css ---

// --- 4. סט אייקונים (SVG) ---

const ICONS = {
    // הוחלף גלגל שיניים לתו מוזיקה
    settings: `<svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
    pin: `<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`,
    edit: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`,
    clock: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    palette: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`,
    folder: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    delete: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    check: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    bold: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>`,
    italic: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>`,
    underline: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path><line x1="4" y1="21" x2="20" y2="21"></line></svg>`,
    zoomIn: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`,
    zoomOut: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`,
    plus: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    info: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    sun: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    moon: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
    grid: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    x: `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    bell: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>`,
    bellOff: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8c0 2.7.6 4.6 1.3 6"></path><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>`,
    alarm: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2"></path><path d="M5 3 2 6"></path><path d="m22 6-3-3"></path></svg>`,
    calendar: `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    folderPlus: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`,
    checkCircle: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10.5 15 8 12.5"></polyline></svg>`,
    inbox: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
    play: `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"></path></svg>`,
    keyboard: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="6" y1="10" x2="6.01" y2="10"></line><line x1="10" y1="10" x2="10.01" y2="10"></line><line x1="14" y1="10" x2="14.01" y2="10"></line><line x1="18" y1="10" x2="18.01" y2="10"></line><line x1="7" y1="14" x2="17" y2="14"></line></svg>`,
    list: `<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
};

// --- 5. הגדרת פונקציות ליבה ---

function getNotes() { return tryParseJSON('notes', []); }
function getFolders() { return tryParseJSON('folders', []); }
function getAllFolderNames() { return [...fixedFolders, ...getFolders()]; }

function updateNoteInStorage(updatedNote) {
    let notes = getNotes();
    const index = notes.findIndex(n => n.id === updatedNote.id);
    if (index !== -1) {
        notes[index] = updatedNote;
        localStorage.setItem('notes', JSON.stringify(notes));
    }
}

function togglePin(id) {
    let notes = getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
        note.pinned = !note.pinned;
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotesWithoutFolderView();
    }
}

function updateTopIcons() {
    const isDark = document.body.classList.contains('dark-mode');
    const darkLabel = isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה';
    const addBtn = document.getElementById('addNoteBtn');
    if(addBtn) addBtn.innerHTML = ICONS.plus;
    const guideBtn = document.getElementById('guideIcon');
    if(guideBtn) guideBtn.innerHTML = ICONS.info;
    const settingsBtn = document.getElementById('settingsIcon');
    if(settingsBtn) settingsBtn.innerHTML = ICONS.settings;
    const darkBtn = document.getElementById('darkModeToggle');
    if(darkBtn) {
        darkBtn.innerHTML = isDark ? ICONS.moon : ICONS.sun;
        darkBtn.setAttribute('aria-label', darkLabel);
        darkBtn.title = darkLabel;
    }
    const boardBtn = document.getElementById('boardToggle');
    if(boardBtn) {
        boardBtn.innerHTML = isBoardViewActive ? ICONS.list : ICONS.grid;
        const boardLabel = isBoardViewActive ? 'חזרה לתצוגת רשימה' : 'תצוגת לוח';
        boardBtn.setAttribute('aria-label', boardLabel);
        boardBtn.title = boardLabel;
    }
    // עדכון כפתורי סרגל צד (מובייל)
    const sidebarGuideBtn = document.getElementById('sidebarGuideBtn');
    if(sidebarGuideBtn) sidebarGuideBtn.innerHTML = ICONS.info;
    const sidebarDarkBtn = document.getElementById('sidebarDarkBtn');
    if(sidebarDarkBtn) {
        sidebarDarkBtn.innerHTML = isDark ? ICONS.moon : ICONS.sun;
        sidebarDarkBtn.setAttribute('aria-label', darkLabel);
    }
    const sidebarSoundBtn = document.getElementById('sidebarSoundBtn');
    if(sidebarSoundBtn) sidebarSoundBtn.innerHTML = ICONS.settings;
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if(closeSidebarBtn) closeSidebarBtn.innerHTML = ICONS.x;
    const newFolderBtn = document.getElementById('create-folder-btn');
    if(newFolderBtn && !newFolderBtn.querySelector('svg')) newFolderBtn.insertAdjacentHTML('afterbegin', ICONS.folderPlus.replace('width="20" height="20"', 'width="17" height="17"'));
    updateThemeColor();
}

// צבע סרגל הסטטוס בטלפון תואם את רקע האפליקציה
function updateThemeColor() {
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (!bg) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
        m.removeAttribute('media');
        m.setAttribute('content', bg);
    });
}

function setPageHeaderVisible(visible) {
    const header = document.querySelector('.page-header');
    if (header) header.style.display = visible ? '' : 'none';
}

function showMainContent() {
    selectedFolder = 'תיקייה כללית';
    isFolderViewActive = false;
    setPageHeaderVisible(true);
    const createSec = document.getElementById('createNoteSection');
    if(createSec) createSec.style.display = 'block';
    const backBtn = document.getElementById('backBtn');
    if(backBtn) backBtn.style.display = 'none';
    const badge = document.getElementById('boardFolderBadge');
    if(badge) badge.style.display = 'none';
    document.querySelectorAll('.folder-container').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.folder-item').forEach(i => { i.classList.remove('selected'); i.removeAttribute('aria-current'); });
    const defContainer = document.querySelector('.folder-container[data-folder="תיקייה כללית"]');
    if (defContainer) defContainer.classList.add('active');
    const defItem = document.querySelector('.folder-item[data-folder="תיקייה כללית"]');
    if (defItem) { defItem.classList.add('selected'); defItem.setAttribute('aria-current', 'true'); }
    loadNotesWithoutFolderView();
}

function createFolder() {
    showPrompt({
        title: 'תיקייה חדשה',
        label: 'שם התיקייה (עד 15 תווים)',
        placeholder: 'למשל: עבודה',
        maxLength: 15,
        confirmText: 'יצירת תיקייה'
    }, (raw) => {
        const folderName = (raw || '').trim();
        if (!folderName) return false;
        if (folderName.length > 15) { showToast('שם התיקייה ארוך מדי (מקסימום 15 תווים)'); return false; }
        let folders = getFolders();
        if (folders.includes(folderName) || fixedFolders.includes(folderName)) { showToast('תיקייה בשם זה כבר קיימת'); return false; }
        folders.push(folderName);
        localStorage.setItem('folders', JSON.stringify(folders));
        loadFolders();
        loadNotesWithoutFolderView();
        showToast(`התיקייה "${folderName}" נוצרה`);
    });
}

function folderIconFor(folder) {
    if (folder === 'תיקייה כללית') return ICONS.inbox;
    if (folder === 'משימות שהושלמו') return ICONS.checkCircle;
    if (folder === 'אשפה') return ICONS.delete;
    return ICONS.folder;
}

function isSidebarPinned() {
    return window.matchMedia('(min-width: 1100px)').matches;
}

function setSidebarOpen(open, opts = {}) {
    const sidebar = document.getElementById('foldersSidebar');
    const toggle = document.getElementById('sidebarToggle');
    if (!sidebar) return;
    sidebar.classList.toggle('active', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (isSidebarPinned()) return;
    if (open && opts.focus) {
        const target = sidebar.querySelector('.folder-item.selected') || sidebar.querySelector('.folder-item');
        if (target) setTimeout(() => target.focus({ preventScroll: true }), 60);
    }
    if (!open && opts.returnFocus && toggle) toggle.focus({ preventScroll: true });
}

function loadFolders() {
    const list = document.getElementById('folders-list');
    const contentContainer = document.getElementById('folders-notes-container');
    const folders = getFolders();
    if(!list || !contentContainer) return;
    list.innerHTML = '';
    [...fixedFolders, ...folders].forEach(folder => {
        const isFixed = fixedFolders.includes(folder);
        const div = document.createElement('div');
        div.className = `folder-item ${isFixed ? 'fixed-folder' : ''}`;
        div.setAttribute('data-folder', folder);
        div.setAttribute('role', 'button');
        div.tabIndex = 0;
        if (selectedFolder === folder) { div.classList.add('selected'); div.setAttribute('aria-current', 'true'); }
        const safe = escapeHTML(folder);
        const deleteBtnHTML = isFixed ? '' : `<button class="delete-folder-btn" aria-label="מחק את התיקייה ${safe}" title="מחק תיקייה">${ICONS.x}</button>`;
        div.innerHTML = `
            <span class="folder-icon">${folderIconFor(folder)}</span>
            <span class="folder-name">${safe}</span>
            <span class="folder-count" aria-hidden="true"></span>
            <div class="folder-actions">${deleteBtnHTML}</div>
            <div class="folder-color-picker">
                <span class="folder-color-preview" role="button" tabindex="0" aria-label="בחר צבע לתיקייה ${safe}" title="צבע התיקייה"></span>
                <input type="color" class="folder-color-input" tabindex="-1" aria-hidden="true">
            </div>
        `;
        const preview = div.querySelector('.folder-color-preview');
        preview.style.background = folderColors[folder] || 'var(--surface-3)';
        if (folderColors[folder]) div.querySelector('.folder-icon').style.setProperty('--folder-color', folderColors[folder]);
        const input = div.querySelector('input');
        input.setAttribute('data-folder', folder);
        if (folderColors[folder]) input.value = folderColors[folder];

        const activate = () => {
            selectFolder(folder);
            if (!isSidebarPinned()) setSidebarOpen(false);
        };
        div.onclick = (e) => {
            if (e.target.closest('button, input, .folder-color-preview')) return;
            activate();
        };
        div.addEventListener('keydown', (e) => {
            if (e.target !== div) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const sib = e.key === 'ArrowDown' ? div.nextElementSibling : div.previousElementSibling;
                if (sib) sib.focus();
            }
        });
        if (!isFixed) {
            const delBtn = div.querySelector('.delete-folder-btn');
            if(delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folder); };
        }
        input.addEventListener('change', (e) => { updateFolderColor(folder, e.target.value); });
        preview.onclick = (e) => { e.stopPropagation(); input.click(); };
        preview.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); input.click(); } };
        list.appendChild(div);
    });
    contentContainer.innerHTML = '';
    [...fixedFolders, ...folders].forEach(folder => {
        if (folder === 'תיקייה כללית') return;
        const div = document.createElement('section');
        div.className = 'folder-container';
        div.setAttribute('data-folder', folder);
        const titleEl = document.createElement('h2');
        titleEl.className = 'folder-title';
        titleEl.textContent = folder;
        const countEl = document.createElement('span');
        countEl.className = 'count';
        titleEl.appendChild(countEl);
        div.appendChild(titleEl);
        const notesEl = document.createElement('div');
        notesEl.className = 'notes-container';
        notesEl.setAttribute('data-folder', folder);
        div.appendChild(notesEl);
        contentContainer.appendChild(div);
    });
    updateFolderCounts();
}

function updateFolderColor(folder, color) {
    folderColors[folder] = color;
    localStorage.setItem('folderColors', JSON.stringify(folderColors));
    let notes = getNotes();
    let updated = false;
    notes.forEach(note => { if (note.folder === folder) { note.color = color; updated = true; } });
    if (updated) localStorage.setItem('notes', JSON.stringify(notes));
    loadFolders();
    loadNotesWithoutFolderView();
}

function selectFolder(folder) {
    selectedFolder = folder;
    isFolderViewActive = true;
    document.querySelectorAll('.folder-item').forEach(i => { i.classList.remove('selected'); i.removeAttribute('aria-current'); });
    const currentItem = [...document.querySelectorAll('.folder-item')].find(i => i.getAttribute('data-folder') === folder);
    if(currentItem) { currentItem.classList.add('selected'); currentItem.setAttribute('aria-current', 'true'); }
    const badge = document.getElementById('boardFolderBadge');
    if (badge) { badge.textContent = folder; badge.style.display = 'inline-flex'; }
    if (isBoardViewActive) {
        loadNotesWithoutFolderView();
    } else {
        setPageHeaderVisible(false);
        const sec = document.getElementById('createNoteSection');
        if(sec) sec.style.display = 'none';
        const back = document.getElementById('backBtn');
        if(back) back.style.display = 'inline-flex';
        loadNotesWithoutFolderView();
        document.querySelectorAll('.folder-container').forEach(c => c.classList.remove('active'));
        const container = [...document.querySelectorAll('.folder-container')].find(c => c.getAttribute('data-folder') === folder);
        if (container) container.classList.add('active');
        window.scrollTo({ top: 0 });
    }
}

function deleteFolder(folder) {
    showConfirm(`הפתקים שבה יועברו לתיקייה הכללית.`, () => {
        let folders = getFolders().filter(f => f !== folder);
        localStorage.setItem('folders', JSON.stringify(folders));
        let notes = getNotes();
        notes.forEach(n => { if (n.folder === folder) n.folder = 'תיקייה כללית'; });
        localStorage.setItem('notes', JSON.stringify(notes));
        showMainContent();
        loadFolders();
        showToast(`התיקייה "${folder}" נמחקה`);
    }, null, { title: `למחוק את התיקייה "${folder}"?`, confirmText: 'מחק תיקייה' });
}

let _justAddedNoteId = null;

function createNote(fromModal = false) {
    let text, due;
    if (fromModal) {
        text = document.getElementById('new-note-text').value;
        due = document.getElementById('new-note-due').value;
    } else {
        text = document.getElementById('note-text').value;
        due = document.getElementById('note-due').value;
    }
    if (!text || !text.trim()) {
        showToast('נא לכתוב משהו בפתק');
        const field = document.getElementById(fromModal ? 'new-note-text' : 'note-text');
        if (field) field.focus();
        return;
    }
    const note = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString(36).slice(2)),
        text: text,
        dueTime: due,
        folder: selectedFolder,
        color: selectedColor,
        customColor: selectedColor,
        textColor: null,  // null = צבע ברירת מחדל לפי CSS (לא נעקב אחריו)
        created: new Date().toISOString(),
        completed: false,
        notified: false,
        pinned: false,
        left: 50, top: 50, width: 250, height: 250
    };
    if (isBoardViewActive) {
        const container = document.getElementById('boardContainer');
        const noteW = 250, noteH = 250;
        let cx = 50, cy = 50;
        if (container) {
            const r = container.getBoundingClientRect();
            cx = Math.max(0, Math.round(window.innerWidth  / 2 - r.left - noteW / 2));
            cy = Math.max(0, Math.round(window.innerHeight / 2 - r.top  - noteH / 2));
        }
        note.left = cx; note.top = cy;
    }
    const notes = getNotes();
    notes.unshift(note);
    localStorage.setItem('notes', JSON.stringify(notes));
    if (!notePositions[note.id]) {
        notePositions[note.id] = { left: note.left, top: note.top, width: 250, height: 250 };
        localStorage.setItem('notePositions', JSON.stringify(notePositions));
    }
    clearForm();
    if (fromModal) {
        closeNewNoteModal();
    }
    _justAddedNoteId = note.id;
    loadNotesWithoutFolderView();
    _justAddedNoteId = null;
}

function loadNotesWithoutFolderView() {
    let notes = getNotes();
    const isDarkMode = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.notes-container').forEach(c => c.innerHTML = '');
    const board = document.getElementById('boardContainer');
    if (board) board.innerHTML = '';

    // מיון לפי נעיצה
    notes.sort((a, b) => Number(b.pinned || 0) - Number(a.pinned || 0));

    const existingTrashBtn = document.getElementById('floatingTrashBtn');
    if (existingTrashBtn) existingTrashBtn.remove();

    if (selectedFolder === 'אשפה') {
        const hasTrash = notes.some(n => n.folder === 'אשפה');
        if (hasTrash) {
            const trashBtn = document.createElement('button');
            trashBtn.id = 'floatingTrashBtn';
            trashBtn.className = 'fab fab-danger';
            trashBtn.innerHTML = `${ICONS.delete}<span>ריקון האשפה</span>`;
            trashBtn.onclick = clearTrash;
            document.body.appendChild(trashBtn);
        }
    }

    const perContainerIndex = new Map();
    notes.forEach(note => {
        if (isFolderViewActive && selectedFolder && note.folder !== selectedFolder) return;
        const el = createNoteElement(note, isDarkMode);
        if (note.id === _justAddedNoteId) el.classList.add('just-added');
        if (isBoardViewActive) {
            el.classList.add('board-note');
            let pos = notePositions[note.id] || { left: 50, top: 50, width: 250, height: 250 };
            el.style.left = pos.left + 'px';
            el.style.top = pos.top + 'px';
            el.style.width = pos.width + 'px';
            el.style.height = pos.height + 'px';
            if(board) board.appendChild(el);
            setupDragAndResize(el);
        } else {
            const container = [...document.querySelectorAll('.notes-container')].find(c => c.getAttribute('data-folder') === note.folder);
            if (container) {
                const i = perContainerIndex.get(container) || 0;
                perContainerIndex.set(container, i + 1);
                el.style.setProperty('--i', Math.min(i, 12));
                container.appendChild(el);
            }
        }
    });
    if (!isBoardViewActive) renderEmptyStates();
    updateFolderCounts();
    updateSubtitle();
    searchNotes();
}

const EMPTY_STATES = {
    'תיקייה כללית': { icon: 'inbox', title: 'אין פתקים עדיין', text: 'כתוב משהו בתיבה למעלה כדי להתחיל.' },
    'משימות שהושלמו': { icon: 'checkCircle', title: 'עוד לא הושלמו משימות', text: 'משימה שתסמן כהושלמה תופיע כאן.' },
    'אשפה': { icon: 'delete', title: 'האשפה ריקה', text: 'פתקים שתמחק יחכו כאן עד שתרוקן אותה.' }
};

function renderEmptyStates() {
    document.querySelectorAll('.notes-container').forEach(c => {
        if (c.querySelector('.note')) return;
        const folder = c.getAttribute('data-folder');
        const cfg = EMPTY_STATES[folder] || { icon: 'folder', title: 'התיקייה ריקה', text: 'אפשר להעביר לכאן פתקים דרך כפתור התיקייה שבכל פתק.' };
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `${ICONS[cfg.icon]}<strong></strong><span></span>`;
        empty.querySelector('strong').textContent = cfg.title;
        empty.querySelector('span').textContent = cfg.text;
        c.appendChild(empty);
    });
}

function updateFolderCounts() {
    const counts = {};
    getNotes().forEach(n => { counts[n.folder] = (counts[n.folder] || 0) + 1; });
    document.querySelectorAll('.folder-item').forEach(item => {
        const c = counts[item.getAttribute('data-folder')] || 0;
        const el = item.querySelector('.folder-count');
        if (el) el.textContent = c ? c : '';
    });
    document.querySelectorAll('.folder-container').forEach(fc => {
        const c = counts[fc.getAttribute('data-folder')] || 0;
        const el = fc.querySelector('.folder-title .count');
        if (el) el.textContent = c ? c : '';
    });
}

function updateSubtitle() {
    const el = document.getElementById('appSubtitle');
    if (!el) return;
    const now = Date.now();
    const open = getNotes().filter(n => !n.completed && n.folder !== 'אשפה' && n.folder !== 'משימות שהושלמו');
    const overdue = open.filter(n => n.dueTime && new Date(n.dueTime).getTime() < now).length;
    const date = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    let text = `${date} · ${open.length === 0 ? 'אין משימות פתוחות' : open.length === 1 ? 'משימה פתוחה אחת' : open.length + ' משימות פתוחות'}`;
    if (overdue) text += ` · ${overdue} באיחור`;
    if (el.textContent !== text) el.textContent = text;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

function formatDue(value) {
    const date = new Date(value);
    if (isNaN(date)) return '';
    const time = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
    if (dayDiff === 0) return 'היום ' + time;
    if (dayDiff === 1) return 'מחר ' + time;
    if (dayDiff === -1) return 'אתמול ' + time;
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ' ' + time;
}

function formatRelative(iso) {
    const date = new Date(iso);
    if (isNaN(date)) return '';
    const sec = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(sec);
    if (abs < 60) return 'עכשיו';
    try {
        const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
        if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
        if (abs < 7 * 86400) return rtf.format(Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000), 'day');
    } catch (e) {}
    return date.toLocaleDateString('he-IL');
}

function toLocalInputValue(value) {
    const d = new Date(value);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function closeAllNoteMenus(except) {
    document.querySelectorAll('.menu').forEach(m => {
        if (m === except) return;
        m.style.display = 'none';
        const btn = m.parentElement && m.parentElement.querySelector('.menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
}

function moveNoteToFolder(note, target) {
    note.folder = target;
    if (target === 'אשפה') { note.color = folderColors['אשפה'] || '#bdc3c7'; }
    else if (folderColors[target]) { note.color = folderColors[target]; }
    else { note.color = note.customColor || 'green'; }
    updateNoteInStorage(note);
    loadNotesWithoutFolderView();
    showToast(`הועבר אל "${target}"`);
}

function createNoteElement(note, isDarkMode) {
    const div = document.createElement('article');
    div.className = `note ${validColors.includes(note.color) ? note.color : ''}`;
    if (note.pinned) div.classList.add('pinned');
    div.setAttribute('data-id', note.id);
    if (!validColors.includes(note.color) && note.color) div.style.setProperty('--tint', note.color);
    if (note.completed) div.classList.add('completed');
    if (note.notified) div.classList.add('notified');

    const created = new Date(note.created);
    const createdFull = isNaN(created) ? '' : created.toLocaleString('he-IL', { dateStyle: 'full', timeStyle: 'short' });
    const now = Date.now();
    const dueTimeMs = note.dueTime ? new Date(note.dueTime).getTime() : 0;
    const isOverdue = note.dueTime && dueTimeMs < now && !note.completed;
    const dueTimeDisplay = note.dueTime ? formatDue(note.dueTime) : '';
    const inTrash = note.folder === 'אשפה';
    const deleteLabel = inTrash ? 'מחק לצמיתות' : 'העבר לאשפה';
    const folderColorDot = f => {
        if (f === 'אשפה') return folderColors[f] || 'var(--text-3)';
        return folderColors[f] || 'var(--text-3)';
    };

    div.innerHTML = `
        <div class="note-header">
            <button class="complete-btn ${note.completed ? 'active' : ''}" aria-pressed="${note.completed ? 'true' : 'false'}" title="${note.completed ? 'לחץ לביטול הסימון' : 'סמן כהושלם'}" aria-label="${note.completed ? 'בטל סימון הושלם' : 'סמן כהושלם'}">${ICONS.check}</button>
            <div class="note-actions">
                <button class="pin-btn ${note.pinned ? 'active' : ''}" aria-pressed="${note.pinned ? 'true' : 'false'}" title="${note.pinned ? 'בטל נעיצה' : 'נעץ למעלה'}" aria-label="${note.pinned ? 'בטל נעיצה' : 'נעץ למעלה'}">${ICONS.pin}</button>
                <button class="edit-btn" aria-pressed="false" title="ערוך" aria-label="ערוך פתק">${ICONS.edit}</button>
                <button class="extend-btn" title="קבע זמן" aria-label="קבע זמן תזכורת">${ICONS.clock}</button>
                <div class="folder-wrapper">
                    <button class="menu-btn" title="העבר לתיקייה" aria-label="העבר לתיקייה" aria-haspopup="menu" aria-expanded="false">${ICONS.folder}</button>
                    <div class="menu" role="menu" aria-label="העבר לתיקייה">
                        <div class="menu-label" aria-hidden="true">העבר לתיקייה</div>
                        ${getAllFolderNames().map(f => `<div class="menu-item${f === note.folder ? ' is-current' : ''}" role="menuitem" tabindex="-1" data-folder="${escapeHTML(f)}"><span class="dot" style="background:${escapeHTML(folderColorDot(f))}"></span>${escapeHTML(f)}</div>`).join('')}
                    </div>
                </div>
                <button class="delete-btn" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>
            </div>
        </div>
        <div class="note-toolbar" role="toolbar" aria-label="עיצוב טקסט">
            <button data-cmd="bold" title="מודגש" aria-label="מודגש">${ICONS.bold}</button>
            <button data-cmd="italic" title="נטוי" aria-label="נטוי">${ICONS.italic}</button>
            <button data-cmd="underline" title="קו תחתון" aria-label="קו תחתון">${ICONS.underline}</button>
            <span class="toolbar-sep" aria-hidden="true"></span>
            <button data-cmd="increaseFontSize" title="הגדל טקסט" aria-label="הגדל טקסט">${ICONS.zoomIn}</button>
            <button data-cmd="decreaseFontSize" title="הקטן טקסט" aria-label="הקטן טקסט">${ICONS.zoomOut}</button>
            <div class="note-text-color-picker" title="צבע טקסט">
                <span class="note-text-color-preview" aria-hidden="true">${ICONS.palette}</span>
                <input type="color" class="note-text-color-input" aria-label="צבע טקסט">
            </div>
        </div>
        <div class="note-content" contenteditable="false"></div>
        <div class="note-meta">
            ${dueTimeDisplay ? `<span class="meta-chip ${isOverdue ? 'is-overdue' : 'is-due'}" title="${isOverdue ? 'באיחור' : 'זמן ביצוע'}">${ICONS.alarm}${isOverdue ? 'באיחור · ' : ''}${escapeHTML(dueTimeDisplay)}</span>` : ''}
            <span class="meta-chip is-plain" title="נוצר ${escapeHTML(createdFull)}">${escapeHTML(formatRelative(note.created))}</span>
        </div>
        ${isBoardViewActive ? `<div class="resize-handle-bottom-right" aria-hidden="true"></div>` : ''}
    `;

    const content = div.querySelector('.note-content');
    if (note.textColor) content.style.color = note.textColor;
    const colorPreview = div.querySelector('.note-text-color-preview');
    if (note.textColor) colorPreview.style.color = note.textColor;

    div.querySelector('.delete-btn').onclick = () => {
        // אשפה → מחיקה צמיתה | משימות שהושלמו → אשפה | כל השאר → אשפה
        deleteNote(note.id, note.folder === 'אשפה');
    };
    const completeBtn = div.querySelector('.complete-btn');
    completeBtn.onclick = () => {
        if (note.completed) {
            note.completed = false;
            note.folder = 'תיקייה כללית';
            note.color = note.customColor || 'green';
            completeBtn.setAttribute('aria-pressed', 'false');
            completeBtn.setAttribute('aria-label', 'סמן כהושלם');
            completeBtn.title = 'סמן כהושלם';
            completeBtn.classList.remove('active');
            showToast('הוחזר לתיקייה הכללית');
        } else {
            note.completed = true;
            note.folder = 'משימות שהושלמו';
            completeBtn.setAttribute('aria-pressed', 'true');
            completeBtn.setAttribute('aria-label', 'בטל סימון הושלם');
            completeBtn.title = 'לחץ לביטול הסימון';
            completeBtn.classList.add('active');
            showToast('הועבר למשימות שהושלמו ✓');
        }
        updateNoteInStorage(note);
        // רגע קצר כדי לראות את הסימון לפני שהפתק עובר תיקייה
        setTimeout(loadNotesWithoutFolderView, 180);
    };
    div.querySelector('.pin-btn').onclick = () => togglePin(note.id);
    div.querySelector('.extend-btn').onclick = () => {
        openDateModal(note.dueTime, (newTime) => {
            if (newTime) { note.dueTime = newTime; note.notified = false; note.completed = false; updateNoteInStorage(note); loadNotesWithoutFolderView(); showToast('התזכורת נשמרה · ' + formatDue(newTime)); }
        });
    };

    const editBtn = div.querySelector('.edit-btn');
    const toolbar = div.querySelector('.note-toolbar');
    content.textContent = note.text; // בטוח מ-XSS

    editBtn.onclick = () => {
        const isEditing = toolbar.style.display === 'flex';
        if (isEditing) {
            toolbar.style.display = 'none'; content.contentEditable = 'false'; note.text = content.innerText; updateNoteInStorage(note);
            editBtn.setAttribute('aria-pressed', 'false');
        } else {
            document.querySelectorAll('.note-toolbar').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.note-content').forEach(c => c.contentEditable = 'false');
            document.querySelectorAll('.edit-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
            const rect = div.getBoundingClientRect();
            if (rect.top < 120) { toolbar.style.top = '44px'; } else { toolbar.style.top = '-50px'; }
            toolbar.style.display = 'flex'; content.contentEditable = 'true'; content.focus();
            editBtn.setAttribute('aria-pressed', 'true');
            // סמן בסוף הטקסט
            try {
                const range = document.createRange();
                range.selectNodeContents(content);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {}
        }
    };
    content.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && content.contentEditable === 'true') {
            e.preventDefault();
            e.stopPropagation();
            editBtn.click();
            editBtn.focus();
        }
    });

    toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.onmousedown = (e) => e.preventDefault(); // שומר על הבחירה בטקסט
        btn.onclick = (e) => {
            e.preventDefault(); const cmd = btn.dataset.cmd;
            if (cmd === 'increaseFontSize') document.execCommand('fontSize', false, '4');
            else if (cmd === 'decreaseFontSize') document.execCommand('fontSize', false, '2');
            else document.execCommand(cmd, false, null);
        };
    });

    const colorInput = div.querySelector('.note-text-color-input');
    if (note.textColor && /^#[0-9a-f]{6}$/i.test(note.textColor)) colorInput.value = note.textColor;
    colorInput.oninput = (e) => { const val = e.target.value; content.style.color = val; note.textColor = val; colorPreview.style.color = val; };
    colorInput.onchange = () => updateNoteInStorage(note);

    const menuBtn = div.querySelector('.menu-btn');
    const menu = div.querySelector('.menu');
    const menuItems = [...menu.querySelectorAll('.menu-item')];
    const closeMenu = (focusBtn) => {
        menu.style.display = 'none';
        div.style.zIndex = '';
        menuBtn.setAttribute('aria-expanded', 'false');
        if (focusBtn) menuBtn.focus();
    };
    menuBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            showFolderBottomSheet(note, menuBtn);
            return;
        }
        closeAllNoteMenus(menu);
        document.querySelectorAll('.note').forEach(n => n.style.zIndex = '');
        if (menu.style.display === 'block') {
            closeMenu(false);
        } else {
            menu.style.display = 'block';
            div.style.zIndex = '5000';
            menuBtn.setAttribute('aria-expanded', 'true');
            const current = menuItems.find(i => i.classList.contains('is-current')) || menuItems[0];
            if (current && e.detail === 0) current.focus(); // פתיחה מהמקלדת
        }
    };

    menu.addEventListener('keydown', (e) => {
        const idx = menuItems.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (menuItems[idx + 1] || menuItems[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (menuItems[idx - 1] || menuItems[menuItems.length - 1]).focus(); }
        else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); e.stopPropagation(); closeMenu(true); }
        else if ((e.key === 'Enter' || e.key === ' ') && idx >= 0) { e.preventDefault(); menuItems[idx].click(); }
    });

    menuItems.forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            moveNoteToFolder(note, item.getAttribute('data-folder'));
        };
    });

    content.addEventListener('input', function() { note.text = this.innerText; updateNoteInStorage(note); });
    return div;
}

// --- ניהול הגדרות סאונד ---

function createSettingsFloatingButton() {
    if (document.getElementById('settingsFloatingBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'settingsFloatingBtn';
    btn.className = 'fab';
    btn.innerHTML = ICONS.settings;
    btn.title = 'צליל התראה';
    btn.setAttribute('aria-label', 'הגדרות צליל התראה');
    btn.onclick = showSettingsModal;
    document.body.appendChild(btn);
}

const SOUND_LABELS = { sound1: 'צליל 1 · עדין', sound2: 'צליל 2 · שעון', sound3: 'צליל 3 · פעמון' };

function showSettingsModal() {
    const d = createDialog({
        id: 'settingsModal',
        title: 'צליל התראה',
        message: 'הצליל שיתנגן כשמגיע זמן של משימה.',
        icon: 'settings'
    });
    const group = document.createElement('div');
    group.id = 'soundOptionsList';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'בחירת צליל');
    Object.keys(SOUND_FILES).forEach(key => {
        const opt = document.createElement('div');
        opt.className = 'sound-option' + (key === currentSoundKey ? ' active' : '');
        opt.dataset.sound = key;
        opt.setAttribute('role', 'radio');
        opt.setAttribute('aria-checked', key === currentSoundKey ? 'true' : 'false');
        opt.tabIndex = key === currentSoundKey ? 0 : -1;
        opt.innerHTML = `<span class="radio-dot" aria-hidden="true"></span><span class="sound-label"></span><button type="button" class="icon-btn" aria-label="השמע">${ICONS.play}</button>`;
        opt.querySelector('.sound-label').textContent = SOUND_LABELS[key] || key;
        opt.querySelector('button').setAttribute('aria-label', 'השמע ' + (SOUND_LABELS[key] || key));
        opt.querySelector('button').onclick = (e) => { e.stopPropagation(); previewSound(key); };
        group.appendChild(opt);
    });
    const options = [...group.querySelectorAll('.sound-option')];
    const choose = (opt) => {
        options.forEach(o => { o.classList.remove('active'); o.setAttribute('aria-checked', 'false'); o.tabIndex = -1; });
        opt.classList.add('active');
        opt.setAttribute('aria-checked', 'true');
        opt.tabIndex = 0;
        currentSoundKey = opt.dataset.sound;
        localStorage.setItem('selectedSound', currentSoundKey);
        alertSound = new Audio(SOUND_FILES[currentSoundKey]);
    };
    options.forEach((opt, i) => {
        opt.onclick = (e) => { if (e.target.closest('button')) return; choose(opt); };
        opt.onkeydown = (e) => {
            if (e.target !== opt) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(opt); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); const n = options[(i + 1) % options.length]; choose(n); n.focus(); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); const n = options[(i - 1 + options.length) % options.length]; choose(n); n.focus(); }
        };
    });
    d.body.appendChild(group);
    const done = d.addButton('סיום', 'primary', () => d.close());
    (group.querySelector('.sound-option.active') || done).focus();
}

window.previewSound = function(key) {
    const tempAudio = new Audio(SOUND_FILES[key]);
    tempAudio.play().catch(e => console.error("Error playing sound:", e));
};

let _guideCloseFocus = null;

function showGuideModal() {
    const modal = document.getElementById('guideModal');
    let contentContainer = modal.querySelector('.guide-modal-content');

    contentContainer.innerHTML = `
        <div class="dialog-icon">${ICONS.edit}</div>
        <h2 id="guideTitle">ברוכים הבאים לפתקי משימות</h2>
        <p>כל המשימות והרעיונות שלך במקום אחד, מסודרים בתיקיות ועם תזכורות.</p>
        <div class="guide-columns">
            <div class="guide-col">
                <h3><span class="inline-icon">${ICONS.list}</span> תצוגת רשימה</h3>
                <p>עבודה מסודרת לפי תיקיות. צור תיקיות, צבע אותן ונהל משימות שוטפות.</p>
            </div>
            <div class="guide-col">
                <h3><span class="inline-icon">${ICONS.grid}</span> תצוגת לוח</h3>
                <p>מרחב חופשי במחשב: גרור פתקים לכל מקום ושנה את גודלם.</p>
            </div>
        </div>
        <ul class="guide-list">
            <li><span class="inline-icon">${ICONS.plus}</span><span><strong>יצירה:</strong> כתוב בתיבה למעלה ולחץ "הוסף פתק", או Ctrl+Enter.</span></li>
            <li><span class="inline-icon">${ICONS.check}</span><span><strong>סיום משימה:</strong> לחץ על העיגול בפינת הפתק.</span></li>
            <li><span class="inline-icon">${ICONS.pin}</span><span><strong>נעיצה:</strong> הצמד פתקים חשובים לראש הרשימה.</span></li>
            <li><span class="inline-icon">${ICONS.folder}</span><span><strong>תיקיות:</strong> העבר פתקים לתיקיות אישיות וצבעוניות.</span></li>
            <li><span class="inline-icon">${ICONS.edit}</span><span><strong>עריכה:</strong> לחץ על העיפרון לעריכת טקסט, הדגשה וצבע.</span></li>
            <li><span class="inline-icon">${ICONS.clock}</span><span><strong>תזכורות:</strong> קבע זמן וקבל התראה עם צליל לבחירתך.</span></li>
            <li><span class="inline-icon">${ICONS.delete}</span><span><strong>אשפה:</strong> פתקים שנמחקים נשמרים באשפה עד שתרוקן אותה.</span></li>
        </ul>
        <div class="guide-shortcuts" aria-label="קיצורי מקלדת">
            <span><kbd>/</kbd> חיפוש</span>
            <span><kbd>N</kbd> פתק חדש</span>
            <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> שמירה</span>
            <span><kbd>Esc</kbd> סגירה</span>
        </div>
        <div class="guide-footer">
            <label class="guide-check">
                <input type="checkbox" id="markGuideRead"> קראתי והבנתי, אל תציג שוב
            </label>
            <button id="closeGuideModalAction" class="btn btn-primary btn-block">בואו נתחיל</button>
            <div class="copyright-footer">&copy; 2026 כל הזכויות שמורות - אדיר אקוע</div>
        </div>
    `;

    const trigger = document.activeElement;
    modal.style.display = 'flex';
    modal.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); handleGuideClose(); } };
    modal.onmousedown = (e) => { if (e.target === modal) handleGuideClose(); };
    setTimeout(() => {
        const closeBtn = document.getElementById('closeGuideModalAction');
        if(closeBtn) closeBtn.onclick = handleGuideClose;
        _guideCloseFocus = trapFocus(modal, trigger && trigger !== document.body ? trigger : null);
        if (closeBtn) closeBtn.focus();
    }, 50);
}

function handleGuideClose() {
    const checkbox = document.getElementById('markGuideRead');
    if (checkbox && checkbox.checked) localStorage.setItem('hasSeenGuide_final_v1', 'true');
    document.getElementById('guideModal').style.display = 'none';
    if (_guideCloseFocus) { _guideCloseFocus(); _guideCloseFocus = null; }
}

function closeGuideModal() { document.getElementById('guideModal').style.display = 'none'; }

function closeGuideModalFromAction() { handleGuideClose(); }

function searchNotes() {
    const s1 = document.getElementById('search-input');
    const s2 = document.getElementById('board-search-input');
    const val1 = s1 ? s1.value.toLowerCase() : '';
    const val2 = s2 ? s2.value.toLowerCase() : '';
    const term = (isBoardViewActive ? (val2 || val1) : (val1 || val2)).trim();
    document.querySelectorAll('.note').forEach(note => {
        const text = (note.querySelector('.note-content') || note).innerText.toLowerCase();
        note.style.display = text.includes(term) ? 'flex' : 'none';
    });
    document.querySelectorAll('.notes-container').forEach(c => {
        const old = c.querySelector('.no-results');
        if (old) old.remove();
        const notes = c.querySelectorAll('.note');
        const empty = c.querySelector('.empty-state');
        if (empty) empty.style.display = term ? 'none' : '';
        if (!term || !notes.length) return;
        if ([...notes].some(n => n.style.display !== 'none')) return;
        const msg = document.createElement('p');
        msg.className = 'no-results';
        msg.textContent = `לא נמצאו פתקים עבור "${term}"`;
        c.appendChild(msg);
    });
}

function autosizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px';
}

function clearForm() {
    if(document.getElementById('note-text')) document.getElementById('note-text').value = '';
    if(document.getElementById('note-due')) document.getElementById('note-due').value = '';
    if(document.getElementById('new-note-text')) document.getElementById('new-note-text').value = '';
    if(document.getElementById('new-note-due')) document.getElementById('new-note-due').value = '';
    const t = document.getElementById('note-text');
    if (t) t.style.height = '';
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    updateTopIcons();
}

function deleteNote(id, permanent) {
    if (permanent) {
        showConfirm('לא ניתן יהיה לשחזר אותו.', () => {
            let notes = getNotes().filter(n => n.id !== id);
            delete notePositions[id];
            localStorage.setItem('notePositions', JSON.stringify(notePositions));
            localStorage.setItem('notes', JSON.stringify(notes));
            loadNotesWithoutFolderView();
            showToast('הפתק נמחק לצמיתות');
        }, null, { title: 'למחוק את הפתק לצמיתות?', confirmText: 'מחק לצמיתות' });
        return;
    }
    let notes = getNotes();
    const note = notes.find(n => n.id === id);
    let previous = null;
    if (note) {
        previous = { folder: note.folder, color: note.color };
        note.folder = 'אשפה';
        note.color = folderColors['אשפה'] || '#bdc3c7';
    }
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotesWithoutFolderView();
    if (previous) {
        showToast('הפתק הועבר לאשפה', 5000, {
            label: 'ביטול',
            onClick: () => {
                const all = getNotes();
                const n = all.find(x => x.id === id);
                if (n && n.folder === 'אשפה') {
                    n.folder = previous.folder;
                    n.color = previous.color;
                    localStorage.setItem('notes', JSON.stringify(all));
                    loadNotesWithoutFolderView();
                }
            }
        });
    }
}

function showFolderBottomSheet(note, triggerEl) {
    let overlay = document.getElementById('mobileFolderSheetOverlay');
    let sheet = document.getElementById('mobileFolderSheet');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mobileFolderSheetOverlay';
        document.body.appendChild(overlay);
    }
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'mobileFolderSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'mobileFolderSheetTitle');
        document.body.appendChild(sheet);
    }
    const folders = getAllFolderNames();
    sheet.innerHTML = `
        <div class="mobile-folder-sheet-title" id="mobileFolderSheetTitle">העבר לתיקייה</div>
        ${folders.map(f => `<div class="mobile-folder-item${f === note.folder ? ' is-current' : ''}" role="button" tabindex="0" data-folder="${escapeHTML(f)}"><span class="dot" style="background:${escapeHTML(folderColors[f] || 'var(--text-3)')}"></span>${escapeHTML(f)}</div>`).join('')}
    `;
    sheet._trigger = triggerEl || null;
    sheet.querySelectorAll('.mobile-folder-item').forEach(item => {
        const choose = () => {
            closeFolderBottomSheet();
            moveNoteToFolder(note, item.getAttribute('data-folder'));
        };
        item.onclick = choose;
        item.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
    });
    sheet.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeFolderBottomSheet(); } };
    overlay.onclick = closeFolderBottomSheet;
    overlay.classList.add('active');
    requestAnimationFrame(() => {
        sheet.classList.add('active');
        const first = sheet.querySelector('.mobile-folder-item.is-current') || sheet.querySelector('.mobile-folder-item');
        if (first) first.focus({ preventScroll: true });
    });
}

function setupDatetimePlaceholders() {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('input[type="datetime-local"]').forEach(input => {
        const ph = input.getAttribute('placeholder');
        if (!ph || input.closest('.datetime-wrapper')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'datetime-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        const fakeLabel = document.createElement('span');
        fakeLabel.className = 'datetime-fake-ph';
        fakeLabel.textContent = ph;
        wrapper.insertBefore(fakeLabel, input);
    });
}

function closeFolderBottomSheet() {
    const sheet = document.getElementById('mobileFolderSheet');
    const overlay = document.getElementById('mobileFolderSheetOverlay');
    if (sheet) {
        sheet.classList.remove('active');
        if (sheet._trigger && document.contains(sheet._trigger)) sheet._trigger.focus({ preventScroll: true });
        sheet._trigger = null;
    }
    if (overlay) overlay.classList.remove('active');
}

function clearTrash() {
    showConfirm('כל הפתקים שבאשפה יימחקו לצמיתות.', () => {
        let notes = getNotes().filter(n => n.folder !== 'אשפה');
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotesWithoutFolderView();
        showToast('האשפה רוקנה');
    }, null, { title: 'לרוקן את האשפה?', confirmText: 'רוקן אשפה' });
}

// --- גיבוי: IndexedDB לשמירת תיקיית גיבוי ---
function openBackupDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('notesBackupDB', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('handles', { keyPath: 'key' });
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveBackupDirHandle(handle) {
    try {
        const db = await openBackupDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put({ key: 'backupDir', handle });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {}
}

async function getBackupDirHandle() {
    try {
        const db = await openBackupDB();
        return await new Promise(resolve => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('backupDir');
            req.onsuccess = () => resolve(req.result ? req.result.handle : null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}

function buildBackupBlob() {
    const data = { notes: getNotes(), folders: getFolders(), folderColors, notePositions };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

function fallbackBackupDownload(filename) {
    const url = URL.createObjectURL(buildBackupBlob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function writeBlobToDir(dirHandle, filename) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buildBackupBlob());
    await writable.close();
}

async function backupNotes() {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `notes_backup_${today}.json`;
    const blob = buildBackupBlob();

    // מובייל: שיתוף קובץ דרך Web Share API
    if (navigator.share) {
        const shareFile = new File([blob], filename, { type: 'application/json' });
        try {
            await navigator.share({ files: [shareFile], title: 'גיבוי פתקים' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
            // אם שיתוף נכשל — עובר לשיטה הבאה
        }
    }

    // דסקטופ: File System Access API
    if (!('showDirectoryPicker' in window)) {
        fallbackBackupDownload(filename);
        return;
    }
    try {
        let dirHandle = await getBackupDirHandle();
        if (dirHandle) {
            let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                await writeBlobToDir(dirHandle, filename);
                showAlert('גיבוי נשמר בהצלחה! 💾');
                return;
            }
        }
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveBackupDirHandle(dirHandle);
        await writeBlobToDir(dirHandle, filename);
        showAlert('גיבוי נשמר בהצלחה! 💾');
    } catch (e) {
        if (e.name !== 'AbortError') fallbackBackupDownload(filename);
    }
}

async function autoBackupIfTime() {
    const now = new Date();
    if (now.getHours() !== 16 || now.getMinutes() !== 0) return;
    const today = now.toISOString().slice(0, 10);
    if (localStorage.getItem('lastAutoBackup') === today) return;
    const dirHandle = await getBackupDirHandle();
    if (!dirHandle) return;
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return;
    try {
        await writeBlobToDir(dirHandle, `notes_backup_${today}.json`);
        localStorage.setItem('lastAutoBackup', today);
        showAlert('גיבוי אוטומטי נשמר! 💾');
    } catch (e) {}
}

function restoreNotes(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.notes) localStorage.setItem('notes', JSON.stringify(data.notes));
            if (data.folders) localStorage.setItem('folders', JSON.stringify(data.folders));
            if (data.folderColors) localStorage.setItem('folderColors', JSON.stringify(data.folderColors));
            if (data.notePositions) localStorage.setItem('notePositions', JSON.stringify(data.notePositions));
            folderColors = data.folderColors || {};
            notePositions = data.notePositions || {};
            loadFolders();
            loadNotesWithoutFolderView();
            showAlert('שוחזר בהצלחה! 🎉');
        } catch (err) {
            showAlert('שגיאה בקובץ הגיבוי. ודא שהקובץ תקין.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function setupDragAndResize(el) {
    const header = el.querySelector('.note-header');
    let isDragging = false;
    let offsetX, offsetY;

    function getCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    }

    function onDragStart(e) {
        if (e.target.closest('button, .menu, [contenteditable="true"]')) return;
        e.preventDefault();
        isDragging = true;
        const coords = getCoords(e);
        const noteRect = el.getBoundingClientRect();
        offsetX = coords.clientX - noteRect.left;
        offsetY = coords.clientY - noteRect.top;
        el.classList.add('is-dragging');
        el.style.zIndex = 1000;
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const coords = getCoords(e);
        const cRect = el.parentElement.getBoundingClientRect();
        let newLeft = coords.clientX - cRect.left - offsetX;
        let newTop  = coords.clientY - cRect.top  - offsetY;
        if (newLeft < 0) newLeft = 0;
        if (newTop  < 0) newTop  = 0;
        el.style.left = `${newLeft}px`;
        el.style.top  = `${newTop}px`;

        const MARGIN = 80, SPEED = 14;
        if (coords.clientY > window.innerHeight - MARGIN) window.scrollBy(0,  SPEED);
        else if (coords.clientY < MARGIN)                  window.scrollBy(0, -SPEED);
        if (coords.clientX > window.innerWidth  - MARGIN) window.scrollBy( SPEED, 0);
        else if (coords.clientX < MARGIN)                  window.scrollBy(-SPEED, 0);
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('is-dragging');
        el.style.zIndex = '';
        const id = el.getAttribute('data-id');
        notePositions[id] = {
            left: el.offsetLeft, top: el.offsetTop,
            width: el.offsetWidth, height: el.offsetHeight
        };
        localStorage.setItem('notePositions', JSON.stringify(notePositions));
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup',   onDragEnd);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('touchend',  onDragEnd);
        window.removeEventListener('touchcancel', onDragEnd);
    }

    header.addEventListener('mousedown', (e) => {
        onDragStart(e);
        if (isDragging) {
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('mouseup',   onDragEnd);
        }
    });

    header.addEventListener('touchstart', (e) => {
        onDragStart(e);
        if (isDragging) {
            window.addEventListener('touchmove',   onDragMove, { passive: false });
            window.addEventListener('touchend',    onDragEnd);
            window.addEventListener('touchcancel', onDragEnd);
        }
    }, { passive: false });

    const handle = el.querySelector('.resize-handle-bottom-right');
    if (handle) {
        handle.onmousedown = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const container = el.parentElement;
            const noteLeft  = el.offsetLeft;
            const startH    = el.offsetHeight;
            const startY    = e.clientY;
            el.classList.add('is-resizing');
            const onMove = (ev) => {
                const cRect = container.getBoundingClientRect();
                const mouseInContainer = ev.clientX - cRect.left + window.scrollX;
                const newW = Math.max(150, mouseInContainer - noteLeft);
                const newH = Math.max(120, startH + (ev.clientY - startY));
                el.style.width  = newW + 'px';
                el.style.height = newH + 'px';
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup',  onUp);
                el.classList.remove('is-resizing');
                const id = el.getAttribute('data-id');
                if (notePositions[id]) {
                    notePositions[id].width  = el.offsetWidth;
                    notePositions[id].height = el.offsetHeight;
                    localStorage.setItem('notePositions', JSON.stringify(notePositions));
                }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup',  onUp);
        };
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window) || !window.isSecureContext) {
        showAlert('התראות דורשות חיבור מאובטח (HTTPS).\nכדי להפעיל: פרוס את האפליקציה ב-HTTPS והוסף אותה למסך הבית.');
        return;
    }
    if (Notification.permission === 'denied') {
        showAlert('ההתראות חסומות.\nכדי לאפשר: הגדרות דפדפן ← הרשאות אתר ← התראות ← מצא את האתר ← אפשר.');
        return;
    }
    if (Notification.permission === 'granted') {
        showToast('התראות כבר מופעלות ✓');
        updateNotifBtn();
        return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') showToast('התראות הופעלו! 🔔');
    updateNotifBtn();
}

function updateNotifBtn() {
    const btn = document.getElementById('sidebarNotifBtn');
    if (!btn) return;
    if (!('Notification' in window) || !window.isSecureContext) {
        btn.innerHTML = ICONS.bellOff; btn.title = 'התראות — דורשות HTTPS'; btn.setAttribute('aria-label', btn.title); btn.style.opacity = '0.5';
        return;
    }
    if (Notification.permission === 'granted') {
        btn.innerHTML = ICONS.bell; btn.title = 'התראות פעילות'; btn.setAttribute('aria-label', btn.title); btn.style.opacity = '0.45';
    } else if (Notification.permission === 'denied') {
        btn.innerHTML = ICONS.bellOff; btn.title = 'התראות חסומות — שנה בהגדרות'; btn.setAttribute('aria-label', btn.title); btn.style.opacity = '0.5';
    } else {
        btn.innerHTML = ICONS.bell; btn.title = 'לחץ להפעלת התראות'; btn.setAttribute('aria-label', btn.title); btn.style.opacity = '1';
    }
}

function showDueNotification(text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (sw) {
        sw.postMessage({ type: 'SHOW_NOTIFICATION', title: 'הזמן עבר! ⏰', body: text });
    } else {
        new Notification('הזמן עבר! ⏰', {
            body: text, icon: './icon-192.png', dir: 'rtl', lang: 'he'
        });
    }
}

function checkDueTimes() {
    const notes = getNotes();
    const now = Date.now();
    let changed = false;
    notes.forEach(n => {
        if (n.dueTime && !n.completed && !n.notified) {
            const dueMs = new Date(n.dueTime).getTime();
            if (dueMs <= now) {
                alertSound.play().catch(e => console.log('Audio blocked until interaction'));
                showCustomAlertModal(n.text);
                showDueNotification(n.text);
                n.notified = true;
                changed = true;
            }
        }
    });
    if (changed) {
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotesWithoutFolderView();
    }
}

function showCustomAlertModal(text) {
    if (document.getElementById('custom-alert-overlay')) return;
    const d = createDialog({
        id: 'custom-alert-overlay',
        title: 'הזמן עבר!',
        icon: 'alarm',
        tone: 'warning',
        layer: 'alert'
    });
    const quote = document.createElement('div');
    quote.className = 'dialog-quote';
    quote.textContent = text;
    d.body.appendChild(quote);
    d.addButton('הבנתי', 'primary', () => d.close()).focus();
}

function openDateModal(currentTime, callback) {
    const d = createDialog({ title: 'מתי להזכיר?', icon: 'clock', message: 'בחר תאריך ושעה, או אחת מהאפשרויות המהירות.' });
    const inputId = 'date-modal-input-' + Date.now();
    d.body.innerHTML = `
        <div class="quick-times" role="group" aria-label="בחירה מהירה"></div>
        <label class="field-label" for="${inputId}">תאריך ושעה</label>
        <input type="datetime-local" id="${inputId}">
    `;
    const input = d.body.querySelector('input');
    if (currentTime) input.value = toLocalInputValue(currentTime);
    const quick = d.body.querySelector('.quick-times');
    const at = (fn) => { const t = new Date(); fn(t); return t; };
    [
        ['בעוד שעה', at(t => { t.setHours(t.getHours() + 1); })],
        ['הערב 20:00', at(t => { t.setHours(20, 0, 0, 0); })],
        ['מחר 09:00', at(t => { t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); })],
        ['בעוד שבוע', at(t => { t.setDate(t.getDate() + 7); t.setHours(9, 0, 0, 0); })]
    ].forEach(([label, date]) => {
        if (date.getTime() <= Date.now()) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-btn';
        b.textContent = label;
        b.onclick = () => {
            input.value = toLocalInputValue(date);
            quick.querySelectorAll('.chip-btn').forEach(x => x.setAttribute('aria-pressed', 'false'));
            b.setAttribute('aria-pressed', 'true');
        };
        b.setAttribute('aria-pressed', 'false');
        quick.appendChild(b);
    });
    d.addButton('ביטול', 'secondary', () => d.close());
    d.addButton('שמירה', 'primary', () => { callback(input.value); d.close(); });
    setTimeout(() => (quick.querySelector('button') || input).focus(), 30);
}

function toggleBoardView() {
    isBoardViewActive = !isBoardViewActive;
    const main = document.getElementById('mainContent');
    const board = document.getElementById('boardView');
    if (isBoardViewActive) {
        if(main) main.style.display = 'none';
        if(board) board.style.display = 'flex';
        document.body.style.overflowX = 'auto';
        const addBtn = document.getElementById('addNoteBtn');
        if(addBtn) addBtn.style.display = 'inline-block';
        // אם אין תיקייה פעילה — ברירת מחדל: תיקייה כללית
        if (!isFolderViewActive) {
            selectedFolder = 'תיקייה כללית';
            isFolderViewActive = true;
        }
        const badge = document.getElementById('boardFolderBadge');
        if (badge) { badge.textContent = selectedFolder; badge.style.display = 'inline-flex'; }
        loadNotesWithoutFolderView();
    } else {
        if(main) main.style.display = 'block';
        if(board) board.style.display = 'none';
        document.body.style.overflowX = '';
        const badge = document.getElementById('boardFolderBadge');
        if(badge) badge.style.display = 'none';
        const addBtn = document.getElementById('addNoteBtn');
        if(addBtn) addBtn.style.display = 'none';
        showMainContent();
    }
    updateTopIcons();
}

function setupEventListeners() {
    document.getElementById('create-note-btn').onclick = () => createNote(false);
    document.getElementById('clear-form-btn').onclick = clearForm;
    document.getElementById('darkModeToggle').onclick = toggleDarkMode;
    document.getElementById('backup-notes-btn').onclick = backupNotes;
    document.getElementById('create-folder-btn').onclick = createFolder;
    document.getElementById('guideIcon').onclick = showGuideModal;
    
    // תפריט הצד: מעבר עכבר פותח במחשב, לחיצה פותחת בכל מכשיר, Escape או לחיצה ברקע סוגרים
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('foldersSidebar');
    if(toggleBtn && sidebar) {
        toggleBtn.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) setSidebarOpen(true); });
        toggleBtn.addEventListener('click', (e) => setSidebarOpen(true, { focus: e.detail === 0 }));
        sidebar.addEventListener('mouseleave', () => { if (window.matchMedia('(hover: hover)').matches) setSidebarOpen(false); });
    }
    const scrim = document.getElementById('sidebarScrim');
    if (scrim) scrim.addEventListener('click', () => setSidebarOpen(false));

    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.onclick = () => setSidebarOpen(false, { returnFocus: true });
    }

    // כפתורי כלים בסרגל צד (מובייל)
    const sidebarGuideBtn = document.getElementById('sidebarGuideBtn');
    if (sidebarGuideBtn) sidebarGuideBtn.onclick = showGuideModal;
    const sidebarDarkBtn = document.getElementById('sidebarDarkBtn');
    if (sidebarDarkBtn) sidebarDarkBtn.onclick = toggleDarkMode;
    const sidebarSoundBtn = document.getElementById('sidebarSoundBtn');
    if (sidebarSoundBtn) sidebarSoundBtn.onclick = showSettingsModal;
    const sidebarNotifBtn = document.getElementById('sidebarNotifBtn');
    if (sidebarNotifBtn) sidebarNotifBtn.onclick = requestNotificationPermission;

    const oldCloseBtn = document.getElementById('closeGuideModal');
    if(oldCloseBtn) oldCloseBtn.onclick = handleGuideClose;

    document.getElementById('search-input').oninput = searchNotes;
    const boardSearch = document.getElementById('board-search-input');
    if(boardSearch) boardSearch.oninput = searchNotes;

    document.getElementById('boardToggle').onclick = toggleBoardView;
    document.getElementById('backToListBtn').onclick = () => { if(isBoardViewActive) toggleBoardView(); };

    const addNoteBtn = document.getElementById('addNoteBtn');
    if(addNoteBtn) addNoteBtn.onclick = openNewNoteModal;
    const newNoteModal = document.getElementById('newNoteModal');
    if (newNoteModal) {
        newNoteModal.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeNewNoteModal(); } });
        newNoteModal.addEventListener('mousedown', (e) => { if (e.target === newNoteModal) closeNewNoteModal(); });
    }

    // תיבת הכתיבה: גדלה עם הטקסט, Ctrl/Cmd+Enter שומר
    const noteText = document.getElementById('note-text');
    if (noteText) {
        noteText.addEventListener('input', () => autosizeTextarea(noteText));
        noteText.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); createNote(false); }
        });
    }
    const newNoteText = document.getElementById('new-note-text');
    if (newNoteText) {
        newNoteText.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); createNote(true); }
        });
    }

    document.getElementById('confirm-new-note-btn').onclick = () => createNote(true);
    document.getElementById('cancel-new-note-btn').onclick = closeNewNoteModal;
    document.getElementById('backBtn').onclick = showMainContent;

    const restoreBtn = document.getElementById('restore-notes-btn');
    const restoreInput = document.getElementById('restore-input');
    if (restoreBtn && restoreInput) {
        restoreBtn.onclick = () => restoreInput.click();
        restoreInput.onchange = restoreNotes;
    }

    const cpBtn = document.getElementById('note-color-picker-btn');
    const cpInp = document.getElementById('note-color-picker');
    if(cpBtn && cpInp) {
        cpBtn.onclick = () => cpInp.click();
        cpInp.oninput = (e) => {
            selectedColor = e.target.value;
            localStorage.setItem('selectedColor', selectedColor);
            document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
        };
    }
    
    document.querySelectorAll('#createNoteSection .color-circle:not(.note-color-picker), #newNoteModal .color-circle:not(.note-color-picker)').forEach(c => {
        c.onclick = function() {
            selectedColor = this.getAttribute('data-color');
            localStorage.setItem('selectedColor', selectedColor);
            syncColorRadios();
        };
    });
    // מקלדת: Enter/רווח בוחרים, חצים עוברים בין הצבעים
    document.querySelectorAll('.color-options').forEach(group => {
        group.addEventListener('keydown', (e) => {
            const circle = e.target.closest('.color-circle');
            if (!circle) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); circle.click(); return; }
            const circles = [...group.querySelectorAll('.color-circle')];
            const i = circles.indexOf(circle);
            let next = null;
            if (e.key === 'ArrowLeft') next = circles[i + 1];
            if (e.key === 'ArrowRight') next = circles[i - 1];
            if (next) { e.preventDefault(); next.focus(); if (next.getAttribute('role') === 'radio') next.click(); }
        });
    });

    const newCpBtn = document.getElementById('new-note-color-picker-btn');
    const newCpInp = document.getElementById('new-note-color-picker');
    if(newCpBtn && newCpInp) {
        newCpBtn.onclick = () => newCpInp.click();
        newCpInp.oninput = (e) => {
            selectedColor = e.target.value;
            localStorage.setItem('selectedColor', selectedColor);
            syncColorRadios();
        };
    }
    if (cpInp) cpInp.addEventListener('input', syncColorRadios);

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.menu-btn') && !e.target.closest('.menu') &&
            !e.target.closest('.note-toolbar') && !e.target.closest('.edit-btn') &&
            !e.target.closest('.color-circle')) {
            closeAllNoteMenus();
            document.querySelectorAll('.note-toolbar').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.note-content').forEach(c => c.contentEditable = 'false');
            document.querySelectorAll('.edit-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
            document.querySelectorAll('.note').forEach(n => n.style.zIndex = '');
        }
    });

    // קיצורי מקלדת גלובליים
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        const t = e.target;
        const typing = t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
        if (e.key === 'Escape') {
            if (topmostDialog()) return;
            const openMenu = [...document.querySelectorAll('.menu')].find(m => m.style.display === 'block');
            if (openMenu) { closeAllNoteMenus(); const b = openMenu.parentElement.querySelector('.menu-btn'); if (b) b.focus(); return; }
            const sheet = document.getElementById('mobileFolderSheet');
            if (sheet && sheet.classList.contains('active')) { closeFolderBottomSheet(); return; }
            if (sidebar && sidebar.classList.contains('active') && !isSidebarPinned()) { setSidebarOpen(false, { returnFocus: true }); return; }
            if (t && (t.id === 'search-input' || t.id === 'board-search-input') && t.value) { t.value = ''; searchNotes(); return; }
            return;
        }
        if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.dialog-overlay, .guide-modal[style*="flex"], .new-note-modal[style*="flex"]')) return;
        if (e.key === '/' || e.code === 'Slash') {
            e.preventDefault();
            const field = isBoardViewActive ? document.getElementById('board-search-input') : document.getElementById('search-input');
            if (field) { field.focus(); field.select(); }
        } else if (e.code === 'KeyN') {
            e.preventDefault();
            if (isBoardViewActive) { openNewNoteModal(); return; }
            if (isFolderViewActive) showMainContent();
            const field = document.getElementById('note-text');
            if (field) { field.focus(); field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }
    });

    // מעבר בין מסך רחב לצר: תפריט הצד חוזר למצב סגור
    window.matchMedia('(min-width: 1100px)').addEventListener('change', () => setSidebarOpen(false));
}

function syncColorRadios() {
    const isCustom = !validColors.includes(selectedColor);
    document.querySelectorAll('.color-circle').forEach(c => {
        if (c.classList.contains('note-color-picker')) {
            c.classList.toggle('selected', isCustom);
            c.style.background = isCustom ? selectedColor : '';
            return;
        }
        const on = c.getAttribute('data-color') === selectedColor;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
}

function openNewNoteModal() {
    const modal = document.getElementById('newNoteModal');
    const trigger = document.activeElement;
    modal.style.display = 'flex';
    setTimeout(() => {
        modal._releaseFocus = trapFocus(modal, trigger && trigger !== document.body ? trigger : document.getElementById('addNoteBtn'));
        const field = document.getElementById('new-note-text');
        if (field) field.focus();
    }, 50);
}

function closeNewNoteModal() {
    const modal = document.getElementById('newNoteModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    if (modal._releaseFocus) { modal._releaseFocus(); modal._releaseFocus = null; }
}

// --- 5. הפעלה סופית ---

document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }

    // מיגרציה: פתקים ישנים עם textColor ברירת מחדל — איפוס ל-null
    (function migrateTextColors() {
        const defaultColors = ['#2d3748','#e2e8f0','#1a202c','#333333','#000000','#333'];
        let notes = getNotes();
        let changed = false;
        notes.forEach(n => {
            if (n.textColor && defaultColors.includes(n.textColor.toLowerCase())) {
                n.textColor = null;
                changed = true;
            }
        });
        if (changed) localStorage.setItem('notes', JSON.stringify(notes));
    })();

    // אנימציית כניסה רק בטעינה הראשונה, לא בכל רענון של הרשימה
    document.body.classList.add('is-booting');
    setTimeout(() => document.body.classList.remove('is-booting'), 900);
    syncColorRadios();

    createSettingsFloatingButton();
    updateTopIcons();
    loadFolders();
    showMainContent();
    setupDatetimePlaceholders();
    updateNotifBtn();

    if (!localStorage.getItem('hasSeenGuide_final_v1')) {
        showGuideModal();
    }

    setupEventListeners();
    if (window._dueDateInterval) clearInterval(window._dueDateInterval);
    window._dueDateInterval = setInterval(() => { checkDueTimes(); autoBackupIfTime(); }, 5000);
});