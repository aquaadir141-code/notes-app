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

// --- 1c. מודאלים מעוצבים במקום alert/confirm ---

function showAlert(message, onClose) {
    const existing = document.getElementById('_customAlertModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '_customAlertModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);display:flex;justify-content:center;align-items:center;z-index:99999;direction:rtl;';

    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:28px 32px;border-radius:14px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.18);';
    if (document.body.classList.contains('dark-mode')) {
        box.style.background = '#2d3748';
        box.style.color = '#e2e8f0';
    }

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText = 'font-size:1rem;margin-bottom:20px;line-height:1.5;';

    const btn = document.createElement('button');
    btn.textContent = 'אישור';
    btn.style.cssText = 'background:#4299e1;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:1rem;cursor:pointer;';
    btn.onclick = () => {
        overlay.remove();
        if (onClose) onClose();
    };

    box.appendChild(msg);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
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

function showToast(message, duration = 2500) {
    const existing = document.getElementById('_toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = '_toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2d3748;color:white;padding:10px 20px;border-radius:24px;font-size:0.9rem;z-index:99999;opacity:0;transition:opacity 0.25s;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showConfirm(message, onConfirm, onCancel) {
    const existing = document.getElementById('_customConfirmModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '_customConfirmModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);display:flex;justify-content:center;align-items:center;z-index:99999;direction:rtl;';

    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:28px 32px;border-radius:14px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.18);';
    if (document.body.classList.contains('dark-mode')) {
        box.style.background = '#2d3748';
        box.style.color = '#e2e8f0';
    }

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText = 'font-size:1rem;margin-bottom:24px;line-height:1.5;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'אישור';
    confirmBtn.style.cssText = 'background:#e53e3e;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:1rem;cursor:pointer;';
    confirmBtn.onclick = () => { overlay.remove(); if (onConfirm) onConfirm(); };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'ביטול';
    cancelBtn.style.cssText = 'background:#e2e8f0;color:#2d3748;border:none;border-radius:8px;padding:10px 28px;font-size:1rem;cursor:pointer;';
    cancelBtn.onclick = () => { overlay.remove(); if (onCancel) onCancel(); };

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(msg);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    cancelBtn.focus();
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

// --- 3. הזרקת CSS דינמי ---

const style = document.createElement('style');
style.innerHTML = `
    /* כפתור הגדרות (מוזיקה) צף - שמאל למטה */
    #settingsFloatingBtn {
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 50px;
        height: 50px;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 4000;
        border: 1px solid #e2e8f0;
        color: #4a5568;
        transition: transform 0.2s, background-color 0.3s;
    }
    #settingsFloatingBtn:hover {
        transform: scale(1.1);
        background-color: #f7fafc;
    }
    body.dark-mode #settingsFloatingBtn {
        background-color: #2d3748;
        border-color: #4a5568;
        color: #e2e8f0;
    }

    /* כפתור תפריט צד */
    #sidebarToggle {
        z-index: 1000 !important;
        cursor: pointer;
        position: fixed;
        right: 20px;
        top: 20px;
        font-size: 24px;
        color: #2d3748;
        transition: color 0.3s;
        background: none !important;
        padding: 0 !important;
        border-radius: 0;
    }
    body.dark-mode #sidebarToggle { color: #e2e8f0; }
    .folders-sidebar { z-index: 1001 !important; }

    /* הסרת קו תחתון מהתיקיות */
    .folder-title, .folder-container {
        border-bottom: none !important;
        text-decoration: none !important;
    }

    /* --- תיקון נעיצה בלוח: שכבה עליונה --- */
    .note.pinned {
        border: 2px solid #e1b12c !important;
        box-shadow: 0 0 12px rgba(225, 177, 44, 0.4);
        z-index: 50;
    }
    
    /* סידור האייקונים בראש הפתק */
    .note-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        padding: 0 0 5px 0;
        position: relative;
        z-index: 10;
    }

    .folder-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }

    .note-header button { 
        color: #3182ce; 
        transition: color 0.3s; 
        background: none; 
        border: none; 
        cursor: pointer; 
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .note-header button:hover { color: #2c5282; }
    body.dark-mode .note-header button { color: #90cdf4; }
    body.dark-mode .note-header button:hover { color: #63b3ed; }

    /* אייקון הנעץ */
    .pin-btn.active {
        color: #e1b12c !important;
        transform: rotate(-30deg);
    }

    /* --- תפריט בחירת תיקייה --- */
    .menu {
        display: none;
        position: absolute;
        top: 100%;
        right: 0;
        min-width: 160px;
        max-height: 200px;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 5px 25px rgba(0,0,0,0.3);
        z-index: 99999;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 5px 0;
        text-align: right;
    }
    
    body.dark-mode .menu {
        background-color: #2d3748;
        border-color: #4a5568;
        color: white;
    }

    .menu-item {
        padding: 8px 12px;
        cursor: pointer;
        font-size: 0.9em;
        white-space: nowrap;
        display: block;
        border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    .menu-item:last-child { border-bottom: none; }
    .menu-item:hover { background-color: #f7fafc; }
    body.dark-mode .menu-item:hover { background-color: #4a5568; }

    .menu::-webkit-scrollbar { width: 6px; }
    .menu::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 3px; }
    body.dark-mode .menu::-webkit-scrollbar-thumb { background: #4a5568; }

    /* סרגל עריכה */
    .note-toolbar {
        display: none;
        gap: 5px;
        background: #ffffff;
        padding: 6px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        border: 1px solid #e2e8f0;
        white-space: nowrap;
        align-items: center;
    }
    body.dark-mode .note-toolbar { background: #2d3748; border-color: #4a5568; }
    .note-toolbar button { padding: 4px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 0.9em; background: transparent; color: #4a5568; border-radius: 4px; border: none; cursor: pointer; }
    body.dark-mode .note-toolbar button { color: #cbd5e0; }
    .note-toolbar button:hover { background: rgba(0,0,0,0.1); }

    .note-content[contenteditable="true"] { outline: none; background: rgba(255,255,255,0.8); border: 2px solid #3182ce; border-radius: 6px; padding: 8px; min-height: 40px; }
    body.dark-mode .note-content[contenteditable="true"] { background: rgba(0,0,0,0.3); border-color: #90cdf4; }

    /* וידוא שהפתק לא חוסם */
    .note { overflow: visible !important; }

    /* מדריך */
    .guide-modal-content, .settings-modal-content { max-width: 600px; width: 90%; direction: rtl; text-align: right; }
    .guide-columns { display: flex; gap: 20px; text-align: right; margin-bottom: 20px; }
    .guide-col { flex: 1; background: rgba(0,0,0,0.03); padding: 10px; border-radius: 8px; }
    .guide-col h3 { border-bottom: 2px solid #3182ce; padding-bottom: 5px; margin-bottom: 10px; color: #2c5282; font-size: 1.1em; display: flex; align-items: center; gap: 8px; }
    body.dark-mode .guide-col { background: rgba(255,255,255,0.05); }
    body.dark-mode .guide-col h3 { color: #90cdf4; border-color: #90cdf4; }

    .copyright-footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 0.9em; color: #718096; font-weight: bold; text-align: center; background: #f7fafc; padding: 15px; border-radius: 8px; }
    body.dark-mode .copyright-footer { border-color: #4a5568; color: #a0aec0; background: #2d3748; }
    .inline-icon { vertical-align: middle; margin: 0 2px; display: inline-block; width: 16px; height: 16px; color: #3182ce; }

    /* הגדרות חלונית הגדרות */
    .sound-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px;
        border: 1px solid #e2e8f0;
        margin-bottom: 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
    }
    body.dark-mode .sound-option { border-color: #4a5568; }
    .sound-option:hover { background-color: #f7fafc; }
    body.dark-mode .sound-option:hover { background-color: #4a5568; }
    .sound-option.active {
        background-color: #ebf8ff;
        border-color: #3182ce;
        font-weight: bold;
    }
    body.dark-mode .sound-option.active { background-color: #2c5282; border-color: #90cdf4; }
`;
document.head.appendChild(style);

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
    const addBtn = document.getElementById('addNoteBtn');
    if(addBtn) addBtn.innerHTML = ICONS.plus;
    const guideBtn = document.getElementById('guideIcon');
    if(guideBtn) guideBtn.innerHTML = ICONS.info;
    const settingsBtn = document.getElementById('settingsIcon'); 
    if(settingsBtn) settingsBtn.innerHTML = ICONS.settings;
    const darkBtn = document.getElementById('darkModeToggle');
    if(darkBtn) darkBtn.innerHTML = isDark ? ICONS.moon : ICONS.sun;
    const boardBtn = document.getElementById('boardToggle');
    if(boardBtn) boardBtn.innerHTML = isBoardViewActive ? ICONS.list : ICONS.grid;
}

function showMainContent() {
    selectedFolder = 'תיקייה כללית';
    isFolderViewActive = false;
    const h1 = document.querySelector('h1');
    if(h1) h1.style.display = 'block';
    const createSec = document.getElementById('createNoteSection');
    if(createSec) createSec.style.display = 'block';
    const backBtn = document.getElementById('backBtn');
    if(backBtn) backBtn.style.display = 'none';
    const badge = document.getElementById('boardFolderBadge');
    if(badge) badge.style.display = 'none';
    document.querySelectorAll('.folder-container').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
    const defContainer = document.querySelector('.folder-container[data-folder="תיקייה כללית"]');
    if (defContainer) defContainer.classList.add('active');
    const defItem = document.querySelector('.folder-item[data-folder="תיקייה כללית"]');
    if (defItem) defItem.classList.add('selected');
    loadNotesWithoutFolderView();
}

function createFolder() {
    const folderName = prompt('שם לתיקייה (עד 15 תווים):');
    if (!folderName || !folderName.trim()) return;
    if (folderName.length > 15) { showAlert('שם התיקייה ארוך מדי (מקסימום 15 תווים)'); return; }
    let folders = getFolders();
    if (folders.includes(folderName) || fixedFolders.includes(folderName)) { showAlert('תיקייה בשם זה כבר קיימת'); return; }
    folders.push(folderName);
    localStorage.setItem('folders', JSON.stringify(folders));
    loadFolders();
    loadNotesWithoutFolderView(); 
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
        if (selectedFolder === folder) div.classList.add('selected');
        let deleteBtnHTML = isFixed ? '' : `<button class="delete-folder-btn">✖</button>`;
        div.innerHTML = `
            <span class="folder-name">📁 ${folder}</span>
            <div class="folder-actions">${deleteBtnHTML}</div>
            <div class="folder-color-picker">
                <span class="folder-color-preview" style="background: ${folderColors[folder] || '#ccc'}"></span>
                <input type="color" class="folder-color-input" data-folder="${folder}">
            </div>
        `;
        div.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') selectFolder(folder);
        };
        if (!isFixed) {
            const delBtn = div.querySelector('.delete-folder-btn');
            if(delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folder); };
        }
        const input = div.querySelector('input');
        input.addEventListener('change', (e) => { updateFolderColor(folder, e.target.value); });
        div.querySelector('.folder-color-preview').onclick = (e) => { e.stopPropagation(); input.click(); };
        list.appendChild(div);
    });
    contentContainer.innerHTML = '';
    [...fixedFolders, ...folders].forEach(folder => {
        if (folder === 'תיקייה כללית') return;
        const div = document.createElement('div');
        div.className = 'folder-container';
        div.setAttribute('data-folder', folder);
        const titleEl = document.createElement('div');
        titleEl.className = 'folder-title';
        titleEl.textContent = folder === 'משימות שהושלמו' ? '✅ משימות שהושלמו' : folder;
        div.appendChild(titleEl);
        if (folder === 'אשפה') {
            const trashBtn = document.createElement('button');
            trashBtn.className = 'clear-trash-btn';
            trashBtn.id = 'clearTrashBtn';
            trashBtn.onclick = clearTrash;
            div.appendChild(trashBtn);
        }
        const notesEl = document.createElement('div');
        notesEl.className = 'notes-container';
        notesEl.setAttribute('data-folder', folder);
        div.appendChild(notesEl);
        contentContainer.appendChild(div);
    });
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
    document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
    const currentItem = document.querySelector(`.folder-item[data-folder="${folder}"]`);
    if(currentItem) currentItem.classList.add('selected');
    const badge = document.getElementById('boardFolderBadge');
    if (badge) { badge.textContent = '📁 ' + folder; badge.style.display = 'inline-block'; }
    if (isBoardViewActive) {
        loadNotesWithoutFolderView();
    } else {
        const h1 = document.querySelector('h1');
        if(h1) h1.style.display = 'none';
        const sec = document.getElementById('createNoteSection');
        if(sec) sec.style.display = 'none';
        const back = document.getElementById('backBtn');
        if(back) back.style.display = 'block';
        loadNotesWithoutFolderView();
        document.querySelectorAll('.folder-container').forEach(c => c.classList.remove('active'));
        const container = document.querySelector(`.folder-container[data-folder="${folder}"]`);
        if (container) container.classList.add('active');
    }
}

