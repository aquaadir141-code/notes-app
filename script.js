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

// --- 1b2. עיצוב טקסט בפתק: שומרים רק תגיות עיצוב בטוחות ---

const RICH_KEEP_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'FONT', 'SPAN', 'BR', 'DIV', 'P']);
const RICH_DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'LINK', 'META']);
const RICH_STYLE_PROPS = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size'];

function sanitizeRichHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const clean = (parent) => {
        [...parent.childNodes].forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }
            if (RICH_DROP_TAGS.has(node.tagName)) { node.remove(); return; }
            clean(node);
            if (!RICH_KEEP_TAGS.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
            const size = node.tagName === 'FONT' ? node.getAttribute('size') : null;
            const style = node.tagName === 'SPAN' ? node.style : null;
            const keptStyle = style ? RICH_STYLE_PROPS
                .map(p => [p, style.getPropertyValue(p)])
                .filter(([, v]) => v && /^[\w\s.%-]+$/.test(v))
                .map(([p, v]) => `${p}: ${v}`).join('; ') : '';
            [...node.attributes].forEach(a => node.removeAttribute(a.name));
            if (size && /^[1-7]$/.test(size)) node.setAttribute('size', size);
            if (keptStyle) node.setAttribute('style', keptStyle);
            if (node.tagName === 'SPAN' && !keptStyle) node.replaceWith(...node.childNodes);
        });
    };
    clean(tpl.content);
    return tpl.innerHTML;
}

// true אם יש בתוכן עיצוב שצריך לשמור (ולא רק טקסט ושורות)
function hasRichFormatting(html) {
    return /<(b|strong|i|em|u|font|span)[\s>]/i.test(html || '');
}

