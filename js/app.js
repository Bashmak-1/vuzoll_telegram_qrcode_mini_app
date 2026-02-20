const tg = window.Telegram.WebApp;
tg.expand();

// === CONFIG ===
const POLLING_MIN_INTERVAL = 5000;  // 5 сек
const POLLING_MAX_INTERVAL = 60000; // 60 сек
const POLLING_GROWTH_FACTOR = 1.5;  // Множник збільшення

let currentPollingInterval = POLLING_MIN_INTERVAL;
let pollingTimer = null;
let lastUserActionTime = Date.now();

// === STATE ===
let cart = [];
let API_BASE = "";
// Локальний буфер логів (тільки те, що відбувається в браузері)
const debugLogs = []; 
const HEADERS = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };

// === VIRTUAL CONSOLE (Перехоплення) ===
// Перехоплюємо console.log/error, щоб бачити їх у вікні на телефоні
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function addLog(type, args) {
    const time = new Date().toLocaleTimeString();
    // Перетворюємо об'єкти в текст, щоб не було [object Object]
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const line = `[${time}] [${type}] ${msg}`;
    
    debugLogs.push(line);
    if(debugLogs.length > 300) debugLogs.shift(); // Тримаємо останні 300 записів
}

console.log = (...args) => { addLog('INF', args); originalLog.apply(console, args); };
console.error = (...args) => { addLog('ERR', args); originalError.apply(console, args); };
console.warn = (...args) => { addLog('WRN', args); originalWarn.apply(console, args); };

window.onerror = (msg, url, line) => { console.error(`CRASH: ${msg} @ ${line}`); };

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Init");
    API_BASE = getApiUrl();
    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) input.value = API_BASE;
    restoreTheme();

    // Listeners
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
    
    // Пошук
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(handleSearch, 500));
    // Будь-яка взаємодія скидає таймер "сну"
    searchInput.addEventListener('focus', resetPolling);

    // Логи
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    document.getElementById('copyLogsBtn').addEventListener('click', copyLocalLogs);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLocalLogs);

    // Скидання таймера при кліках
    document.addEventListener('click', resetPolling);
    document.addEventListener('touchstart', resetPolling);

    if (API_BASE) scheduleNextPoll();
});

// === ADAPTIVE POLLING ===
function resetPolling() {
    lastUserActionTime = Date.now();
    // Якщо інтервал вже виріс, скидаємо і пінгуємо
    if (currentPollingInterval > POLLING_MIN_INTERVAL) {
        currentPollingInterval = POLLING_MIN_INTERVAL;
        console.log("⚡ Wake up! Reset poll to 5s");
        clearTimeout(pollingTimer);
        checkConnection(); 
    }
}

function scheduleNextPoll() {
    pollingTimer = setTimeout(async () => {
        await checkConnection();
        
        const idleTime = Date.now() - lastUserActionTime;
        if (idleTime > 60000) { 
            // Якщо хвилину не чіпали екран, уповільнюємо
            currentPollingInterval = Math.min(currentPollingInterval * POLLING_GROWTH_FACTOR, POLLING_MAX_INTERVAL);
        } else {
            currentPollingInterval = POLLING_MIN_INTERVAL;
        }
        scheduleNextPoll();
    }, currentPollingInterval);
}

async function checkConnection() {
    const dot = document.getElementById('statusDot');
    try {
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        if (res.ok) {
            dot.classList.add('connected');
            dot.classList.remove('disconnected');
        } else { throw new Error(res.status); }
    } catch (e) {
        // console.warn("Ping failed"); // Можна вимкнути, щоб не смітити в лог
        dot.classList.remove('connected');
        dot.classList.add('disconnected');
    }
}