function deleteFolder(folder) {
    showConfirm(`למחוק את התיקייה "${folder}"? הפתקים יועברו לתיקייה הכללית.`, () => {
        let folders = getFolders().filter(f => f !== folder);
        localStorage.setItem('folders', JSON.stringify(folders));
        let notes = getNotes();
        notes.forEach(n => { if (n.folder === folder) n.folder = 'תיקייה כללית'; });
        localStorage.setItem('notes', JSON.stringify(notes));
        showMainContent();
        loadFolders();
    });
}

function createNote(fromModal = false) {
    let text, due;
    if (fromModal) {
        text = document.getElementById('new-note-text').value;
        due = document.getElementById('new-note-due').value;
    } else {
        text = document.getElementById('note-text').value;
        due = document.getElementById('note-due').value;
    }
    if (!text || !text.trim()) { showAlert('נא לכתוב משהו בפתק'); return; }
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
        const modal = document.getElementById('newNoteModal');
        if(modal) modal.style.display = 'none';
    }
    loadNotesWithoutFolderView();
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
            trashBtn.innerHTML = '🗑️ נקה אשפה';
            // שיניתי את המיקום כאן: bottom: 90px
            trashBtn.style.cssText = 'position:fixed; bottom:90px; left:20px; z-index:9000; background:#e53e3e; color:white; padding:12px 20px; border-radius:50px; border:none; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.3); font-weight:bold; animation: popIn 0.3s ease;';
            trashBtn.onclick = clearTrash;
            document.body.appendChild(trashBtn);
            if(!document.getElementById('animStyle')) {
                const s = document.createElement('style');
                s.id = 'animStyle';
                s.innerHTML = `@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
                document.head.appendChild(s);
            }
        }
    }

    notes.forEach(note => {
        if (isFolderViewActive && selectedFolder && note.folder !== selectedFolder) return;
        const el = createNoteElement(note, isDarkMode);
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
            const container = document.querySelector(`.notes-container[data-folder="${note.folder}"]`);
            if (container) container.appendChild(el);
        }
    });
    searchNotes();
}

function createNoteElement(note, isDarkMode) {
    const div = document.createElement('div');
    div.className = `note ${validColors.includes(note.color) ? note.color : ''}`;
    if (note.pinned) div.classList.add('pinned');
    div.setAttribute('data-id', note.id);
    if (!validColors.includes(note.color)) div.style.backgroundColor = note.color;
    if (note.completed) div.classList.add('completed');
    if (note.notified) div.classList.add('notified');

    const date = new Date(note.created);
    const dateStr = date.toLocaleDateString('he-IL');
    const timeStr = date.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
    const now = Date.now();
    const dueTimeMs = note.dueTime ? new Date(note.dueTime).getTime() : 0;
    const isOverdue = note.dueTime && dueTimeMs < now && !note.completed;
    const dueTimeDisplay = note.dueTime ? new Date(note.dueTime).toLocaleString('he-IL', {hour:'2-digit', minute:'2-digit'}) : '';
    const dueStyle = isOverdue ? 'color: #e53e3e; font-weight: bold;' : 'color: #718096;';

    div.innerHTML = `
        <div class="note-header">
            <button class="extend-btn" title="שנה זמן">${ICONS.clock}</button>
            <div class="folder-wrapper" style="position:relative;">
                <button class="menu-btn" title="תיקייה">${ICONS.folder}</button>
                <div class="menu">
                    ${getAllFolderNames().map(f => `<div class="menu-item" data-folder="${escapeHTML(f)}">${escapeHTML(f)}</div>`).join('')}
                </div>
            </div>
            <button class="pin-btn ${note.pinned ? 'active' : ''}" title="נעץ">${ICONS.pin}</button>
            <button class="edit-btn" title="ערוך">${ICONS.edit}</button>
            <button class="delete-btn" title="${note.folder === 'אשפה' ? 'מחק לצמיתות' : 'העבר לאשפה'}" aria-label="${note.folder === 'אשפה' ? 'מחק לצמיתות' : 'העבר לאשפה'}">${note.folder === 'אשפה' ? ICONS.delete : '✖'}</button>
            <button class="complete-btn ${note.completed ? 'active' : ''}" aria-pressed="${note.completed ? 'true' : 'false'}" title="${note.completed ? 'לחץ לביטול הסימון' : 'סמן כהושלם'}" aria-label="${note.completed ? 'בטל סימון הושלם' : 'סמן כהושלם'}">${ICONS.check}</button>
        </div>
        <div class="note-toolbar">
            <button data-cmd="bold" title="מודגש">${ICONS.bold}</button>
            <button data-cmd="italic" title="נטוי">${ICONS.italic}</button>
            <button data-cmd="underline" title="קו תחתון">${ICONS.underline}</button>
            <button data-cmd="increaseFontSize" title="הגדל טקסט">${ICONS.zoomIn}</button>
            <button data-cmd="decreaseFontSize" title="הקטן טקסט">${ICONS.zoomOut}</button>
            <div class="note-text-color-picker" style="position:relative; width:28px; height:28px; overflow:hidden;">
                <span class="note-text-color-preview" style="display:flex; justify-content:center; align-items:center; width:100%; height:100%; color:${note.textColor || 'currentColor'};">${ICONS.palette}</span>
                <input type="color" class="note-text-color-input" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;">
            </div>
        </div>
        <div class="note-content" contenteditable="false" ${note.textColor ? `style="color: ${escapeHTML(note.textColor)}"` : ''}></div>
        <div class="note-meta" style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; font-size: 0.8em; color: #718096; gap: 5px;">
            <div title="נוצר ב" style="display: flex; align-items: center; gap: 3px;">
                <span>📅</span> ${dateStr} <span style="margin-right: 3px;">🕒</span> ${timeStr}
            </div>
            ${dueTimeDisplay ? `<div title="תוקף" style="${dueStyle}; display: flex; align-items: center; gap: 2px;">🏁 ${dueTimeDisplay}</div>` : ''}
        </div>
        ${isBoardViewActive ? `<div class="resize-handle-bottom-right"></div>` : ''}
    `;

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
        loadNotesWithoutFolderView();
    };
    div.querySelector('.pin-btn').onclick = () => togglePin(note.id);
    div.querySelector('.extend-btn').onclick = () => {
        openDateModal(note.dueTime, (newTime) => {
            if (newTime) { note.dueTime = newTime; note.notified = false; note.completed = false; updateNoteInStorage(note); loadNotesWithoutFolderView(); }
        });
    };

    const editBtn = div.querySelector('.edit-btn');
    const toolbar = div.querySelector('.note-toolbar');
    const content = div.querySelector('.note-content');
    content.textContent = note.text; // בטוח מ-XSS
    
    editBtn.onclick = () => {
        const isEditing = toolbar.style.display === 'flex';
        if (isEditing) {
            toolbar.style.display = 'none'; content.contentEditable = 'false'; note.text = content.innerText; updateNoteInStorage(note);
        } else {
            document.querySelectorAll('.note-toolbar').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.note-content').forEach(c => c.contentEditable = 'false');
            const rect = div.getBoundingClientRect();
            if (rect.top < 120) { toolbar.style.top = '45px'; } else { toolbar.style.top = '-55px'; }
            toolbar.style.display = 'flex'; content.contentEditable = 'true'; content.focus();
        }
    };

    toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault(); const cmd = btn.dataset.cmd;
            if (cmd === 'increaseFontSize') document.execCommand('fontSize', false, '4');
            else if (cmd === 'decreaseFontSize') document.execCommand('fontSize', false, '2');
            else document.execCommand(cmd, false, null);
        };
    });

    const colorInput = div.querySelector('.note-text-color-input');
    const colorPreview = div.querySelector('.note-text-color-preview');
    colorInput.oninput = (e) => { const val = e.target.value; content.style.color = val; note.textColor = val; colorPreview.style.color = val; };
    colorInput.onchange = () => updateNoteInStorage(note);

    const menuBtn = div.querySelector('.menu-btn');
    const menu = div.querySelector('.menu');
    menuBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            showFolderBottomSheet(note);
            return;
        }
        document.querySelectorAll('.menu').forEach(m => { if(m !== menu) m.style.display = 'none'; });
        document.querySelectorAll('.note').forEach(n => n.style.zIndex = '');
        if (menu.style.display === 'block') {
            menu.style.display = 'none';
            div.style.zIndex = '';
        } else {
            menu.style.display = 'block';
            div.style.zIndex = '5000';
        }
    };

    menu.querySelectorAll('.menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation(); const target = item.getAttribute('data-folder'); note.folder = target;
            if (target === 'אשפה') { note.color = folderColors['אשפה'] || '#bdc3c7'; } 
            else if (folderColors[target]) { note.color = folderColors[target]; } 
            else { note.color = note.customColor || 'green'; }
            updateNoteInStorage(note); loadNotesWithoutFolderView();
        };
    });
    
    content.addEventListener('input', function() { note.text = this.innerText; updateNoteInStorage(note); });
    return div;
}

// --- ניהול הגדרות סאונד ---

function createSettingsFloatingButton() {
    if (document.getElementById('settingsFloatingBtn')) return;
    const btn = document.createElement('div');
    btn.id = 'settingsFloatingBtn';
    btn.innerHTML = ICONS.settings;
    btn.onclick = showSettingsModal;
    document.body.appendChild(btn);
}

function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
        createSettingsModal();
        return showSettingsModal();
    }
    
    document.querySelectorAll('.sound-option').forEach(opt => {
        opt.classList.remove('active');
        if (opt.dataset.sound === currentSoundKey) {
            opt.classList.add('active');
        }
    });
    
    modal.style.display = 'flex';
}

function createSettingsModal() {
    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; justify-content:center; align-items:center; z-index:10000;';
    
    const content = document.createElement('div');
    content.className = 'settings-modal-content';
    content.style.cssText = 'background:white; padding:20px; border-radius:8px; width:300px; text-align:right; box-shadow: 0 4px 15px rgba(0,0,0,0.2);';
    if (document.body.classList.contains('dark-mode')) {
        content.style.background = '#2d3748';
        content.style.color = 'white';
    }

    content.innerHTML = `
        <h3 style="margin-bottom:15px; border-bottom:1px solid #ccc; padding-bottom:10px;">🔊 הגדרות צליל התראה</h3>
        <div id="soundOptionsList">
            <div class="sound-option" data-sound="sound1">
                <span>🎵 צליל 1 (Sound 1)</span>
                <button onclick="previewSound('sound1')" style="background:none; border:none; cursor:pointer;">▶️</button>
            </div>
            <div class="sound-option" data-sound="sound2">
                <span>⏰ צליל 2 (Sound 2)</span>
                <button onclick="previewSound('sound2')" style="background:none; border:none; cursor:pointer;">▶️</button>
            </div>
            <div class="sound-option" data-sound="sound3">
                <span>🔔 צליל 3 (Sound 3)</span>
                <button onclick="previewSound('sound3')" style="background:none; border:none; cursor:pointer;">▶️</button>
            </div>
        </div>
        <button id="closeSettingsBtn" style="margin-top:15px; width:100%; padding:10px; background:#3182ce; color:white; border:none; border-radius:5px; cursor:pointer;">שמור וסגור</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    document.getElementById('closeSettingsBtn').onclick = () => {
        modal.style.display = 'none';
    };

    modal.querySelectorAll('.sound-option').forEach(opt => {
        opt.onclick = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            document.querySelectorAll('.sound-option').forEach(el => el.classList.remove('active'));
            opt.classList.add('active');
            currentSoundKey = opt.dataset.sound;
            localStorage.setItem('selectedSound', currentSoundKey);
            alertSound = new Audio(SOUND_FILES[currentSoundKey]);
        };
    });
}