// שומר את תוכן הפתק מתוך האלמנט: טקסט נקי (לחיפוש ולהתראות) + HTML מעוצב אם יש עיצוב
function readNoteContent(note, contentEl) {
    note.text = contentEl.innerText;
    const html = sanitizeRichHTML(contentEl.innerHTML);
    if (hasRichFormatting(html)) note.html = html; else delete note.html;
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
    if (value) input.value = value;
    // No hard maxlength: it cut pasted or long names silently. A live counter shows the limit instead.
    if (maxLength) {
        const hint = document.createElement('div');
        hint.className = 'field-hint';
        hint.setAttribute('aria-live', 'polite');
        d.body.appendChild(hint);
        const update = () => {
            const len = input.value.trim().length;
            const over = len > maxLength;
            hint.textContent = over ? `ארוך מדי: ${len}/${maxLength} תווים` : `${len}/${maxLength}`;
            hint.classList.toggle('is-error', over);
            input.setAttribute('aria-invalid', over ? 'true' : 'false');
        };
        input.addEventListener('input', update);
        update();
    }
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
// גודל מינימלי לכרטיס בלוח — מתחת לזה שורת הכפתורים לא נכנסת
const BOARD_MIN_W = 200, BOARD_MIN_H = 180;
let notePositions = tryParseJSON('notePositions', {});
let isLoading = false;
let folderColors = tryParseJSON('folderColors', {});

const validColors = ['pink', 'yellow', 'purple', 'green', 'orange', 'cyan', 'red'];
const fixedFolders = ['תיקייה כללית', 'משימות שהושלמו', 'אשפה'];

// בתיקיות האלה לא כותבים פתקים חדשים: פתק חדש שנוצר שם הולך לתיקייה הכללית
function canComposeIn(folder) {
    return folder !== 'משימות שהושלמו' && folder !== 'אשפה';
}
function composeTargetFolder() {
    return canComposeIn(selectedFolder) ? selectedFolder : 'תיקייה כללית';
}

// הצבע שפתק מקבל כשהוא עובר לתיקייה: הפתק שומר על הצבע שלו (צבע התיקייה מוצג כפס בצד), רק באשפה הוא אפור
function colorForFolder(note, target) {
    if (target === 'אשפה') return folderColors['אשפה'] || '#bdc3c7';
    return note.customColor || (note.color !== (folderColors['אשפה'] || '#bdc3c7') ? note.color : null) || 'green';
}

// --- סינון, מיון והתקדמות ---
const FILTERS = ['all', 'today', 'overdue', 'reminders'];
const SORTS = ['newest', 'oldest', 'due', 'color', 'alpha'];
let activeFilter = FILTERS.includes(localStorage.getItem('noteFilter')) ? localStorage.getItem('noteFilter') : 'all';
let activeSort = SORTS.includes(localStorage.getItem('noteSort')) ? localStorage.getItem('noteSort') : 'newest';

function isOpenTask(n) {
    return !n.completed && n.folder !== 'אשפה' && n.folder !== 'משימות שהושלמו';
}
function dueMsOf(n) {
    const t = n && n.dueTime ? new Date(n.dueTime).getTime() : NaN;
    return isNaN(t) ? null : t;
}
function noteMatchesFilter(n) {
    if (activeFilter === 'all') return true;
    if (!isOpenTask(n)) return false;
    const due = dueMsOf(n);
    if (due === null) return false;
    if (activeFilter === 'reminders') return true;
    if (activeFilter === 'overdue') return due < Date.now();
    // היום: מה שמתוכנן להיום ומה שכבר באיחור
    return startOfDay(due) <= startOfDay(new Date());
}
function compareNotes(a, b) {
    const pin = Number(b.pinned || 0) - Number(a.pinned || 0);
    if (pin) return pin;
    const created = n => { const t = new Date(n.created).getTime(); return isNaN(t) ? 0 : t; };
    switch (activeSort) {
        case 'oldest': return created(a) - created(b);
        case 'due': {
            const da = dueMsOf(a), db = dueMsOf(b);
            if (da === null && db === null) return created(b) - created(a);
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        }
        case 'color': {
            const idx = n => { const i = validColors.indexOf(n.color); return i === -1 ? validColors.length : i; };
            return idx(a) - idx(b) || created(b) - created(a);
        }
        case 'alpha': return String(a.text || '').localeCompare(String(b.text || ''), 'he');
        default: return created(b) - created(a);
    }
}
function startOfWeek(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - x.getDay()); // השבוע מתחיל ביום ראשון
    return x.getTime();
}
function syncViewControls() {
    document.querySelectorAll('.filter-chips [data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === activeFilter ? 'true' : 'false'));
    const sel = document.getElementById('sortSelect');
    if (sel) sel.value = activeSort;
}

// --- חזרה של תזכורת ---
const REPEAT_LABELS = { daily: 'כל יום', weekly: 'כל שבוע', monthly: 'כל חודש' };
function nextOccurrence(value, repeat, after = Date.now()) {
    const d = new Date(value);
    if (isNaN(d) || !REPEAT_LABELS[repeat]) return null;
    for (let i = 0; i < 5000 && d.getTime() <= after; i++) {
        if (repeat === 'daily') d.setDate(d.getDate() + 1);
        else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
        else d.setMonth(d.getMonth() + 1);
    }
    return d;
}

// התיקייה שפתק חוזר אליה כשמבטלים "הושלם": התיקייה שהיה בה, אם היא עוד קיימת
function restoreFolderFor(note) {
    const prev = note.prevFolder;
    if (prev && canComposeIn(prev) && (prev === 'תיקייה כללית' || getFolders().includes(prev))) return prev;
    return 'תיקייה כללית';
}

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
    restore: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
    checklist: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 8 8 4"></polyline><polyline points="3 14 5 16 8 12"></polyline><line x1="12" y1="6" x2="21" y2="6"></line><line x1="12" y1="14" x2="21" y2="14"></line><line x1="12" y1="20" x2="21" y2="20"></line></svg>`,
    more: `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>`,
    repeat: `<svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
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
function getFolders() {
    const folders = tryParseJSON('folders', []);
    return Array.isArray(folders) ? folders.filter(f => typeof f === 'string') : [];
}

// שם תיקייה מתוך ערך שמור: מחרוזת, או אובייקט מגיבוי בפורמט אחר ({ name: ... })
function folderNameOf(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
        for (const key of ['name', 'title', 'label', 'folder']) {
            if (typeof value[key] === 'string') return value[key].trim();
        }
    }
    return '';
}

// מתקן נתונים פגומים (למשל תיקיות "[object Object]" אחרי שחזור גיבוי) בלי לאבד פתקים
function repairStoredData() {
    const rawFolders = tryParseJSON('folders', []);
    const folders = [];
    (Array.isArray(rawFolders) ? rawFolders : []).forEach(f => {
        const name = folderNameOf(f);
        if (name && !fixedFolders.includes(name) && !folders.includes(name)) folders.push(name);
    });

    const notes = tryParseJSON('notes', []);
    let notesChanged = false;
    if (Array.isArray(notes)) {
        notes.forEach(n => {
            if (!n || typeof n !== 'object') return;
            const name = folderNameOf(n.folder) || 'תיקייה כללית';
            if (name !== n.folder) { n.folder = name; notesChanged = true; }
            // פתק ששייך לתיקייה שלא קיימת ברשימה היה נעלם מהתצוגה
            if (!fixedFolders.includes(name) && !folders.includes(name)) folders.push(name);
        });
    }

    const colorsChanged = Object.keys(folderColors).some(k => k === '[object Object]');
    delete folderColors['[object Object]'];

    if (JSON.stringify(folders) !== JSON.stringify(rawFolders)) localStorage.setItem('folders', JSON.stringify(folders));
    if (notesChanged) localStorage.setItem('notes', JSON.stringify(notes));
    if (colorsChanged) localStorage.setItem('folderColors', JSON.stringify(folderColors));
}
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
    updateScopeLabels();
    loadNotesWithoutFolderView();
}

// טקסט עזר בשדה החיפוש ובתיבת הכתיבה לפי התיקייה הפתוחה
function updateScopeLabels() {
    const inFolder = isFolderViewActive && !isBoardViewActive && selectedFolder !== 'תיקייה כללית';
    const search = document.getElementById('search-input');
    if (search) search.placeholder = inFolder ? `חיפוש ב"${selectedFolder}"` : 'חיפוש בכל הפתקים';
    const text = document.getElementById('note-text');
    if (text) text.placeholder = inFolder ? `מה צריך לעשות? (יישמר ב"${selectedFolder}")` : 'מה צריך לעשות?';
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

// תפריט התיקיות לא קבוע: הוא נפתח במעבר עכבר או בלחיצה על כפתור התפריט ונסגר כשיוצאים ממנו, בכל גודל מסך
function isSidebarPinned() {
    return false;
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
        const deleteBtnHTML = isFixed ? '' : `<button class="delete-folder-btn rename-folder-btn" aria-label="שנה שם לתיקייה ${safe}" title="שינוי שם">${ICONS.edit}</button><button class="delete-folder-btn" data-action="delete" aria-label="מחק את התיקייה ${safe}" title="מחק תיקייה">${ICONS.x}</button>`;
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
            const delBtn = div.querySelector('.delete-folder-btn[data-action="delete"]');
            if(delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folder); };
            const renameBtn = div.querySelector('.rename-folder-btn');
            if(renameBtn) renameBtn.onclick = (e) => { e.stopPropagation(); renameFolder(folder); };
            div.querySelector('.folder-name').addEventListener('dblclick', (e) => { e.stopPropagation(); renameFolder(folder); });
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
        // אחרי בנייה מחדש (למשל שינוי צבע) התיקייה הפתוחה נשארת פתוחה
        if (isFolderViewActive && !isBoardViewActive && selectedFolder === folder) div.classList.add('active');
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
    // הפתקים שומרים על הצבע שלהם; צבע התיקייה מוצג כפס בצד הפתק
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
        // הכותרת נשארת גלויה: בלעדיה שורת החיפוש עולה מתחת לסרגל הכלים הצף
        setPageHeaderVisible(true);
        const sec = document.getElementById('createNoteSection');
        if(sec) sec.style.display = canComposeIn(folder) ? 'block' : 'none';
        updateScopeLabels();
        const back = document.getElementById('backBtn');
        if(back) back.style.display = 'inline-flex';
        loadNotesWithoutFolderView();
        document.querySelectorAll('.folder-container').forEach(c => c.classList.remove('active'));
        const container = [...document.querySelectorAll('.folder-container')].find(c => c.getAttribute('data-folder') === folder);
        if (container) container.classList.add('active');
        window.scrollTo({ top: 0 });
    }
}

function renameFolder(oldName) {
    showPrompt({
        title: 'שינוי שם לתיקייה',
        label: 'שם חדש (עד 15 תווים)',
        maxLength: 15,
        value: oldName,
        confirmText: 'שמירה'
    }, (raw) => {
        const name = (raw || '').trim();
        if (!name) { showToast('נא לכתוב שם לתיקייה'); return false; }
        if (name.length > 15) { showToast('שם התיקייה ארוך מדי (מקסימום 15 תווים)'); return false; }
        if (name === oldName) return;
        const folders = getFolders();
        if (folders.includes(name) || fixedFolders.includes(name)) { showToast('תיקייה בשם זה כבר קיימת'); return false; }
        const i = folders.indexOf(oldName);
        if (i === -1) return;
        folders[i] = name;
        localStorage.setItem('folders', JSON.stringify(folders));
        const notes = getNotes();
        notes.forEach(n => {
            if (n.folder === oldName) n.folder = name;
            if (n.prevFolder === oldName) n.prevFolder = name;
        });
        localStorage.setItem('notes', JSON.stringify(notes));
        if (folderColors[oldName]) {
            folderColors[name] = folderColors[oldName];
            delete folderColors[oldName];
            localStorage.setItem('folderColors', JSON.stringify(folderColors));
        }
        if (selectedFolder === oldName) selectedFolder = name;
        loadFolders();
        if (isFolderViewActive && selectedFolder === name) selectFolder(name);
        else loadNotesWithoutFolderView();
        showToast(`השם שונה ל"${name}"`);
    });
}

function deleteFolder(folder) {
    showConfirm(`הפתקים שבה יועברו לתיקייה הכללית.`, () => {
        const prevFolders = getFolders();
        const prevColor = folderColors[folder];
        const movedIds = [];
        let folders = prevFolders.filter(f => f !== folder);
        localStorage.setItem('folders', JSON.stringify(folders));
        let notes = getNotes();
        notes.forEach(n => { if (n.folder === folder) { n.folder = 'תיקייה כללית'; movedIds.push(n.id); } });
        localStorage.setItem('notes', JSON.stringify(notes));
        showMainContent();
        loadFolders();
        showToast(`התיקייה "${folder}" נמחקה`, 6000, {
            label: 'ביטול',
            onClick: () => {
                const current = getFolders();
                if (current.includes(folder)) return;
                const at = Math.min(prevFolders.indexOf(folder), current.length);
                current.splice(at < 0 ? current.length : at, 0, folder);
                localStorage.setItem('folders', JSON.stringify(current));
                if (prevColor) { folderColors[folder] = prevColor; localStorage.setItem('folderColors', JSON.stringify(folderColors)); }
                const all = getNotes();
                all.forEach(n => { if (movedIds.includes(n.id) && n.folder === 'תיקייה כללית') n.folder = folder; });
                localStorage.setItem('notes', JSON.stringify(all));
                loadFolders();
                loadNotesWithoutFolderView();
                showToast(`התיקייה "${folder}" שוחזרה`);
            }
        });
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
        folder: composeTargetFolder(),
        color: selectedColor,
        customColor: selectedColor,
        textColor: null,  // null = צבע ברירת מחדל לפי CSS (לא נעקב אחריו)
        created: new Date().toISOString(),
        completed: false,
        notified: false,
        pinned: false,
        left: 50, top: 50, width: 250, height: 250
    };
    const notes = getNotes();
    if (isBoardViewActive) {
        // בלוח: הפתק החדש נכנס למשבצת פנויה בחלק של הלוח שרואים עכשיו, בלי לעלות על פתק אחר
        const noteW = 250, noteH = 250;
        const placed = notes.filter(n => n.folder === note.folder).map(n => notePositions[n.id]).filter(Boolean)
            .map(p => ({ left: p.left, top: p.top, width: Math.max(p.width || 250, BOARD_MIN_W), height: Math.max(p.height || 250, BOARD_MIN_H) }));
        const { pos } = findFreeBoardSlot(placed, noteW, noteH, boardVisibleArea());
        const cx = pos.left, cy = pos.top;
        note.left = cx; note.top = cy;
        notePositions[note.id] = { left: cx, top: cy, width: noteW, height: noteH };
        localStorage.setItem('notePositions', JSON.stringify(notePositions));
    }
    // ברשימה לא שומרים מיקום: בלוח הפתק יקבל מקום פנוי משלו
    notes.unshift(note);
    localStorage.setItem('notes', JSON.stringify(notes));
    clearForm();
    if (fromModal) {
        closeNewNoteModal();
    }
    _justAddedNoteId = note.id;
    loadNotesWithoutFolderView();
    _justAddedNoteId = null;
    if (isBoardViewActive) {
        // אם המשבצת הפנויה מחוץ למסך, גוללים אליה כדי שיראו את הפתק החדש
        const el = document.querySelector(`.board-note[data-id="${CSS.escape(note.id)}"]`);
        if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
}

function loadNotesWithoutFolderView() {
    let notes = getNotes();
    const isDarkMode = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.notes-container').forEach(c => c.innerHTML = '');
    const board = document.getElementById('boardContainer');
    if (board) board.innerHTML = '';

    // נעוצים קודם, ואחר כך לפי המיון שנבחר; פתקים שלא מתאימים לסינון לא מוצגים
    notes.sort(compareNotes);
    // הסינון שייך לתצוגת הרשימה (בלוח אין כפתורי סינון)
    if (!isBoardViewActive) notes = notes.filter(noteMatchesFilter);

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
    const boardPositions = isBoardViewActive
        ? computeBoardPositions(notes.filter(n => !(isFolderViewActive && selectedFolder && n.folder !== selectedFolder)))
        : null;
    notes.forEach(note => {
        if (isFolderViewActive && selectedFolder && note.folder !== selectedFolder) return;
        const el = createNoteElement(note, isDarkMode);
        if (note.id === _justAddedNoteId) el.classList.add('just-added');
        if (isBoardViewActive) {
            el.classList.add('board-note');
            let pos = boardPositions.get(note.id);
            el.style.left = pos.left + 'px';
            el.style.top = pos.top + 'px';
            el.style.width = Math.max(BOARD_MIN_W, pos.width) + 'px';
            el.style.height = Math.max(BOARD_MIN_H, pos.height) + 'px';
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

// מיקומי הפתקים בלוח. פתק בלי מיקום שמור, או שיושב בדיוק על פתק אחר (למשל כל הפתקים
// שנוצרו ברשימה ונשמרו פעם ב-50,50), מקבל משבצת פנויה ברשת, והמיקום נשמר.
const BOARD_CELL_W = 270, BOARD_CELL_H = 270, BOARD_PAD = 24;
// החלק של הלוח שרואים עכשיו, בקואורדינטות של הלוח (הלוח רחב מהמסך, ותפריט הצד עלול לכסות את צד ימין)
function boardVisibleArea() {
    const board = document.getElementById('boardContainer');
    if (!board) return { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    const r = board.getBoundingClientRect();
    const sidebar = document.getElementById('foldersSidebar');
    const sideLeft = sidebar ? sidebar.getBoundingClientRect().left : window.innerWidth;
    const visibleRight = Math.min(r.right, window.innerWidth, sideLeft > 0 ? sideLeft : window.innerWidth);
    const visibleLeft = Math.max(r.left, 0);
    return {
        left: visibleLeft - r.left,
        right: Math.max(visibleLeft - r.left + BOARD_CELL_W + BOARD_PAD, visibleRight - r.left),
        top: Math.max(0, -r.top),
        bottom: Math.max(0, -r.top) + window.innerHeight
    };
}

const boardRectsOverlap = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// המשבצת הפנויה הראשונה ברשת, מימין לשמאל ומלמעלה למטה, החל מראש האזור הנתון
function findFreeBoardSlot(placed, w, h, area, fromSlot = 0) {
    const cols = Math.max(1, Math.floor((area.right - area.left - BOARD_PAD) / BOARD_CELL_W));
    for (let slot = fromSlot; slot < 5000; slot++) {
        const col = slot % cols, row = Math.floor(slot / cols);
        const c = {
            left: Math.max(0, area.right - BOARD_PAD - 250 - col * BOARD_CELL_W),
            top: area.top + BOARD_PAD + row * BOARD_CELL_H,
            width: w, height: h
        };
        if (!placed.some(r => boardRectsOverlap(c, r))) return { pos: c, slot };
    }
    return { pos: { left: area.left + BOARD_PAD, top: area.top + BOARD_PAD, width: w, height: h }, slot: 0 };
}

function computeBoardPositions(notes) {
    const result = new Map();
    const placed = [];
    const needPlace = [];
    notes.forEach(n => {
        const saved = notePositions[n.id];
        if (saved && !placed.some(r => r.left === saved.left && r.top === saved.top)) {
            placed.push(saved);
            result.set(n.id, saved);
        } else {
            needPlace.push(n);
        }
    });
    if (!needPlace.length) return result;
    const area = { ...boardVisibleArea(), top: 0 };
    let slot = 0;
    needPlace.forEach(n => {
        const saved = notePositions[n.id];
        const w = (saved && saved.width) || 250, h = (saved && saved.height) || 250;
        const found = findFreeBoardSlot(placed, w, h, area, slot);
        slot = found.slot;
        placed.push(found.pos);
        result.set(n.id, found.pos);
        notePositions[n.id] = found.pos;
    });
    localStorage.setItem('notePositions', JSON.stringify(notePositions));
    return result;
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
        const cfg = EMPTY_STATES[folder] || { icon: 'folder', title: 'התיקייה ריקה', text: 'כתוב פתק בתיבה למעלה, או העבר לכאן פתק דרך כפתור התיקייה שבו.' };
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
    const weekStart = startOfWeek();
    const doneThisWeek = getNotes().filter(n => n.completed && n.folder !== 'אשפה' && n.completedAt && new Date(n.completedAt).getTime() >= weekStart).length;
    if (doneThisWeek) text += ` · ${doneThisWeek === 1 ? 'משימה אחת הושלמה' : doneThisWeek + ' הושלמו'} השבוע`;
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
    // ניסוח ידני: Intl בעברית מחזיר צורות כמו "לפני דקה (1)"
    const past = sec < 0;
    const wrap = (t) => past ? 'לפני ' + t : 'בעוד ' + t;
    if (abs < 3600) {
        const m = Math.max(1, Math.round(abs / 60));
        return wrap(m === 1 ? 'דקה' : m === 2 ? 'שתי דקות' : m + ' דקות');
    }
    if (abs < 86400) {
        const h = Math.round(abs / 3600);
        return wrap(h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות');
    }
    const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
    if (days === -1) return 'אתמול';
    if (days === 1) return 'מחר';
    if (Math.abs(days) < 7) return wrap(Math.abs(days) === 2 ? 'יומיים' : Math.abs(days) + ' ימים');
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
    // "הושלם" תואם לתיקייה: מעבר אל משימות שהושלמו מסמן, מעבר לתיקייה רגילה מבטל
    if (target === 'משימות שהושלמו' && !note.completed) {
        if (canComposeIn(note.folder)) note.prevFolder = note.folder;
        note.completed = true;
        note.completedAt = new Date().toISOString();
    } else if (canComposeIn(target)) {
        note.completed = false;
        delete note.prevFolder;
        delete note.completedAt;
    }
    note.folder = target;
    note.color = colorForFolder(note, target);
    updateNoteInStorage(note);
    loadNotesWithoutFolderView();
    showToast(`הועבר אל "${target}"`);
}

// תתי-משימות בתוך פתק: רשימת ✓ שנשמרת ב-note.checklist
function setupChecklist(div, note) {
    const list = div.querySelector('.note-checklist');
    const chip = div.querySelector('.meta-chip.is-progress');
    const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const items = () => (Array.isArray(note.checklist) ? note.checklist : (note.checklist = []));

    const save = () => {
        if (!items().length) delete note.checklist;
        updateNoteInStorage(note);
        updateProgress();
    };
    const updateProgress = () => {
        const all = Array.isArray(note.checklist) ? note.checklist : [];
        list.hidden = !all.length;
        if (!all.length) { chip.hidden = true; return; }
        const done = all.filter(i => i.done).length;
        chip.hidden = false;
        chip.textContent = `${done}/${all.length} תתי-משימות`;
        chip.classList.toggle('is-complete', done === all.length);
    };
    const focusItem = (id, atEnd = true) => {
        const input = list.querySelector(`li[data-id="${CSS.escape(id)}"] .check-text`);
        if (!input) return;
        input.focus();
        if (atEnd) { const l = input.value.length; input.setSelectionRange(l, l); }
    };
    const addItem = (afterId) => {
        const arr = items();
        const item = { id: newId(), text: '', done: false };
        const i = afterId ? arr.findIndex(x => x.id === afterId) : -1;
        if (i === -1) arr.push(item); else arr.splice(i + 1, 0, item);
        render();
        save();
        focusItem(item.id);
    };
    const removeItem = (id, focusPrev) => {
        const arr = items();
        const i = arr.findIndex(x => x.id === id);
        if (i === -1) return;
        arr.splice(i, 1);
        render();
        save();
        if (focusPrev && arr[i - 1]) focusItem(arr[i - 1].id);
    };
    function render() {
        list.innerHTML = '';
        items().forEach(item => {
            const li = document.createElement('li');
            li.className = 'check-item' + (item.done ? ' done' : '');
            li.dataset.id = item.id;
            li.innerHTML = `<input type="checkbox" class="check-box" aria-label="סמן תת-משימה כבוצעה"><input type="text" class="check-text" maxlength="200" placeholder="תת-משימה" aria-label="תת-משימה"><button type="button" class="check-remove" title="מחק" aria-label="מחק תת-משימה">${ICONS.x}</button>`;
            const box = li.querySelector('.check-box');
            const text = li.querySelector('.check-text');
            box.checked = !!item.done;
            text.value = item.text || '';
            box.onchange = () => { item.done = box.checked; li.classList.toggle('done', item.done); save(); };
            text.oninput = () => { item.text = text.value; updateNoteInStorage(note); };
            text.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addItem(item.id); }
                else if (e.key === 'Backspace' && !text.value) { e.preventDefault(); removeItem(item.id, true); }
                else if (e.key === 'Escape') { text.blur(); }
            };
            text.onblur = () => { setTimeout(() => { if (!item.text.trim() && document.activeElement !== text && items().includes(item)) removeItem(item.id); }, 150); };
            li.querySelector('.check-remove').onclick = (e) => { e.stopPropagation(); removeItem(item.id); };
            list.appendChild(li);
        });
        updateProgress();
    }
    div._addChecklistItem = () => addItem();
    render();
}

function createNoteElement(note, isDarkMode) {
    const div = document.createElement('article');
    div.className = `note ${validColors.includes(note.color) ? note.color : ''}`;
    if (note.pinned) div.classList.add('pinned');
    div.setAttribute('data-id', note.id);
    if (!validColors.includes(note.color) && note.color) div.style.setProperty('--tint', note.color);
    if (note.completed) div.classList.add('completed');
    if (note.notified) div.classList.add('notified');
    if (folderColors[note.folder] && note.folder !== 'אשפה') {
        div.classList.add('has-folder-color');
        div.style.setProperty('--folder-stripe', folderColors[note.folder]);
    }

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
            <button class="more-btn" aria-expanded="false" title="פעולות" aria-label="הצג פעולות לפתק">${ICONS.more}</button>
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
                ${inTrash ? `<button class="restore-btn" title="שחזר מהאשפה" aria-label="שחזר מהאשפה">${ICONS.restore}</button>` : ''}
                <button class="delete-btn" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>
            </div>
        </div>
        <div class="note-toolbar" role="toolbar" aria-label="עיצוב טקסט">
            <button data-cmd="bold" title="מודגש" aria-label="מודגש">${ICONS.bold}</button>
            <button data-cmd="italic" title="נטוי" aria-label="נטוי">${ICONS.italic}</button>
            <button data-cmd="underline" title="קו תחתון" aria-label="קו תחתון">${ICONS.underline}</button>
            <button data-cmd="checklist" title="הוסף תת-משימה" aria-label="הוסף תת-משימה">${ICONS.checklist}</button>
            <span class="toolbar-sep" aria-hidden="true"></span>
            <button data-cmd="increaseFontSize" title="הגדל טקסט" aria-label="הגדל טקסט">${ICONS.zoomIn}</button>
            <button data-cmd="decreaseFontSize" title="הקטן טקסט" aria-label="הקטן טקסט">${ICONS.zoomOut}</button>
            <div class="note-text-color-picker" title="צבע טקסט">
                <span class="note-text-color-preview" aria-hidden="true">${ICONS.palette}</span>
                <input type="color" class="note-text-color-input" aria-label="צבע טקסט">
            </div>
        </div>
        <div class="note-content" contenteditable="false"></div>
        <ul class="note-checklist" aria-label="תתי-משימות"></ul>
        <div class="note-meta">
            ${dueTimeDisplay ? `<span class="meta-chip ${isOverdue ? 'is-overdue' : 'is-due'}" title="${isOverdue ? 'באיחור' : 'זמן ביצוע'}">${ICONS.alarm}${isOverdue ? 'באיחור · ' : ''}${escapeHTML(dueTimeDisplay)}${REPEAT_LABELS[note.repeat] ? ` · ${REPEAT_LABELS[note.repeat]}` : ''}</span>` : ''}
            ${note.snoozeUntil ? `<span class="meta-chip is-due" title="נודניק">${ICONS.clock}נודניק · ${escapeHTML(formatDue(note.snoozeUntil))}</span>` : ''}
            <span class="meta-chip is-progress" hidden></span>
            <span class="meta-chip is-plain" title="נוצר ${escapeHTML(createdFull)}">${escapeHTML(formatRelative(note.created))}</span>
        </div>
        ${isBoardViewActive ? `<div class="resize-handle-bottom-right" aria-hidden="true"></div>` : ''}
    `;

    const content = div.querySelector('.note-content');
    if (note.textColor) content.style.color = note.textColor;
    setupChecklist(div, note);

    // נייד: הפעולות מוסתרות עד שנוגעים בפתק, כדי שכל כרטיס יתפוס פחות מקום
    const moreBtn = div.querySelector('.more-btn');
    const toggleActions = (open) => {
        document.querySelectorAll('.note.show-actions').forEach(n => {
            if (n === div) return;
            n.classList.remove('show-actions');
            const b = n.querySelector('.more-btn'); if (b) b.setAttribute('aria-expanded', 'false');
        });
        div.classList.toggle('show-actions', open);
        moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    moreBtn.onclick = (e) => { e.stopPropagation(); toggleActions(!div.classList.contains('show-actions')); };
    div.addEventListener('click', (e) => {
        if (!window.matchMedia('(max-width: 600px)').matches) return;
        if (e.target.closest('button, input, a, .menu, [contenteditable="true"], .note-checklist')) return;
        toggleActions(!div.classList.contains('show-actions'));
    });
    const colorPreview = div.querySelector('.note-text-color-preview');
    if (note.textColor) colorPreview.style.color = note.textColor;

    const restoreBtn = div.querySelector('.restore-btn');
    if (restoreBtn) restoreBtn.onclick = () => restoreFromTrash(note.id);
    div.querySelector('.delete-btn').onclick = () => {
        // אשפה → מחיקה צמיתה | משימות שהושלמו → אשפה | כל השאר → אשפה
        deleteNote(note.id, note.folder === 'אשפה');
    };
    const completeBtn = div.querySelector('.complete-btn');
    completeBtn.onclick = () => {
        const before = { completed: note.completed, folder: note.folder, color: note.color, prevFolder: note.prevFolder, completedAt: note.completedAt };
        const undo = {
            label: 'ביטול',
            onClick: () => {
                const all = getNotes();
                const n = all.find(x => x.id === note.id);
                if (!n) return;
                Object.assign(n, before);
                if (before.prevFolder === undefined) delete n.prevFolder;
                if (before.completedAt === undefined) delete n.completedAt;
                localStorage.setItem('notes', JSON.stringify(all));
                loadNotesWithoutFolderView();
            }
        };
        if (note.completed) {
            const target = restoreFolderFor(note);
            note.completed = false;
            note.folder = target;
            note.color = colorForFolder(note, target);
            delete note.prevFolder;
            delete note.completedAt;
            completeBtn.setAttribute('aria-pressed', 'false');
            completeBtn.setAttribute('aria-label', 'סמן כהושלם');
            completeBtn.title = 'סמן כהושלם';
            completeBtn.classList.remove('active');
            showToast(`הוחזר אל "${target}"`, 5000, undo);
        } else {
            // זוכרים מאיזו תיקייה הפתק הגיע, כדי להחזיר אותו לשם אם מבטלים
            if (canComposeIn(note.folder)) note.prevFolder = note.folder;
            note.completed = true;
            note.completedAt = new Date().toISOString();
            note.folder = 'משימות שהושלמו';
            completeBtn.setAttribute('aria-pressed', 'true');
            completeBtn.setAttribute('aria-label', 'בטל סימון הושלם');
            completeBtn.title = 'לחץ לביטול הסימון';
            completeBtn.classList.add('active');
            showToast('הועבר למשימות שהושלמו ✓', 5000, undo);
        }
        updateNoteInStorage(note);
        // רגע קצר כדי לראות את הסימון לפני שהפתק עובר תיקייה
        setTimeout(loadNotesWithoutFolderView, 180);
    };
    div.querySelector('.pin-btn').onclick = () => togglePin(note.id);
    div.querySelector('.extend-btn').onclick = () => {
        openDateModal(note.dueTime, (newTime, repeat) => {
            if (newTime) {
                note.dueTime = newTime;
                note.notified = false;
                delete note.snoozeUntil;
                if (REPEAT_LABELS[repeat]) note.repeat = repeat; else delete note.repeat;
                // תזכורת חדשה לפתק שהושלם: הוא חוזר להיות משימה פתוחה, בתיקייה שהיה בה
                if (note.completed || note.folder === 'משימות שהושלמו') {
                    note.completed = false;
                    if (note.folder === 'משימות שהושלמו') {
                        note.folder = restoreFolderFor(note);
                        note.color = colorForFolder(note, note.folder);
                    }
                    delete note.prevFolder;
                }
                updateNoteInStorage(note);
                loadNotesWithoutFolderView();
                showToast('התזכורת נשמרה · ' + formatDue(newTime) + (note.repeat ? ' · ' + REPEAT_LABELS[note.repeat] : ''));
            } else if (note.dueTime) {
                note.dueTime = '';
                note.notified = false;
                delete note.repeat;
                delete note.snoozeUntil;
                updateNoteInStorage(note);
                loadNotesWithoutFolderView();
                showToast('התזכורת הוסרה');
            }
        }, note.repeat);
    };

    const editBtn = div.querySelector('.edit-btn');
    const toolbar = div.querySelector('.note-toolbar');
    // טקסט מעוצב נשמר כ-HTML מסונן; פתק בלי עיצוב מוצג כטקסט רגיל (בטוח מ-XSS)
    if (note.html) content.innerHTML = sanitizeRichHTML(note.html);
    else content.textContent = note.text;

    editBtn.onclick = () => {
        const isEditing = toolbar.style.display === 'flex';
        if (isEditing) {
            toolbar.style.display = 'none'; content.contentEditable = 'false'; readNoteContent(note, content); updateNoteInStorage(note);
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
            if (cmd === 'checklist') { div._addChecklistItem(); return; }
            if (cmd === 'increaseFontSize') document.execCommand('fontSize', false, '4');
            else if (cmd === 'decreaseFontSize') document.execCommand('fontSize', false, '2');
            else document.execCommand(cmd, false, null);
            readNoteContent(note, content);
            updateNoteInStorage(note);
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

    content.addEventListener('input', function() { readNoteContent(note, this); updateNoteInStorage(note); });
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
            <li><span class="inline-icon">${ICONS.checklist}</span><span><strong>תתי-משימות:</strong> בעריכת פתק, כפתור הרשימה מוסיף צעדים לסימון.</span></li>
            <li><span class="inline-icon">${ICONS.list}</span><span><strong>סינון ומיון:</strong> "היום" מציג את מה שצריך לעשות היום ומה שבאיחור, מכל התיקיות.</span></li>
            <li><span class="inline-icon">${ICONS.delete}</span><span><strong>אשפה:</strong> פתקים שנמחקים נשמרים באשפה עד שתרוקן אותה.</span></li>
        </ul>
        <div class="guide-shortcuts" aria-label="קיצורי מקלדת">
            <span><kbd>/</kbd> חיפוש</span>
            <span><kbd>N</kbd> פתק חדש</span>
            <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> שמירה</span>
            <span><kbd>Esc</kbd> סגירה</span>
        </div>
        <div class="guide-footer">
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
    // ההדרכה מוצגת פעם אחת. אפשר לחזור אליה בכל זמן דרך כפתור המידע
    localStorage.setItem('hasSeenGuide_final_v1', 'true');
    document.getElementById('guideModal').style.display = 'none';
    if (_guideCloseFocus) { _guideCloseFocus(); _guideCloseFocus = null; }
}

function closeGuideModal() { document.getElementById('guideModal').style.display = 'none'; }

function closeGuideModalFromAction() { handleGuideClose(); }

function searchNotes() {
    const s1 = document.getElementById('search-input');
    const s2 = document.getElementById('board-search-input');
    const val1 = s1 ? s1.value : '';
    const val2 = s2 ? s2.value : '';
    const raw = (isBoardViewActive ? (val2 || val1) : (val1 || val2)).trim();
    const term = raw.toLowerCase();
    document.querySelectorAll('.note').forEach(note => {
        const subtasks = [...note.querySelectorAll('.check-text')].map(i => i.value).join(' ');
        const text = ((note.querySelector('.note-content') || note).innerText + ' ' + subtasks).toLowerCase();
        note.style.display = text.includes(term) ? 'flex' : 'none';
    });
    document.querySelectorAll('.no-results').forEach(m => m.remove());
    const filtering = activeFilter !== 'all' && !isBoardViewActive;
    const narrowing = !!term || filtering;
    document.querySelectorAll('.notes-container .empty-state').forEach(e => { e.style.display = narrowing ? 'none' : ''; });

    // במסך הראשי חיפוש וסינון עוברים על כל התיקיות: כל תיקייה שיש בה תוצאה מוצגת עם הכותרת שלה
    const globalSearch = narrowing && !isBoardViewActive && !isFolderViewActive;
    const visible = n => n.style.display !== 'none';
    let anyHit = false;
    document.querySelectorAll('.folder-container').forEach(fc => {
        const hit = globalSearch && [...fc.querySelectorAll('.note')].some(visible);
        if (hit) anyHit = true;
        fc.classList.toggle('search-match', hit);
    });
    document.body.classList.toggle('is-searching', globalSearch);
    if (!narrowing || isBoardViewActive) return;
    if (globalSearch ? anyHit : [...document.querySelectorAll('.folder-container.active .note')].some(visible)) return;

    // אין תוצאות: הודעה אחת בתיקייה שמוצגת
    const active = document.querySelector('.folder-container.active');
    if (!active) return;
    active.classList.add('search-match');
    const target = active.querySelector('.notes-container');
    if (!target) return;
    const msg = document.createElement('p');
    msg.className = 'no-results';
    const filterName = { today: 'להיום', overdue: 'באיחור', reminders: 'עם תזכורת' }[activeFilter];
    const where = globalSearch ? '' : ` בתיקייה "${selectedFolder}"`;
    msg.textContent = term
        ? `לא נמצאו פתקים עבור "${raw}"${filtering ? ` (בסינון "${filterName}")` : ''}${where}`
        : `אין פתקים ${filterName}${where}`;
    target.appendChild(msg);
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
        previous = { folder: note.folder, color: note.color, prevFolder: note.prevFolder };
        if (note.folder !== 'משימות שהושלמו') note.prevFolder = note.folder;
        note.trashedColor = note.color;
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
                    n.prevFolder = previous.prevFolder;
                    delete n.trashedColor;
                    localStorage.setItem('notes', JSON.stringify(all));
                    loadNotesWithoutFolderView();
                }
            }
        });
    }
}

