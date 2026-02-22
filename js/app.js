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
const debugLogs = [];
const HEADERS = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };

// === HELPER: GET USER ID ===
// Єдине місце, де ми беремо ID. Якщо його немає - повертаємо 0 або null.
function getTelegramUserId() {
    return tg.initDataUnsafe?.user?.id || null;
}

// === LOGGING SETUP ===
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function addLog(type, args) {
    const time = new Date().toLocaleTimeString();
    // Перетворюємо об'єкти в текст, щоб не було [object Object]
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    debugLogs.push(`[${time}] [${type}] ${msg}`);
    if(debugLogs.length > 200) debugLogs.shift();
}

console.log = (...args) => { addLog('INF', args); originalLog.apply(console, args); };
console.error = (...args) => { addLog('ERR', args); originalError.apply(console, args); };
console.warn = (...args) => { addLog('WRN', args); originalWarn.apply(console, args); };
window.onerror = (msg, url, line) => { console.error(`CRASH: ${msg} @ ${line}`); };

// === USER ROLE ===
let currentUserRole = 'worker';

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Init. UserID:", getTelegramUserId());
    
    API_BASE = getApiUrl();
    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) input.value = API_BASE;
    restoreTheme();

    // Event Listeners
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
    
    // Search
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(handleSearch, 500));
    // Будь-яка взаємодія скидає таймер "сну"
    searchInput.addEventListener('focus', resetPolling);

    // Logs & Result Modals
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    document.getElementById('copyLogsBtn').addEventListener('click', copyLocalLogs);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLocalLogs);
    
    document.getElementById('closeResultBtn').addEventListener('click', () => document.getElementById('resultModal').classList.add('hidden'));
    document.getElementById('copyResultBtn').addEventListener('click', copyResultText);

    // Polling logic
    document.addEventListener('click', resetPolling);
    document.addEventListener('touchstart', resetPolling);

    if (API_BASE) {
        checkConnection(); // Миттєва перевірка при старті
        checkUserRole();
        scheduleNextPoll();
    }
});

