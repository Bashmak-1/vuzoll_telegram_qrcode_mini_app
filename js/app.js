const tg = window.Telegram.WebApp;
tg.expand();

// === 1. ВІРТУАЛЬНА КОНСОЛЬ (Логи сайту) ===
const debugLogs = [];
const MAX_LOGS = 300; // Тримаємо в пам'яті до 300 рядків

function addFrontendLog(type, args) {
    const time = new Date().toLocaleTimeString();
    const message = args.map(arg => {
        if (typeof arg === 'object') return JSON.stringify(arg);
        return String(arg);
    }).join(' ');
    
    debugLogs.push(`[${time}] [${type}] ${message}`);
    if (debugLogs.length > MAX_LOGS) debugLogs.shift();
}

// Перехоплення стандартної консолі
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => { addFrontendLog('INFO', args); originalLog.apply(console, args); };
console.error = (...args) => { addFrontendLog('ERROR', args); originalError.apply(console, args); };
console.warn = (...args) => { addFrontendLog('WARN', args); originalWarn.apply(console, args); };

// Перехоплення критичних помилок (Crash)
window.onerror = (msg, url, line) => {
    addFrontendLog('CRASH', [`${msg} (на лінії ${line})`]);
    return false;
};

// === 2. КОНФІГУРАЦІЯ ТА СТАН ===
let cart = [];
let API_BASE = "";
const HEADERS = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };

// Адаптивний полінг (перевірка зв'язку)
let currentPollingInterval = 5000;
let pollingTimer = null;
let lastUserActionTime = Date.now();

// === 3. ІНІЦІАЛІЗАЦІЯ ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Frontend ініціалізовано");
    
    API_BASE = getApiUrl();
    console.log("🔗 API URL:", API_BASE || "Not set");

    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) input.value = API_BASE;

    restoreTheme();

    // Слухачі інтерфейсу
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 500));
    
    // Модалка логів
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    
    // Нові кнопки копіювання логів САЙТУ
    document.getElementById('copyLogsBtn').innerText = "📋 Копіювати 100";
    document.getElementById('copyLogsBtn').onclick = () => copySiteLogs(100);
    
    document.getElementById('clearLogsBtn').innerText = "📋 Копіювати ВСЕ";
    document.getElementById('clearLogsBtn').onclick = () => copySiteLogs(0);

    // Кнопка завантаження логів БОТА (якщо треба)
    document.getElementById('fetchServerLogsBtn').addEventListener('click', fetchServerLogs);

    // Активність користувача
    document.addEventListener('click', resetPolling);
    
    if (API_BASE) scheduleNextPoll();
});

// === 4. РОБОТА З ЛОГАМИ (FRONTEND) ===
function showLogs() {
    document.getElementById('logsModal').classList.remove('hidden');
    renderLogs();
}

function renderLogs() {
    const area = document.getElementById('logsArea');
    area.textContent = debugLogs.length > 0 ? debugLogs.join('\n') : "Логів сайту ще немає...";
    area.scrollTop = area.scrollHeight;
}

async function copySiteLogs(count) {
    let textToCopy = "";
    if (count > 0) {
        textToCopy = debugLogs.slice(-count).join('\n');
    } else {
        textToCopy = debugLogs.join('\n');
    }

    try {
        await navigator.clipboard.writeText(`=== FRONTEND LOGS ===\n${textToCopy}`);
        tg.showAlert("✅ Логи сайту скопійовано!");
    } catch (err) {
        tg.showAlert("❌ Не вдалося скопіювати: " + err);
    }
}

async function fetchServerLogs() {
    const area = document.getElementById('logsArea');
    area.textContent = "⏳ Завантаження логів БОТА з сервера...";
    try {
        const res = await fetch(`${API_BASE}/api/logs`, { headers: HEADERS });
        const data = await res.json();
        area.textContent = `=== SERVER LOGS ===\n${data.logs}`;
    } catch (e) {
        area.textContent = "❌ Помилка завантаження логів сервера.";
    }
}

// === 5. ФУНКЦІЇ API ТА КОШИКА ===
async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    const spinner = document.getElementById('searchSpinner');

    if (query.length < 2) { resultsDiv.classList.add('hidden'); return; }

    spinner?.classList.remove('hidden');
    try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { headers: HEADERS });
        const data = await res.json();
        resultsDiv.innerHTML = '';
        if (data.results?.length > 0) {
            data.results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<b>${item.name}</b><small>ID: ${item.id}</small>`;
                div.onclick = () => {
                    fetchItem(item.id);
                    document.getElementById('searchInput').value = '';
                    resultsDiv.classList.add('hidden');
                };
                resultsDiv.appendChild(div);
            });
            resultsDiv.classList.remove('hidden');
        } else {
            resultsDiv.innerHTML = '<div class="search-item">Нічого не знайдено</div>';
            resultsDiv.classList.remove('hidden');
        }
    } catch (e) { console.error("Search Error:", e); }
    finally { spinner?.classList.add('hidden'); }
}

async function fetchItem(id) {
    tg.MainButton.showProgress();
    try {
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}`, { headers: HEADERS });
        const data = await res.json();
        if (data.error) tg.showAlert(`❌ ${data.error}`);
        else addToCart(data);
    } catch (e) { tg.showAlert("❌ Помилка мережі"); console.error(e); }
    tg.MainButton.hideProgress();
}