function restoreFromTrash(id) {
    const notes = getNotes();
    const n = notes.find(x => x.id === id);
    if (!n || n.folder !== 'אשפה') return;
    const target = n.completed ? 'משימות שהושלמו' : restoreFolderFor(n);
    n.folder = target;
    n.color = n.customColor || n.trashedColor || 'green';
    delete n.trashedColor;
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotesWithoutFolderView();
    showToast(`הפתק שוחזר ל"${target}"`);
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

// --- גיבוי ---
// גיבוי אוטומטי בלי לחיצות ובלי הודעות קופצות:
// 1. כל יום נשמר עותק בתוך האפליקציה (IndexedDB), ונשמרים 30 הימים האחרונים. ניתן לשחזר מהרשימה.
// 2. באפליקציית האנדרואיד (גרסה עם AndroidAutoBackup) העותק נשמר גם כקובץ בתיקייה Documents/Notes Backups
//    בטלפון, שנשארת גם אם מוחקים את האפליקציה.
// 3. במחשב אפשר לבחור פעם אחת תיקייה, והגיבוי נכתב אליה כל עוד הדפדפן זוכר את האישור.
// גיבוי היום מתעדכן כשהפתקים משתנים, כך שהוא תמיד המצב האחרון של אותו יום.
const AUTO_BACKUP_KEEP_DAYS = 30;
const AUTO_BACKUP_CHECK_MS = 60 * 1000;

function openBackupDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('notesBackupDB', 2);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'date' });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => reject(req.error);
    });
}