// === ROLE CHECK ===
async function checkUserRole() {
    const userId = getTelegramUserId();
    if (!userId) {
        updateRoleUI('guest');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/me?user_id=${userId}`, { headers: HEADERS });
        const data = await res.json();
        
        if (data.error) {
            currentUserRole = 'guest';
        } else {
            currentUserRole = data.role || 'worker';
        }
        updateRoleUI(currentUserRole);
    } catch (e) {
        console.error("Role check failed", e);
        updateRoleUI('offline');
    }
}

function updateRoleUI(role) {
    const badge = document.getElementById('userRoleBadge');
    badge.textContent = role;
    badge.className = `role-badge ${role}`;

    if (role === 'guest' || role === 'offline') {
        const search = document.getElementById('searchInput');
        search.disabled = true;
        search.placeholder = "⛔ Немає доступу";
        
        document.getElementById('scanBtn').disabled = true;
        document.getElementById('scanBtn').style.opacity = "0.5";
        
        document.getElementById('globalActionType').disabled = true;
        
        tg.showAlert("⛔ Доступ заборонено (User ID не знайдено або немає в базі). Зверніться до адміністратора.");
        return;
    }

    const globalSelect = document.getElementById('globalActionType');
    const options = globalSelect.options;
    const isAdmin = ['admin', 'manager'].includes(role);
    
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === 'restock' || options[i].value === 'fact') {
            options[i].hidden = !isAdmin;
            options[i].disabled = !isAdmin; 
        }
    }
    
    if (!isAdmin && (globalSelect.value === 'restock' || globalSelect.value === 'fact')) {
        globalSelect.value = 'take';
    }
}

// === LOADING MODAL ===
function showLoading(text, showProgress = false) {
    const modal = document.getElementById('loadingModal');
    document.getElementById('loadingText').textContent = text;
    const progContainer = document.getElementById('progressContainer');
    if (showProgress) {
        progContainer.classList.remove('hidden');
        updateProgress(0);
    } else {
        progContainer.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function updateProgress(percent) {
    document.getElementById('progressBar').style.width = `${percent}%`;
}

function hideLoading() {
    document.getElementById('loadingModal').classList.add('hidden');
}

// === SUBMIT ===
async function submitOrder() {
    if (!API_BASE) return;
    
    const empty = cart.filter(i => i.inputQty <= 0);
    if(empty.length > 0) {
        tg.showAlert("⚠️ Введіть кількість для всіх товарів!");
        return;
    }

    showLoading("Збереження...", true);
    
    const totalItems = cart.length;
    const results = [];
    let successCount = 0;
    const userId = getTelegramUserId(); // Беремо ID

    try {
        for (let i = 0; i < totalItems; i++) {
            const item = cart[i];
            document.getElementById('loadingText').textContent = `Збереження: ${i + 1} з ${totalItems}`;
            updateProgress(Math.round(((i) / totalItems) * 100));

            const payload = {
                user_id: userId, // <-- Передаємо ID
                user_name: tg.initDataUnsafe?.user?.first_name,
                items: [{ 
                    id: item.id, 
                    qty: item.inputQty,
                    action: item.action 
                }]
            };

            const res = await fetch(`${API_BASE}/api/submit_order`, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            
            if (data.success && data.details) {
                results.push(...data.details);
                successCount++;
            } else {
                results.push(`❌ ${item.name}: ${data.error || 'Error'}`);
            }

            // Невелика затримка для краси (щоб око бачило прогрес)
            // Можна прибрати, якщо треба максимальна швидкість
            await new Promise(r => setTimeout(r, 100)); 
        }

        updateProgress(100);
        await new Promise(r => setTimeout(r, 300)); 
        showResultModal(results);
        
        if (successCount > 0) {
            cart = [];
            render();
        }

    } catch (e) {
        console.error("Submit error:", e);
        tg.showAlert("❌ Помилка: " + e.message);
    } finally {
        hideLoading();
    }
}

function showResultModal(lines) {
    const text = lines.join('\n');
    document.getElementById('resultText').textContent = text;
    document.getElementById('resultModal').classList.remove('hidden');
}

function copyResultText() {
    const text = document.getElementById('resultText').textContent;
    navigator.clipboard.writeText(text);
    tg.showAlert("Скопійовано!");
}

// === CONNECTION ===
function saveApiUrl() {
    const val = document.getElementById('apiUrlInput').value.trim();
    API_BASE = val.replace(/\/$/, "");
    localStorage.setItem('vuzoll_api_url', API_BASE);
    
    console.log("URL updated manually:", API_BASE);
    
    // Миттєва перевірка
    checkConnection();
}

async function checkConnection() {
    const dot = document.getElementById('statusDot');
    if (!API_BASE) {
        dot.className = 'status-dot disconnected';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        if (res.ok) dot.className = 'status-dot connected';
        else throw new Error(res.status);
    } catch (e) {
        console.warn("Connection check failed:", e.message);
        dot.className = 'status-dot disconnected';
    }
}

// === FETCH ITEM ===
async function fetchItem(id) {
    showLoading("Отримання...");
    try {
        console.log("Fetching", id);
        const userId = getTelegramUserId(); // Беремо ID
        
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}&user_id=${userId}`, { headers: HEADERS });
        const type = res.headers.get("content-type");
        
        if(type && !type.includes("json")) throw new Error("Ngrok Warning Page");
        if (res.status === 403 || res.status === 401) throw new Error("Access denied");

        const data = await res.json();
        if (data.error) tg.showAlert(`❌ ${data.error}`);
        else addToCart(data);
    } catch (e) { 
        console.error(e);
        tg.showAlert(`❌ ${e.message}`); 
    } finally {
        hideLoading();
    }
}

// === POLLING ===
function resetPolling() {
    lastUserActionTime = Date.now();
    if (currentPollingInterval > POLLING_MIN_INTERVAL) {
        currentPollingInterval = POLLING_MIN_INTERVAL;
        clearTimeout(pollingTimer);
        checkConnection(); 
    }
}

function scheduleNextPoll() {
    pollingTimer = setTimeout(async () => {
        await checkConnection();
        const idleTime = Date.now() - lastUserActionTime;
        if (idleTime > 60000) currentPollingInterval = Math.min(currentPollingInterval * POLLING_GROWTH_FACTOR, POLLING_MAX_INTERVAL);
        else currentPollingInterval = POLLING_MIN_INTERVAL;
        scheduleNextPoll();
    }, currentPollingInterval);
}