function addToCart(item) {
    const globalAction = document.getElementById('globalActionType').value;
    if (cart.find(i => i.id === item.id)) {
        tg.showAlert("Цей товар вже додано!");
        return;
    }
    cart.push({ ...item, inputQty: 1, action: globalAction });
    render();
}

function render() {
    const list = document.getElementById('itemList');
    const btn = document.getElementById('submitBtn');
    if (cart.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Кошик порожній</p></div>';
        btn.disabled = true; btn.innerText = "Зберегти (0)";
        return;
    }
    list.innerHTML = "";
    cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <div class="card-header">
                <div class="item-icon">📦</div>
                <div class="item-details">
                    <h3>${item.name}</h3>
                    <p class="item-id-full">${item.id}</p>
                    <p>На складі: <b>${item.quantity}</b> | ${item.location || '?'}</p>
                </div>
            </div>
            <div class="item-card-row">
                <select class="item-action-select" onchange="updateItemAction('${item.id}', this.value)">
                    <option value="take" ${item.action === 'take' ? 'selected' : ''}>🔻 Взяти</option>
                    <option value="restock" ${item.action === 'restock' ? 'selected' : ''}>🚚 Додати</option>
                    <option value="fact" ${item.action === 'fact' ? 'selected' : ''}>📋 Факт</option>
                </select>
                <div class="qty-control">
                    <input type="number" class="qty-input" value="${item.inputQty}" oninput="updateQty('${item.id}', this.value)">
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.id}')">🗑</button>
            </div>`;
        list.appendChild(el);
    });
    btn.disabled = false; btn.innerText = `Зберегти (${cart.length})`;
}

async function submitOrder() {
    if (!API_BASE || cart.length === 0) return;
    tg.MainButton.showProgress();
    try {
        const payload = {
            user_id: tg.initDataUnsafe?.user?.id,
            user_name: tg.initDataUnsafe?.user?.first_name,
            items: cart.map(i => ({ id: i.id, qty: i.inputQty, action: i.action }))
        };
        const res = await fetch(`${API_BASE}/api/submit_order`, {
            method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            tg.showAlert("✅ Збережено!\n" + data.details.join('\n'));
            cart = []; render();
        } else { tg.showAlert("❌ Помилка: " + data.error); }
    } catch (e) { tg.showAlert("❌ Помилка відправки"); }
    tg.MainButton.hideProgress();
}

// === 6. ДОПОМІЖНІ ФУНКЦІЇ (Themes, Polling, Helpers) ===
window.updateQty = (id, val) => { const item = cart.find(i => i.id === id); if (item) item.inputQty = parseInt(val) || 0; };
window.updateItemAction = (id, val) => { const item = cart.find(i => i.id === id); if (item) item.action = val; };
window.removeFromCart = (id) => { cart = cart.filter(i => i.id !== id); render(); };

function getApiUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramApi = urlParams.get('api');
    if (paramApi) {
        const cleanUrl = paramApi.replace(/\/$/, "");
        localStorage.setItem('vuzoll_api_url', cleanUrl);
        return cleanUrl;
    }
    return localStorage.getItem('vuzoll_api_url') || "";
}

function resetPolling() {
    lastUserActionTime = Date.now();
    if (currentPollingInterval > 5000) {
        currentPollingInterval = 5000;
        clearTimeout(pollingTimer);
        checkConnection();
        scheduleNextPoll();
    }
}

async function checkConnection() {
    const dot = document.getElementById('statusDot');
    try {
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        if (res.ok) { dot.classList.add('connected'); dot.classList.remove('disconnected'); }
        else throw new Error();
    } catch (e) { dot.classList.remove('connected'); dot.classList.add('disconnected'); }
}

function scheduleNextPoll() {
    pollingTimer = setTimeout(async () => {
        await checkConnection();
        const idleTime = Date.now() - lastUserActionTime;
        if (idleTime > 60000) currentPollingInterval = Math.min(currentPollingInterval * 1.5, 60000);
        else currentPollingInterval = 5000;
        scheduleNextPoll();
    }, currentPollingInterval);
}

function debounce(func, timeout) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function startScan() {
    tg.showScanQrPopup({ text: "Скануйте QR-код деталі" }, (text) => {
        tg.closeScanQrPopup();
        fetchItem(text);
        return true;
    });
}

function restoreTheme() {
    if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-theme');
    updateTgColors();
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    updateTgColors();
}

function updateTgColors() {
    const isLight = document.body.classList.contains('light-theme');
    tg.setHeaderColor(isLight ? '#ffffff' : '#2c2c2e');
    tg.setBackgroundColor(isLight ? '#f2f2f7' : '#1c1c1e');
}