function backupDBRequest(store, mode, fn) {
    return openBackupDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        let result;
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    }));
}

async function saveBackupDirHandle(handle) {
    try { await backupDBRequest('handles', 'readwrite', s => s.put({ key: 'backupDir', handle })); } catch (e) {}
}

async function getBackupDirHandle() {
    try {
        const row = await backupDBRequest('handles', 'readonly', s => s.get('backupDir'));
        return row ? row.handle : null;
    } catch (e) { return null; }
}

function buildBackupData() {
    return { notes: getNotes(), folders: getFolders(), folderColors, notePositions };
}
function buildBackupJson() {
    return JSON.stringify(buildBackupData(), null, 2);
}
function buildBackupBlob() {
    return new Blob([buildBackupJson()], { type: 'application/json' });
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

async function writeBlobToDir(dirHandle, filename, json) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([json || buildBackupJson()], { type: 'application/json' }));
    await writable.close();
}

// שמירה ידנית לקובץ (הכפתור "שמור לקובץ")
async function backupNotes() {
    const today = localDateKey();
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
        showToast(`הגיבוי נשמר בתיקיית ההורדות (${filename})`, 4000);
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
        if (e.name !== 'AbortError') {
            fallbackBackupDownload(filename);
            showToast(`הגיבוי נשמר בתיקיית ההורדות (${filename})`, 4000);
        }
    }
}

function localDateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- גיבוי אוטומטי ---
function hasNativeAutoBackup() {
    return !!(window.AndroidAutoBackup && typeof window.AndroidAutoBackup.saveDaily === 'function');
}

async function listAutoBackups() {
    try {
        const rows = await backupDBRequest('snapshots', 'readonly', s => s.getAll());
        return (rows || []).sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) { return []; }
}

async function getAutoBackup(date) {
    try { return await backupDBRequest('snapshots', 'readonly', s => s.get(date)); } catch (e) { return null; }
}

let _lastAutoBackupJson = null;
let _lastAutoBackupCheck = 0;
let _autoBackupRunning = false;

// נקרא בטעינה ובכל דקה. שקט לגמרי: אין הודעות, אין חלונות.
async function runAutoBackup(force) {
    if (_autoBackupRunning) return;
    const nowMs = Date.now();
    if (!force && nowMs - _lastAutoBackupCheck < AUTO_BACKUP_CHECK_MS) return;
    _lastAutoBackupCheck = nowMs;
    _autoBackupRunning = true;
    try {
        const today = localDateKey();
        const json = buildBackupJson();
        const alreadyToday = localStorage.getItem('lastAutoBackup') === today;
        if (alreadyToday && json === _lastAutoBackupJson) return;

        const data = JSON.parse(json);
        // לא דורסים גיבוי טוב בגיבוי ריק (למשל אחרי שהנתונים נמחקו בטעות)
        if (!data.notes.length) {
            const existing = await getAutoBackup(today);
            if (existing && existing.data && existing.data.notes && existing.data.notes.length) { _lastAutoBackupJson = json; return; }
        }

        await backupDBRequest('snapshots', 'readwrite', s => s.put({
            date: today,
            savedAt: new Date().toISOString(),
            noteCount: data.notes.filter(n => n.folder !== 'אשפה').length,
            data
        }));
        await pruneAutoBackups();

        const filename = `notes_backup_${today}.json`;
        if (hasNativeAutoBackup()) {
            try { window.AndroidAutoBackup.saveDaily(filename, json, AUTO_BACKUP_KEEP_DAYS); } catch (e) {}
        }
        const dirHandle = await getBackupDirHandle();
        if (dirHandle) {
            try {
                if (await dirHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                    await writeBlobToDir(dirHandle, filename, json);
                    localStorage.setItem('lastFolderBackup', new Date().toISOString());
                }
            } catch (e) {}
        }

        _lastAutoBackupJson = json;
        localStorage.setItem('lastAutoBackup', today);
        localStorage.setItem('lastAutoBackupAt', new Date().toISOString());
        updateAutoBackupStatus();
    } catch (e) {
        console.warn('auto backup failed', e);
    } finally {
        _autoBackupRunning = false;
    }
}