window.previewSound = function(key) {
    const tempAudio = new Audio(SOUND_FILES[key]);
    tempAudio.play().catch(e => console.error("Error playing sound:", e));
};

function showGuideModal() {
    const modal = document.getElementById('guideModal');
    let contentContainer = modal.querySelector('.guide-modal-content');
    
    contentContainer.innerHTML = `
        <h2>ברוכים הבאים לאפליקציית הפתקים! 📝</h2>
        <div class="guide-columns">
            <div class="guide-col">
                <h3><span class="inline-icon">${ICONS.list}</span> תצוגת רשימה</h3>
                <p>עבודה מסודרת לפי תיקיות. צור תיקיות חדשות, צבע אותן ונהל משימות שוטפות בצורה מאורגנת.</p>
            </div>
            <div class="guide-col">
                <h3><span class="inline-icon">${ICONS.grid}</span> תצוגת לוח</h3>
                <p>מרחב עבודה חופשי! גרור פתקים לכל מקום, שנה את גודלם וקבל תמונה רחבה על הכל.</p>
            </div>
        </div>
        <ul style="padding-right: 20px; line-height: 1.8; list-style-type: none;">
            <li><span class="inline-icon">${ICONS.plus}</span> <strong>יצירה:</strong> הוסף פתקים חדשים בקלות מהסרגל או בכפתור הצף.</li>
            <li><span class="inline-icon">${ICONS.pin}</span> <strong>נעיצה:</strong> הצמד פתקים חשובים לראש הרשימה.</li>
            <li><span class="inline-icon">${ICONS.folder}</span> <strong>תיקיות:</strong> קטלג פתקים לתיקיות אישיות וצבעוניות.</li>
            <li><span class="inline-icon">${ICONS.settings}</span> <strong>הגדרות צליל:</strong> בחר צליל התראה מועדף בלחיצה על כפתור התו.</li>
            <li><span class="inline-icon">${ICONS.edit}</span> <strong>עריכה:</strong> לחץ על העיפרון לעיצוב טקסט (<span class="inline-icon">${ICONS.bold}</span>) וצבעים.</li>
            <li><span class="inline-icon">${ICONS.clock}</span> <strong>תזכורות:</strong> קבע דד-ליין וקבל התראה כשהזמן עובר.</li>
            <li><span class="inline-icon">${ICONS.delete}</span> <strong>אשפה:</strong> פתקים שנמחקים נשמרים באשפה לביטחון.</li>
        </ul>
        <div class="copyright-footer">&copy; 2026 כל הזכויות שמורות - אדיר אקוע</div>
        <div style="margin-top:20px; padding:10px; background:rgba(0,0,0,0.05); border-radius:5px; text-align:center;">
            <label style="cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px;">
                <input type="checkbox" id="markGuideRead" style="transform:scale(1.3);"> קראתי והבנתי / אל תציג שוב
            </label>
        </div>
        <button id="closeGuideModalAction" style="margin-top:10px; width:100%; padding:12px; background:#4a5568; color:white; border:none; border-radius:6px; cursor:pointer; font-size:1.1em;">סגור והתחל לעבוד</button>
    `;

    modal.style.display = 'flex';
    setTimeout(() => {
        const closeBtn = document.getElementById('closeGuideModalAction');
        if(closeBtn) closeBtn.onclick = handleGuideClose;
        trapFocus(modal, document.getElementById('guideIcon'));
    }, 50);
}

