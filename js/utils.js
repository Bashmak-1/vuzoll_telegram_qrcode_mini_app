// === UTILITIES ===

// Отримання ID користувача (безпечно)
function getTelegramUserId() {
    return tg.initDataUnsafe?.user?.id || null;
}

// Функція затримки (Debounce) для пошуку
let debounceTimer;
function debounce(func, timeout){
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// === LOGGING SYSTEM ===
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function addLog(type, args) {
    const time = new Date().toLocaleTimeString();
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    debugLogs.push(`[${time}] [${type}] ${msg}`);
    if(debugLogs.length > 200) debugLogs.shift();
}

console.log = (...args) => { addLog('INF', args); originalLog.apply(console, args); };
console.error = (...args) => { addLog('ERR', args); originalError.apply(console, args); };
console.warn = (...args) => { addLog('WRN', args); originalWarn.apply(console, args); };
window.onerror = (msg, url, line) => { console.error(`CRASH: ${msg} @ ${line}`); };

// === THEME MANAGER ===
function restoreTheme() {
    const t = localStorage.getItem('theme');
    if (t === 'light') { document.body.classList.add('light-theme'); updateTgColors(true); } 
    else { updateTgColors(false); }
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateTgColors(isLight);
}

function updateTgColors(isLight) {
    if (isLight) { tg.setHeaderColor('#ffffff'); tg.setBackgroundColor('#f2f2f7'); } 
    else { tg.setHeaderColor('#2c2c2e'); tg.setBackgroundColor('#1c1c1e'); }
}

// === CLIPBOARD ===
function copyResultText() {
    const text = document.getElementById('resultText').textContent;
    navigator.clipboard.writeText(text);
    tg.showAlert("Результат скопійовано!");
}

function copyLocalLogs() {
    navigator.clipboard.writeText(debugLogs.join('\n')).then(() => tg.showAlert("Логи скопійовано!"));
}