async function pruneAutoBackups() {
    const rows = await listAutoBackups();
    const old = rows.slice(AUTO_BACKUP_KEEP_DAYS);
    if (!old.length) return;
    await backupDBRequest('snapshots', 'readwrite', s => { old.forEach(r => s.delete(r.date)); return null; });
}

// מבקש מהדפדפן לא למחוק את האחסון של האתר כשהמקום מתמלא
function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist(); }).catch(() => {});
        }
    } catch (e) {}
}

function formatBackupDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = localDateKey();
    const yesterday = localDateKey(new Date(Date.now() - 864e5));
    if (dateKey === today) return 'היום';
    if (dateKey === yesterday) return 'אתמול';
    return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

function formatBackupTime(iso) {
    try { return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

function updateAutoBackupStatus() {
    const el = document.getElementById('auto-backup-status');
    if (!el) return;
    const at = localStorage.getItem('lastAutoBackupAt');
    if (!at) { el.textContent = 'גיבוי אוטומטי פעיל'; return; }
    const d = new Date(at);
    el.textContent = `גיבוי אוטומטי · ${formatBackupDate(localDateKey(d))} ${formatBackupTime(at)}`;
}

// מחזיר את הנתונים לאפליקציה מתוך אובייקט גיבוי (מקובץ או מגיבוי אוטומטי)
function applyBackupData(data) {
    if (!data || !Array.isArray(data.notes)) throw new Error('bad backup');
    localStorage.setItem('notes', JSON.stringify(data.notes));
    if (data.folders) localStorage.setItem('folders', JSON.stringify(data.folders));
    localStorage.setItem('folderColors', JSON.stringify(data.folderColors || {}));
    localStorage.setItem('notePositions', JSON.stringify(data.notePositions || {}));
    folderColors = data.folderColors || {};
    notePositions = data.notePositions || {};
    repairStoredData();
    loadFolders();
    loadNotesWithoutFolderView();
    _lastAutoBackupCheck = 0;
}

async function openAutoBackupsDialog() {
    const rows = await listAutoBackups();
    const d = createDialog({
        id: '_autoBackupsModal',
        title: 'גיבויים אוטומטיים',
        message: hasNativeAutoBackup()
            ? 'כל יום נשמר גיבוי בלי שתצטרך לעשות כלום, גם באפליקציה וגם כקובץ בתיקייה "Documents/Notes Backups" בטלפון. נשמרים 30 הימים האחרונים.'
            : 'כל יום נשמר גיבוי בלי שתצטרך לעשות כלום. נשמרים 30 הימים האחרונים.',
        icon: 'checkCircle',
        wide: true
    });

    const list = document.createElement('ul');
    list.className = 'auto-backup-list';
    if (!rows.length) {
        const li = document.createElement('li');
        li.className = 'auto-backup-empty';
        li.textContent = 'עדיין אין גיבויים. הגיבוי הראשון יישמר בעוד רגע.';
        list.appendChild(li);
    }
    rows.forEach(row => {
        const li = document.createElement('li');
        li.className = 'auto-backup-item';
        const info = document.createElement('div');
        info.className = 'auto-backup-info';
        const title = document.createElement('span');
        title.className = 'auto-backup-date';
        title.textContent = formatBackupDate(row.date);
        const meta = document.createElement('span');
        meta.className = 'auto-backup-meta';
        meta.textContent = `${row.noteCount} פתקים · נשמר ב-${formatBackupTime(row.savedAt)}`;
        info.append(title, meta);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary auto-backup-restore';
        btn.textContent = 'שחזר';
        btn.setAttribute('aria-label', `שחזר את הגיבוי של ${title.textContent}`);
        btn.onclick = () => {
            showConfirm(`הפתקים יחזרו למצב של ${title.textContent} (${row.noteCount} פתקים). המצב הנוכחי נשמר בגיבוי של היום ואפשר לחזור אליו.`, async () => {
                // שומר את המצב הנוכחי לפני השחזור, כדי שאפשר יהיה להתחרט
                if (row.date !== localDateKey()) await runAutoBackup(true);
                try {
                    applyBackupData(row.data);
                    d.close();
                    showToast('הפתקים שוחזרו 🎉');
                } catch (e) {
                    showAlert('לא ניתן לשחזר את הגיבוי הזה.');
                }
            }, null, { title: 'לשחזר את הגיבוי?', confirmText: 'שחזר', icon: 'checkCircle', tone: 'warning' });
        };
        li.append(info, btn);
        list.appendChild(li);
    });
    d.body.appendChild(list);

    // במחשב: אפשרות לשמור עותק גם לתיקייה במחשב, באישור חד-פעמי
    if ('showDirectoryPicker' in window && !hasNativeAutoBackup()) {
        const folderRow = document.createElement('div');
        folderRow.className = 'auto-backup-folder';
        const text = document.createElement('p');
        text.className = 'auto-backup-meta';
        folderRow.appendChild(text);
        const folderBtn = document.createElement('button');
        folderBtn.type = 'button';
        folderBtn.className = 'btn btn-secondary';
        folderRow.appendChild(folderBtn);
        d.body.appendChild(folderRow);

        const refresh = async () => {
            const handle = await getBackupDirHandle();
            let perm = null;
            try { perm = handle ? await handle.queryPermission({ mode: 'readwrite' }) : null; } catch (e) {}
            if (!handle) {
                text.textContent = 'רוצה עותק נוסף גם בתיקייה במחשב? בוחרים תיקייה פעם אחת, והגיבוי היומי ייכתב אליה לבד.';
                folderBtn.textContent = 'בחר תיקיית גיבוי';
            } else if (perm === 'granted') {
                text.textContent = `הגיבוי נכתב גם לתיקייה "${handle.name}" במחשב.`;
                folderBtn.textContent = 'החלף תיקייה';
            } else {
                text.textContent = `הדפדפן צריך אישור מחדש לכתוב לתיקייה "${handle.name}". בינתיים הגיבוי נשמר באפליקציה.`;
                folderBtn.textContent = 'אשר תיקייה';
            }
            folderBtn.onclick = async () => {
                try {
                    let h = handle;
                    if (h && perm !== 'granted') {
                        if (await h.requestPermission({ mode: 'readwrite' }) !== 'granted') h = null;
                    } else {
                        h = null;
                    }
                    if (!h) {
                        h = await window.showDirectoryPicker({ mode: 'readwrite' });
                        await saveBackupDirHandle(h);
                    }
                    localStorage.removeItem('lastAutoBackup');
                    await runAutoBackup(true);
                    refresh();
                } catch (e) {}
            };
        };
        refresh();
    }

    d.addButton('סגור', 'primary', () => d.close()).focus();
}

// שחזור מקובץ: בודקים שהקובץ הוא גיבוי, ושואלים אם למזג או להחליף
function restoreNotes(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            showAlert('שגיאה בקובץ הגיבוי. ודא שהקובץ תקין.');
            return;
        }
        if (!data || !Array.isArray(data.notes) || !data.notes.every(n => n && typeof n === 'object')) {
            showAlert('הקובץ הזה הוא לא גיבוי של הפתקים. לא שיניתי כלום.');
            return;
        }
        const current = getNotes();
        const ids = new Set(current.map(n => n.id));
        const newCount = data.notes.filter(n => !ids.has(n.id)).length;
        const d = createDialog({
            title: 'שחזור מגיבוי',
            icon: 'folder',
            message: `בגיבוי יש ${data.notes.length === 1 ? 'פתק אחד' : data.notes.length + ' פתקים'}, ${newCount === 0 ? 'כולם כבר נמצאים כאן' : newCount === 1 ? 'אחד מהם לא נמצא כאן עכשיו' : newCount + ' מהם לא נמצאים כאן עכשיו'}.\nמיזוג מוסיף את מה שחסר ולא נוגע בפתקים הקיימים. החלפה מוחקת את כל הפתקים הנוכחיים ושמה במקומם את הגיבוי.`
        });
        d.addButton('ביטול', 'secondary', () => d.close());
        d.addButton('החלפה', 'secondary', () => {
            d.close();
            showConfirm(`${current.length} הפתקים הנוכחיים יימחקו ויוחלפו ב-${data.notes.length} הפתקים שבגיבוי.`, () => applyRestore(data, 'replace'), null, { title: 'להחליף את כל הפתקים?', confirmText: 'החלף' });
        });
        d.addButton('מיזוג', 'primary', () => { d.close(); applyRestore(data, 'merge'); }).focus();
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function applyRestore(data, mode) {
    // שומר את המצב הנוכחי בגיבוי של היום לפני השחזור, כדי שאפשר יהיה להתחרט
    try { await runAutoBackup(true); } catch (e) {}
    const backupFolders = Array.isArray(data.folders) ? data.folders : [];
    const backupColors = data.folderColors && typeof data.folderColors === 'object' ? data.folderColors : {};
    const backupPositions = data.notePositions && typeof data.notePositions === 'object' ? data.notePositions : {};
    let added = data.notes.length;
    if (mode === 'merge') {
        const notes = getNotes();
        const ids = new Set(notes.map(n => n.id));
        const extra = data.notes.filter(n => !ids.has(n.id));
        added = extra.length;
        localStorage.setItem('notes', JSON.stringify([...notes, ...extra]));
        const folders = getFolders();
        backupFolders.forEach(f => { const name = folderNameOf(f); if (name && !folders.includes(name) && !fixedFolders.includes(name)) folders.push(name); });
        localStorage.setItem('folders', JSON.stringify(folders));
        folderColors = { ...backupColors, ...folderColors };
        notePositions = { ...backupPositions, ...notePositions };
    } else {
        localStorage.setItem('notes', JSON.stringify(data.notes));
        localStorage.setItem('folders', JSON.stringify(backupFolders));
        folderColors = { ...backupColors };
        notePositions = { ...backupPositions };
    }
    localStorage.setItem('folderColors', JSON.stringify(folderColors));
    localStorage.setItem('notePositions', JSON.stringify(notePositions));
    repairStoredData();
    loadFolders();
    loadNotesWithoutFolderView();
    showAlert(mode === 'merge'
        ? (added ? (added === 1 ? 'נוסף פתק אחד מהגיבוי 🎉' : `נוספו ${added} פתקים מהגיבוי 🎉`) : 'כל הפתקים שבגיבוי כבר נמצאים כאן.')
        : (added === 1 ? 'שוחזר פתק אחד מהגיבוי 🎉' : `שוחזרו ${added} פתקים מהגיבוי 🎉`));
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
        // Pointer events cover mouse, touch and pen with one handler.
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            const startW = el.offsetWidth;
            const startH = el.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}
            el.classList.add('is-resizing');
            const onMove = (ev) => {
                if (ev.pointerId !== e.pointerId) return;
                ev.preventDefault();
                const newW = Math.max(BOARD_MIN_W, startW + (ev.clientX - startX));
                const newH = Math.max(BOARD_MIN_H, startH + (ev.clientY - startY));
                el.style.width  = newW + 'px';
                el.style.height = newH + 'px';
            };
            const onUp = (ev) => {
                if (ev.pointerId !== e.pointerId) return;
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                el.classList.remove('is-resizing');
                const id = el.getAttribute('data-id');
                notePositions[id] = Object.assign(
                    { left: el.offsetLeft, top: el.offsetTop },
                    notePositions[id] || {},
                    { width: el.offsetWidth, height: el.offsetHeight }
                );
                localStorage.setItem('notePositions', JSON.stringify(notePositions));
            };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        });
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

