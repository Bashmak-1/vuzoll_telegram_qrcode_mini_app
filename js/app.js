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
const debugLogs = []; // Локальні логи (консоль)

// Заголовки
const HEADERS = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
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
    searchInput.addEventListener('focus', resetPolling); // Скидаємо таймер при активності

    // Логи
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    document.getElementById('copyLogsBtn').addEventListener('click', copyAllLogs);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLocalLogs);
    document.getElementById('fetchServerLogsBtn').addEventListener('click', fetchServerLogs);

    // Глобальний клік скидає таймер полінгу (активність юзера)
    document.addEventListener('click', resetPolling);
    document.addEventListener('touchstart', resetPolling);

    // Старт полінгу
    if (API_BASE) {
        scheduleNextPoll();
    }
});

// === ADAPTIVE POLLING ===
function resetPolling() {
    lastUserActionTime = Date.now();
    // Якщо інтервал був довгий, скидаємо на швидкий і одразу перевіряємо
    if (currentPollingInterval > POLLING_MIN_INTERVAL) {
        currentPollingInterval = POLLING_MIN_INTERVAL;
        console.log("⚡ User active! Resetting polling to 5s");
        clearTimeout(pollingTimer);
        checkConnection(); // Миттєва перевірка
    }
}

function scheduleNextPoll() {
    pollingTimer = setTimeout(async () => {
        await checkConnection();
        
        // Логіка збільшення інтервалу
        const timeSinceAction = Date.now() - lastUserActionTime;
        
        if (timeSinceAction > 60000) { // Якщо юзер не активний більше хвилини
            currentPollingInterval = Math.min(currentPollingInterval * POLLING_GROWTH_FACTOR, POLLING_MAX_INTERVAL);
        } else {
            currentPollingInterval = POLLING_MIN_INTERVAL;
        }

        // console.log(`Next poll in ${Math.round(currentPollingInterval/1000)}s`);
        scheduleNextPoll();
    }, currentPollingInterval);
}

// === HEALTH CHECK ===
async function checkConnection() {
    const dot = document.getElementById('statusDot');
    try {
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        if (res.ok) {
            dot.classList.add('connected');
            dot.classList.remove('disconnected');
        } else { throw new Error(); }
    } catch (e) {
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
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { headers: HEADERS });
        const data = await res.json();
        
        resultsDiv.innerHTML = '';
        if (data.results && data.results.length > 0) {
            data.results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<b>${item.name}</b><small>${item.id}</small>`;
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
        console.error(e);
    } finally {
        // Ховаємо спіннер
        spinner.classList.add('hidden');
    }
}

// === КАРТКА ТОВАРУ ТА СПИСОК ===
function addToCart(item) {
    const globalAction = document.getElementById('globalActionType').value;
    
    // Додаємо поле action для кожного товару окремо
    cart.push({ 
        ...item, 
        inputQty: 0,
        action: globalAction // Встановлюємо дефолтну дію
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
window.removeFromCart = function(id) {
    tg.showConfirm("Видалити?", (ok) => { 
        if (ok) { cart = cart.filter(i => i.id !== id); render(); } 
    });
}
window.changeItemAction = function(id, val) {
    updateItemAction(id, val);
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
        
        // Вибір дії (Select)
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
                    <p>На складі: <b>${item.quantity}</b> | ${item.location}</p>
                </div>
            </div>
            
            <div class="item-card-row">
                ${selectHtml}
                <div class="qty-control">
                    <span>К-сть:</span>
                    <input type="number" class="qty-input" placeholder="0" 
                        value="${item.inputQty || ''}" 
                        oninput="updateQty('${item.id}', this.value)">
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.id}')">🗑</button>
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
    
    try {
        const payload = {
            user_id: tg.initDataUnsafe?.user?.id,
            user_name: tg.initDataUnsafe?.user?.first_name,
            items: cart.map(i => ({ 
                id: i.id, 
                qty: i.inputQty,
                action: i.action // Відправляємо індивідуальну дію
            }))
        };

        const res = await fetch(`${API_BASE}/api/submit_order`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            tg.showAlert("✅ Успішно!\n" + data.details.join('\n'));
            cart = [];
            render();
        } else {
            tg.showAlert("❌ Помилка сервера: " + data.error);
        }

    } catch (e) {
        tg.showAlert("❌ Помилка: " + e.message);
    }
    tg.MainButton.hideProgress();
}

// === ЛОГИ ===
function showLogs() {
    document.getElementById('logsModal').classList.remove('hidden');
    // Показуємо локальні логи при відкритті
    document.getElementById('logsArea').textContent = debugLogs.join('\n') || "Локальні логи пусті.";
}

function clearLocalLogs() {
    debugLogs.length = 0;
    document.getElementById('logsArea').textContent = "Логи очищено.";
}

async function fetchServerLogs() {
    const area = document.getElementById('logsArea');
    area.textContent = "Завантаження з сервера...";
    try {
        const res = await fetch(`${API_BASE}/api/logs`, { headers: HEADERS });
        const data = await res.json();
        area.textContent = data.logs;
    } catch (e) {
        area.textContent = "Помилка завантаження: " + e.message;
    }
}

async function copyAllLogs() {
    try {
        // Качаємо ПОВНІ логи з сервера
        const res = await fetch(`${API_BASE}/api/logs?all=true`, { headers: HEADERS });
        const data = await res.json();
        const fullText = `=== LOCAL LOGS ===\n${debugLogs.join('\n')}\n\n=== SERVER LOGS ===\n${data.logs}`;
        
        await navigator.clipboard.writeText(fullText);
        tg.showAlert("✅ Всі логи скопійовано в буфер обміну!");
    } catch (e) {
        tg.showAlert("❌ Помилка копіювання: " + e.message);
    }
}

// === VIRTUAL CONSOLE (Зберігаємо код з попереднього кроку) ===
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { 
    debugLogs.push(`[INFO] ${args.join(' ')}`); 
    if(debugLogs.length > 200) debugLogs.shift();
    originalLog.apply(console, args); 
};
console.error = (...args) => { 
    debugLogs.push(`[ERROR] ${args.join(' ')}`); 
    if(debugLogs.length > 200) debugLogs.shift();
    originalError.apply(console, args); 
};

// ... (Функції fetchItem, getApiUrl, theme, startScan - без змін) ...
async function fetchItem(id) {
    tg.MainButton.showProgress();
    try {
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}`, { headers: HEADERS });
        const data = await res.json();
        if (data.error) tg.showAlert(`❌ ${data.error}`);
        else addToCart(data);
    } catch (e) { tg.showAlert(`❌ ${e.message}`); }
    tg.MainButton.hideProgress();
}

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
function saveApiUrl() {
    const val = document.getElementById('apiUrlInput').value.trim();
    API_BASE = val.replace(/\/$/, "");
    localStorage.setItem('vuzoll_api_url', API_BASE);
    tg.showAlert("URL збережено.");
    resetPolling();
}
function startScan() {
    if (!API_BASE) { tg.showAlert("⚠️ Немає API URL!"); return; }
    tg.showScanQrPopup({ text: "Наведи на QR-код" }, (text) => {
        tg.closeScanQrPopup();
        if (cart.find(i => i.id === text)) { tg.showAlert("⚠️ Вже в списку!"); return; }
        fetchItem(text);
    });
}
function restoreTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') { document.body.classList.add('light-theme'); updateTgColors(true); } 
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