function handleGuideClose() {
    const checkbox = document.getElementById('markGuideRead');
    if (checkbox && checkbox.checked) localStorage.setItem('hasSeenGuide_final_v1', 'true');
    document.getElementById('guideModal').style.display = 'none';
}

function closeGuideModal() { document.getElementById('guideModal').style.display = 'none'; }

function closeGuideModalFromAction() { handleGuideClose(); }

function searchNotes() {
    const s1 = document.getElementById('search-input');
    const s2 = document.getElementById('board-search-input');
    const val1 = s1 ? s1.value.toLowerCase() : '';
    const val2 = s2 ? s2.value.toLowerCase() : '';
    const term = val1 || val2;
    document.querySelectorAll('.note').forEach(note => {
        const text = note.innerText.toLowerCase();
        note.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

function clearForm() {
    if(document.getElementById('note-text')) document.getElementById('note-text').value = '';
    if(document.getElementById('note-due')) document.getElementById('note-due').value = '';
    if(document.getElementById('new-note-text')) document.getElementById('new-note-text').value = '';
    if(document.getElementById('new-note-due')) document.getElementById('new-note-due').value = '';
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    updateTopIcons();
}

function deleteNote(id, permanent) {
    if (permanent) {
        showConfirm('למחוק את הפתק לצמיתות? לא ניתן לשחזר.', () => {
            let notes = getNotes().filter(n => n.id !== id);
            delete notePositions[id];
            localStorage.setItem('notePositions', JSON.stringify(notePositions));
            localStorage.setItem('notes', JSON.stringify(notes));
            loadNotesWithoutFolderView();
        });
        return;
    }
    let notes = getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
        note.folder = 'אשפה';
        note.color = folderColors['אשפה'] || '#bdc3c7';
    }
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotesWithoutFolderView();
}

function showFolderBottomSheet(note) {
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
        document.body.appendChild(sheet);
    }
    const folders = getAllFolderNames();
    sheet.innerHTML = `
        <div class="mobile-folder-sheet-title">העבר לתיקייה</div>
        ${folders.map(f => `<div class="mobile-folder-item" data-folder="${escapeHTML(f)}">${escapeHTML(f)}</div>`).join('')}
    `;
    sheet.querySelectorAll('.mobile-folder-item').forEach(item => {
        item.onclick = () => {
            const target = item.getAttribute('data-folder');
            note.folder = target;
            if (target === 'אשפה') { note.color = folderColors['אשפה'] || '#bdc3c7'; }
            else if (folderColors[target]) { note.color = folderColors[target]; }
            else { note.color = note.customColor || 'green'; }
            updateNoteInStorage(note);
            loadNotesWithoutFolderView();
            closeFolderBottomSheet();
        };
    });
    overlay.onclick = closeFolderBottomSheet;
    overlay.classList.add('active');
    requestAnimationFrame(() => sheet.classList.add('active'));
}

function closeFolderBottomSheet() {
    const sheet = document.getElementById('mobileFolderSheet');
    const overlay = document.getElementById('mobileFolderSheetOverlay');
    if (sheet) sheet.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

function clearTrash() {
    showConfirm('לרוקן את האשפה? כל הפתקים יימחקו לצמיתות.', () => {
        let notes = getNotes().filter(n => n.folder !== 'אשפה');
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotesWithoutFolderView();
    });
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
        if (e.target.tagName === 'BUTTON') return;
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
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-alert-overlay';
    modalOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:20000;';
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:white; padding:30px; border-radius:12px; text-align:center; min-width:320px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); animation: popIn 0.3s ease;';
    if (document.body.classList.contains('dark-mode')) { modalContent.style.background = '#2d3748'; modalContent.style.color = 'white'; }
    const icon = document.createElement('div');
    icon.innerHTML = '⏰'; icon.style.fontSize = '3rem'; icon.style.marginBottom = '10px';
    const title = document.createElement('h2');
    title.innerText = 'הזמן עבר!'; title.style.marginBottom = '10px'; title.style.color = '#e53e3e';
    const msg = document.createElement('p');
    msg.innerText = `המשימה: "${text}"`; msg.style.fontSize = '1.1rem'; msg.style.marginBottom = '20px';
    const okBtn = document.createElement('button');
    okBtn.innerText = 'אישור';
    okBtn.style.cssText = 'background:#4299e1; color:white; padding:10px 30px; border:none; border-radius:6px; cursor:pointer; font-size:1rem; transition: background 0.2s;';
    okBtn.onclick = () => document.body.removeChild(modalOverlay);
    modalContent.appendChild(icon); modalContent.appendChild(title); modalContent.appendChild(msg); modalContent.appendChild(okBtn);
    modalOverlay.appendChild(modalContent); document.body.appendChild(modalOverlay);
    const style = document.createElement('style');
    style.innerHTML = `@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
    document.head.appendChild(style);
}

function openDateModal(currentTime, callback) {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:10000;';
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:white; padding:20px; border-radius:8px; text-align:center; min-width:300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    if (document.body.classList.contains('dark-mode')) { modalContent.style.background = '#2d3748'; modalContent.style.color = 'white'; }
    const title = document.createElement('h3'); title.innerText = 'בחר זמן לביצוע'; title.style.marginBottom = '15px';
    const input = document.createElement('input'); input.type = 'datetime-local'; input.style.cssText = 'width:100%; padding:10px; margin-bottom:20px; border-radius:5px; border:1px solid #ccc; font-size:1rem;';
    if (currentTime) { try { input.value = new Date(currentTime).toISOString().slice(0, 16); } catch(e){} }
    const btnContainer = document.createElement('div'); btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'space-between'; btnContainer.style.gap = '10px';
    const saveBtn = document.createElement('button'); saveBtn.innerText = 'שמור'; saveBtn.style.cssText = 'background:#48bb78; color:white; padding:10px 20px; border:none; border-radius:5px; cursor:pointer; flex:1;';
    const cancelBtn = document.createElement('button'); cancelBtn.innerText = 'ביטול'; cancelBtn.style.cssText = 'background:#e53e3e; color:white; padding:10px 20px; border:none; border-radius:5px; cursor:pointer; flex:1;';
    saveBtn.onclick = () => { callback(input.value); document.body.removeChild(modalOverlay); };
    cancelBtn.onclick = () => { document.body.removeChild(modalOverlay); };
    btnContainer.appendChild(saveBtn); btnContainer.appendChild(cancelBtn);
    modalContent.appendChild(title); modalContent.appendChild(input); modalContent.appendChild(btnContainer);
    modalOverlay.appendChild(modalContent); document.body.appendChild(modalOverlay);
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
    
    // חיבור נכון לתפריט הצד
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('foldersSidebar');
    if(toggleBtn && sidebar) {
        toggleBtn.addEventListener('mouseenter', () => sidebar.classList.add('active'));
        toggleBtn.addEventListener('click', () => sidebar.classList.add('active'));
        sidebar.addEventListener('mouseleave', () => sidebar.classList.remove('active'));
    }

    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.onclick = () => sidebar.classList.remove('active');
    }

    document.addEventListener('touchstart', (e) => {
        if (sidebar && sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            toggleBtn && !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    }, { passive: true });

    const oldCloseBtn = document.getElementById('closeGuideModal');
    if(oldCloseBtn) oldCloseBtn.onclick = handleGuideClose;

    document.getElementById('search-input').oninput = searchNotes;
    const boardSearch = document.getElementById('board-search-input');
    if(boardSearch) boardSearch.oninput = searchNotes;

    document.getElementById('boardToggle').onclick = toggleBoardView;
    document.getElementById('backToListBtn').onclick = () => { if(isBoardViewActive) toggleBoardView(); };
    
    const addNoteBtn = document.getElementById('addNoteBtn');
    if(addNoteBtn) addNoteBtn.onclick = () => {
        const modal = document.getElementById('newNoteModal');
        modal.style.display = 'flex';
        setTimeout(() => trapFocus(modal, addNoteBtn), 50);
    };
    
    document.getElementById('confirm-new-note-btn').onclick = () => createNote(true);
    document.getElementById('cancel-new-note-btn').onclick = () => { document.getElementById('newNoteModal').style.display = 'none'; };
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
            document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('selected'));
            this.classList.add('selected');
            selectedColor = this.getAttribute('data-color');
            localStorage.setItem('selectedColor', selectedColor);
        };
    });

    const newCpBtn = document.getElementById('new-note-color-picker-btn');
    const newCpInp = document.getElementById('new-note-color-picker');
    if(newCpBtn && newCpInp) {
        newCpBtn.onclick = () => newCpInp.click();
        newCpInp.oninput = (e) => {
            selectedColor = e.target.value;
            localStorage.setItem('selectedColor', selectedColor);
            document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
        };
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.menu-btn') && !e.target.closest('.menu') && 
            !e.target.closest('.note-toolbar') && !e.target.closest('.edit-btn') && 
            !e.target.closest('.color-circle')) {
            document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');
            document.querySelectorAll('.note-toolbar').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.note-content').forEach(c => c.contentEditable = 'false');
            document.querySelectorAll('.note').forEach(n => n.style.zIndex = '');
        }
    });
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

    createSettingsFloatingButton();
    updateTopIcons();
    loadFolders();
    showMainContent(); 

    if (!localStorage.getItem('hasSeenGuide_final_v1')) {
        showGuideModal();
    }

    setupEventListeners();
    if (window._dueDateInterval) clearInterval(window._dueDateInterval);
    window._dueDateInterval = setInterval(() => { checkDueTimes(); autoBackupIfTime(); }, 5000);
});