let _rerenderAfterEdit = false;
function isEditingNote() {
    return !!document.querySelector('.note-content[contenteditable="true"]');
}

function checkDueTimes() {
    const notes = getNotes();
    const now = Date.now();
    const due = [];
    notes.forEach(n => {
        // פתק באשפה או שהושלם לא מצלצל
        if (!isOpenTask(n)) return;
        let fire = false;
        if (n.snoozeUntil && new Date(n.snoozeUntil).getTime() <= now) {
            delete n.snoozeUntil;
            fire = true;
        }
        const dueMs = n.dueTime && !n.notified ? new Date(n.dueTime).getTime() : NaN;
        if (!isNaN(dueMs) && dueMs <= now) {
            fire = true;
            // תזכורת חוזרת עוברת למועד הבא; רגילה מסומנת שכבר הוצגה
            const next = REPEAT_LABELS[n.repeat] ? nextOccurrence(n.dueTime, n.repeat, now) : null;
            if (next) n.dueTime = toLocalInputValue(next); else n.notified = true;
        }
        if (fire) due.push(n);
    });
    if (due.length) {
        localStorage.setItem('notes', JSON.stringify(notes));
        alertSound.play().catch(e => console.log('Audio blocked until interaction'));
        due.forEach(n => { showCustomAlertModal(n.text, n.id); showDueNotification(n.text); });
        _rerenderAfterEdit = true;
    }
    // לא בונים את הרשימה מחדש באמצע עריכה, כדי לא לקטוע את ההקלדה
    if (_rerenderAfterEdit && !isEditingNote()) {
        _rerenderAfterEdit = false;
        loadNotesWithoutFolderView();
    } else if (due.length) {
        due.forEach(n => {
            const el = document.querySelector(`.note[data-id="${CSS.escape(n.id)}"]`);
            if (el) el.classList.add('notified');
        });
    }
}