// === HELPERS ===
let debounceTimer;
function debounce(func, timeout){
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// === ПОШУК ===
async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    const spinner = document.getElementById('searchSpinner');
    const userId = getTelegramUserId(); // Беремо ID

    if (query.length < 2) { resultsDiv.classList.add('hidden'); return; }

    // Показуємо спіннер
    spinner.classList.remove('hidden');

    try {
        // Штучна затримка 300мс, щоб око побачило спіннер на ПК
        await new Promise(r => setTimeout(r, 300)); // UX delay

        console.log(`🔍 Searching: "${query}"`);
        
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&user_id=${userId}`, { headers: HEADERS });
        
        if (res.status === 403 || res.status === 401) {
            tg.showAlert("⛔ Доступ заборонено!");
            return;
        }

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
    const globalAction = document.getElementById('globalActionType').value;
    if(cart.find(i => i.id === item.id)) { tg.showAlert("⚠️ Вже є!"); return; }
    cart.push({ ...item, inputQty: 0, action: globalAction });
    render();
}

function updateItemAction(id, newAction) {
    const item = cart.find(i => i.id === id);
    if (item) item.action = newAction;
}
window.updateQty = function(id, val) { const item = cart.find(i => i.id === id); if (item) item.inputQty = parseInt(val) || 0; }
window.changeItemAction = function(id, val) { const item = cart.find(i => i.id === id); if (item) item.action = val; }
window.removeFromCart = function(id) { tg.showConfirm("Видалити?", (ok) => { if (ok) { cart = cart.filter(i => i.id !== id); render(); } }); }

// === RENDER ===
function render() {
    const list = document.getElementById('itemList');
    const btn = document.getElementById('submitBtn');

    if (cart.length === 0) {
        list.innerHTML = `<div class="empty-state"><div style="font-size: 40px; margin-bottom: 10px;">📷</div><p>Кошик пустий</p></div>`;
        btn.disabled = true; btn.innerText = "Зберегти (0)"; return;
    }

    list.innerHTML = "";
    const isAdmin = ['admin', 'manager'].includes(currentUserRole);

    cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'card';
        let selectOptions = `<option value="take" ${item.action === 'take' ? 'selected' : ''}>🔻 Взяти</option>`;
        if (isAdmin) {
            selectOptions += `<option value="restock" ${item.action === 'restock' ? 'selected' : ''}>🚚 Додати</option>
                              <option value="fact" ${item.action === 'fact' ? 'selected' : ''}>📋 Факт</option>`;
        }
        const selectHtml = `<select class="item-action-select" onchange="changeItemAction('${item.id}', this.value)">${selectOptions}</select>`;

        el.innerHTML = `
            <div class="card-header"><div class="item-icon">📦</div><div class="item-details"><h3>${item.name}</h3><div class="item-id-full">${item.id}</div><p>Склад: <b>${item.quantity}</b> | ${item.location}</p></div></div>
            <div class="item-card-row">${selectHtml}<div class="qty-control"><input type="number" class="qty-input" placeholder="0" value="${item.inputQty || ''}" oninput="updateQty('${item.id}', this.value)"></div><button class="remove-btn" onclick="removeFromCart('${item.id}')">✖</button></div>`;
        list.appendChild(el);
    });
    btn.disabled = false; btn.innerText = `Зберегти (${cart.length})`;
}

function getApiUrl() {
    const p = new URLSearchParams(window.location.search).get('api');
    if (p) { const u = p.replace(/\/$/, ""); localStorage.setItem('vuzoll_api_url', u); return u; }
    return localStorage.getItem('vuzoll_api_url') || "";
}
function startScan() {
    if (!API_BASE) { tg.showAlert("⚠️ Немає API URL!"); return; }
    tg.showScanQrPopup({ text: "QR-код" }, (text) => { tg.closeScanQrPopup(); fetchItem(text); });
}
function restoreTheme() { const t = localStorage.getItem('theme'); if (t === 'light') { document.body.classList.add('light-theme'); updateTgColors(true); } else { updateTgColors(false); } }
function toggleTheme() { document.body.classList.toggle('light-theme'); const isLight = document.body.classList.contains('light-theme'); localStorage.setItem('theme', isLight ? 'light' : 'dark'); updateTgColors(isLight); }
function updateTgColors(isLight) { if (isLight) { tg.setHeaderColor('#ffffff'); tg.setBackgroundColor('#f2f2f7'); } else { tg.setHeaderColor('#2c2c2e'); tg.setBackgroundColor('#1c1c1e'); } }
function showLogs() { document.getElementById('logsModal').classList.remove('hidden'); document.getElementById('logsArea').textContent = debugLogs.join('\n') || "Empty"; }
function clearLocalLogs() { debugLogs.length = 0; document.getElementById('logsArea').textContent = "Empty"; }
function copyLocalLogs() { navigator.clipboard.writeText(debugLogs.join('\n')).then(() => tg.showAlert("Copied!")); }