// === ПОШУК ===
let debounceTimer;
function debounce(func, timeout){
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    const spinner = document.getElementById('searchSpinner');

    if (query.length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }

    // Показуємо спіннер
    spinner.classList.remove('hidden');

    try {
        // Штучна затримка 300мс, щоб око побачило спіннер на ПК
        await new Promise(r => setTimeout(r, 300)); 

        console.log(`🔍 Searching: "${query}"`);
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { headers: HEADERS });
        const data = await res.json();
        
        resultsDiv.innerHTML = '';
        if (data.results && data.results.length > 0) {
            data.results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<b>${item.name}</b><br><small>${item.id}</small>`;
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
    } catch (e) {
        console.error("Search error:", e);
    } finally {
        spinner.classList.add('hidden');
    }
}

// === КАРТКА ТОВАРУ ===
function addToCart(item) {
    // Яку дію обрав юзер в глобальному селекті?
    const globalAction = document.getElementById('globalActionType').value;
    
    // Перевірка дублікатів
    if(cart.find(i => i.id === item.id)) {
        tg.showAlert("⚠️ Цей товар вже є в списку!");
        return;
    }

    cart.push({ 
        ...item, 
        inputQty: 0,
        action: globalAction // Індивідуальна дія за замовчуванням
    });
    render();
}

function updateItemAction(id, newAction) {
    const item = cart.find(i => i.id === id);
    if (item) item.action = newAction;
}

window.updateQty = function(id, val) { 
    const item = cart.find(i => i.id === id); 
    if (item) item.inputQty = parseInt(val) || 0; 
}
window.changeItemAction = function(id, val) {
    updateItemAction(id, val);
}
window.removeFromCart = function(id) {
    tg.showConfirm("Видалити з кошика?", (ok) => { 
        if (ok) { cart = cart.filter(i => i.id !== id); render(); } 
    });
}

function render() {
    const list = document.getElementById('itemList');
    const btn = document.getElementById('submitBtn');

    if (cart.length === 0) {
        list.innerHTML = `<div class="empty-state"><div style="font-size: 40px; margin-bottom: 10px;">📷</div><p>Кошик пустий</p></div>`;
        btn.disabled = true; btn.innerText = "Зберегти (0)"; return;
    }

    list.innerHTML = "";
    cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'card';
        
        // Індивідуальний селект
        const selectHtml = `
            <select class="item-action-select" onchange="changeItemAction('${item.id}', this.value)">
                <option value="take" ${item.action === 'take' ? 'selected' : ''}>🔻 Взяти</option>
                <option value="restock" ${item.action === 'restock' ? 'selected' : ''}>🚚 Додати</option>
                <option value="fact" ${item.action === 'fact' ? 'selected' : ''}>📋 Факт</option>
            </select>
        `;

        el.innerHTML = `
            <div class="card-header">
                <div class="item-icon">📦</div>
                <div class="item-details">
                    <h3>${item.name}</h3>
                    <div class="item-id-full">${item.id}</div>
                    <p>Склад: <b>${item.quantity}</b> | ${item.location}</p>
                </div>
            </div>
            
            <div class="item-card-row">
                ${selectHtml}
                <div class="qty-control">
                    <input type="number" class="qty-input" placeholder="0" 
                        value="${item.inputQty || ''}" 
                        oninput="updateQty('${item.id}', this.value)">
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.id}')">✖</button>
            </div>
        `;
        list.appendChild(el);
    });

    btn.disabled = false; btn.innerText = `Зберегти (${cart.length})`;
}

// === SUBMIT ===
async function submitOrder() {
    if (!API_BASE) return;
    tg.MainButton.showProgress();
    
    // Валідація: чи всі кількості введені?
    const empty = cart.filter(i => i.inputQty <= 0);
    if(empty.length > 0) {
        tg.showAlert("⚠️ Введіть кількість для всіх товарів!");
        tg.MainButton.hideProgress();
        return;
    }

    try {
        const payload = {
            user_id: tg.initDataUnsafe?.user?.id,
            user_name: tg.initDataUnsafe?.user?.first_name,
            // action: ...  <- Глобальний action більше не потрібен, бо беремо з items
            items: cart.map(i => ({ 
                id: i.id, 
                qty: i.inputQty,
                action: i.action 
            }))
        };

        const res = await fetch(`${API_BASE}/api/submit_order`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            console.log("Submit success", data);
            tg.showAlert("✅ Успішно!\n" + data.details.join('\n'));
            cart = [];
            render();
        } else {
            console.error("Submit error", data);
            tg.showAlert("❌ Помилка сервера: " + data.error);
        }

    } catch (e) {
        console.error("Net error", e);
        tg.showAlert("❌ Помилка: " + e.message);
    }
    tg.MainButton.hideProgress();
}

// === ЛОГИ (LOCAL) ===
function showLogs() {
    document.getElementById('logsModal').classList.remove('hidden');
    const area = document.getElementById('logsArea');
    area.textContent = debugLogs.join('\n') || "Логи пусті.";
    area.scrollTop = area.scrollHeight;
}

function clearLocalLogs() {
    debugLogs.length = 0;
    document.getElementById('logsArea').textContent = "Очищено.";
}

function copyLocalLogs() {
    const text = debugLogs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        tg.showAlert("✅ Логи скопійовано!");
    }).catch(e => {
        tg.showAlert("❌ Помилка копіювання");
    });
}

// === HELPERS ===
async function fetchItem(id) {
    tg.MainButton.showProgress();
    try {
        console.log("Fetching", id);
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}`, { headers: HEADERS });
        
        // Перевірка на Ngrok HTML
        const type = res.headers.get("content-type");
        if(type && !type.includes("json")) throw new Error("Ngrok Warning Page received");

        const data = await res.json();
        if (data.error) tg.showAlert(`❌ ${data.error}`);
        else addToCart(data);
    } catch (e) { 
        console.error(e);
        tg.showAlert(`❌ ${e.message}`); 
    }
    tg.MainButton.hideProgress();
}

function getApiUrl() {
    const p = new URLSearchParams(window.location.search).get('api');
    if (p) {
        const u = p.replace(/\/$/, "");
        localStorage.setItem('vuzoll_api_url', u);
        return u;
    }
    return localStorage.getItem('vuzoll_api_url') || "";
}
function saveApiUrl() {
    const val = document.getElementById('apiUrlInput').value.trim();
    API_BASE = val.replace(/\/$/, "");
    localStorage.setItem('vuzoll_api_url', API_BASE);
    tg.showAlert("URL збережено.");
    resetPolling();
}
function startScan() {
    if (!API_BASE) { tg.showAlert("⚠️ Немає API URL!"); return; }
    tg.showScanQrPopup({ text: "QR-код" }, (text) => {
        tg.closeScanQrPopup();
        fetchItem(text);
    });
}
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