// חלון "הזמן עבר!": כמה תזכורות שמגיעות יחד מוצגות באותו חלון, כל אחת בשורה משלה
function showCustomAlertModal(text, noteId) {
    const existing = document.getElementById('custom-alert-overlay');
    if (existing && existing.dataset.state !== 'closed') {
        const body = existing.querySelector('.dialog-body');
        if (body) {
            if (noteId && existing._noteIds) existing._noteIds.push(noteId);
            const quote = document.createElement('div');
            quote.className = 'dialog-quote';
            quote.textContent = text;
            body.appendChild(quote);
            const title = existing.querySelector('.dialog-title');
            if (title) title.textContent = `הזמן עבר! (${body.querySelectorAll('.dialog-quote').length} תזכורות)`;
            return;
        }
    }
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
    d.overlay._noteIds = noteId ? [noteId] : [];
    d.addButton('נודניק 10 דק׳', 'secondary', () => {
        const ids = d.overlay._noteIds;
        const until = new Date(Date.now() + 10 * 60000).toISOString();
        const all = getNotes();
        all.forEach(n => { if (ids.includes(n.id)) n.snoozeUntil = until; });
        localStorage.setItem('notes', JSON.stringify(all));
        d.close();
        _rerenderAfterEdit = true;
        showToast('אזכיר שוב בעוד 10 דקות');
    });
    d.addButton('הבנתי', 'primary', () => d.close()).focus();
}

function openDateModal(currentTime, callback, currentRepeat) {
    const d = createDialog({ title: 'מתי להזכיר?', icon: 'clock', message: 'בחר תאריך ושעה, או אחת מהאפשרויות המהירות.' });
    const inputId = 'date-modal-input-' + Date.now();
    d.body.innerHTML = `
        <div class="quick-times" role="group" aria-label="בחירה מהירה"></div>
        <label class="field-label" for="${inputId}">תאריך ושעה</label>
        <input type="datetime-local" id="${inputId}">
        <label class="field-label" for="${inputId}-repeat">חזרה</label>
        <select id="${inputId}-repeat" class="repeat-select">
            <option value="">ללא</option>
            <option value="daily">כל יום</option>
            <option value="weekly">כל שבוע</option>
            <option value="monthly">כל חודש</option>
        </select>
    `;
    const input = d.body.querySelector('input');
    const repeatSel = d.body.querySelector('select');
    repeatSel.value = REPEAT_LABELS[currentRepeat] ? currentRepeat : '';
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
    if (currentTime) d.addButton('הסר תזכורת', 'secondary', () => { callback('', ''); d.close(); });
    d.addButton('ביטול', 'secondary', () => d.close());
    d.addButton('שמירה', 'primary', () => { callback(input.value, repeatSel.value); d.close(); });
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
    if (scrim) {
        scrim.addEventListener('click', () => setSidebarOpen(false));
        // במחשב: יציאה עם העכבר מהתפריט אל שאר הדף סוגרת אותו
        scrim.addEventListener('mousemove', () => { if (window.matchMedia('(hover: hover)').matches) setSidebarOpen(false); });
    }

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

    // סינון ומיון
    document.querySelectorAll('.filter-chips [data-filter]').forEach(b => {
        b.onclick = () => {
            activeFilter = b.dataset.filter;
            localStorage.setItem('noteFilter', activeFilter);
            syncViewControls();
            loadNotesWithoutFolderView();
        };
    });
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.onchange = () => {
        activeSort = SORTS.includes(sortSel.value) ? sortSel.value : 'newest';
        localStorage.setItem('noteSort', activeSort);
        loadNotesWithoutFolderView();
    };
    syncViewControls();

    // נייד: כפתור + צף שמוביל לתיבת הכתיבה
    const addFab = document.getElementById('addFab');
    if (addFab) {
        addFab.innerHTML = ICONS.plus;
        addFab.onclick = () => {
            if (isFolderViewActive && !canComposeIn(selectedFolder)) showMainContent();
            const field = document.getElementById('note-text');
            if (!field) return;
            field.scrollIntoView({ block: 'center', behavior: 'smooth' });
            field.focus({ preventScroll: true });
        };
    }
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
    const autoBackupBtn = document.getElementById('auto-backups-btn');
    if (autoBackupBtn) autoBackupBtn.onclick = openAutoBackupsDialog;

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

    // לחיצה שהתחילה בתוך פתק בעריכה (הזזת סמן, סימון טקסט בגרירה) לא סוגרת את העריכה
    const isInEditingNote = (target) => {
        const note = target && target.closest && target.closest('.note');
        return !!(note && note.querySelector('.note-content[contenteditable="true"]'));
    };
    let pressStartedInEditor = false;
    document.addEventListener('pointerdown', (e) => { pressStartedInEditor = isInEditingNote(e.target); }, true);

    document.addEventListener('click', function(e) {
        const startedInEditor = pressStartedInEditor;
        pressStartedInEditor = false;
        const keepEditing = startedInEditor || isInEditingNote(e.target);
        if (!e.target.closest('.menu-btn') && !e.target.closest('.menu') &&
            !e.target.closest('.note-toolbar') && !e.target.closest('.edit-btn') &&
            !e.target.closest('.color-circle')) {
            closeAllNoteMenus();
            document.querySelectorAll('.note').forEach(n => n.style.zIndex = '');
            if (keepEditing) return;
            document.querySelectorAll('.note-toolbar').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.note-content').forEach(c => c.contentEditable = 'false');
            document.querySelectorAll('.edit-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
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
            if (isFolderViewActive && !canComposeIn(selectedFolder)) showMainContent();
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

    repairStoredData();
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
    window._dueDateInterval = setInterval(() => { checkDueTimes(); runAutoBackup(); }, 5000);
    requestPersistentStorage();
    updateAutoBackupStatus();
    runAutoBackup(true);
    // שמירה גם כשיוצאים מהאפליקציה או מעבירים אותה לרקע
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') runAutoBackup(true); });
});