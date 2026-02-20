const tg = window.Telegram.WebApp;
tg.expand();

// === ВІРТУАЛЬНА КОНСОЛЬ (Перехоплення логів) ===
const debugLogs = [];
const MAX_LOGS = 200;

function safeStringify(obj) {
    try {
        if (typeof obj === 'object') return JSON.stringify(obj);
        return String(obj);
    } catch (e) {
        return '[Cyclic/Complex Object]';
    }
}

function addLog(type, args) {
    const time = new Date().toLocaleTimeString();
    const message = args.map(a => safeStringify(a)).join(' ');
    debugLogs.push(`[${time}] [${type}] ${message}`);
    if (debugLogs.length > MAX_LOGS) debugLogs.shift();
}

// Перехоплюємо стандартні методи консолі
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => { addLog('INFO', args); originalLog.apply(console, args); };
console.error = (...args) => { addLog('ERROR', args); originalError.apply(console, args); };
console.warn = (...args) => { addLog('WARN', args); originalWarn.apply(console, args); };

// Перехоплюємо глобальні помилки (crash)
window.onerror = function(msg, url, line, col, error) {
    addLog('CRASH', [`${msg}\nAt: ${url}:${line}:${col}`, error ? error.stack : '']);
    return false;
};

// Перехоплюємо помилки промісів (fetch і т.д.)
window.addEventListener('unhandledrejection', function(event) {
    addLog('PROMISE', [event.reason]);
});

// === ОСНОВНИЙ КОД ===
let cart = [];
let API_BASE = "";

// Заголовки для обходу Ngrok Warning
const HEADERS = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true" 
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App started. Telegram SDK ready.");
    
    API_BASE = getApiUrl();
    console.log("🔗 API URL:", API_BASE || "Not set");

    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) input.value = API_BASE;

    restoreTheme();

    // Listeners
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
    
    // Пошук
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 500));
    
    // Логи
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    
    // Кнопка в модалці тепер очищає логи, а не оновлює з сервера
    const refreshBtn = document.getElementById('refreshLogs');
    refreshBtn.innerText = "🗑 Очистити";
    refreshBtn.onclick = clearLogs;

    // Запуск перевірки зв'язку
    if (API_BASE) {
        checkConnection();
        setInterval(checkConnection, 10000); 
    }
});

// === ЗВ'ЯЗОК ===
async function checkConnection() {
    const dot = document.getElementById('statusDot');
    try {
        // console.log("Pinging health..."); // Можна розкоментувати для дебагу
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        if (res.ok) {
            dot.classList.add('connected');
            dot.classList.remove('disconnected');
        } else {
            throw new Error(`Status: ${res.status}`);
        }
    } catch (e) {
        console.warn("Connection lost:", e.message);
        dot.classList.remove('connected');
        dot.classList.add('disconnected');
    }
}

// === ПОШУК ===
let debounceTimer;
function debounce(func, timeout = 500){
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }

    console.log("🔍 Searching:", query);

    try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { headers: HEADERS });
        const data = await res.json();
        
        resultsDiv.innerHTML = '';
        if (data.results && data.results.length > 0) {
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
    } catch (e) {
        console.error("Search error:", e);
    }
}

// === ЛОГИ (Frontend) ===
function showLogs() {
    document.getElementById('logsModal').classList.remove('hidden');
    renderLogs();
}

function renderLogs() {
    const area = document.getElementById('logsArea');
    if (debugLogs.length === 0) {
        area.textContent = "Логів поки немає...";
    } else {
        area.textContent = debugLogs.join('\n');
    }
    area.scrollTop = area.scrollHeight;
}

function clearLogs() {
    debugLogs.length = 0;
    renderLogs();
}

// === ОСНОВНІ ФУНКЦІЇ ===
async function fetchItem(id) {
    console.log("Fetching item:", id);
    tg.MainButton.showProgress();
    try {
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}`, { headers: HEADERS });
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
             const text = await res.text();
             // Логуємо початок HTML, щоб зрозуміти помилку
             throw new Error(`Invalid JSON (HTML received): ${text.substring(0, 100)}...`);
        }

        const data = await res.json();
        
        if (data.error) {
            console.error("API Error:", data.error);
            tg.showAlert(`❌ Помилка: ${data.error}`);
        } else {
            console.log("Item received:", data.name);
            addToCart(data);
        }
    } catch (e) {
        console.error("Fetch failed:", e);
        tg.showAlert(`❌ Помилка: ${e.message}`);
    }
    tg.MainButton.hideProgress();
}

async function submitOrder() {
    if (!API_BASE) return;
    
    const action = document.getElementById('actionType').value;
    console.log("Submitting order:", action, cart);
    tg.MainButton.showProgress();
    
    try {
        const payload = {
            user_id: tg.initDataUnsafe?.user?.id,
            user_name: tg.initDataUnsafe?.user?.first_name,
            action: action,
            items: cart.map(i => ({ id: i.id, qty: i.inputQty }))
        };

        const res = await fetch(`${API_BASE}/api/submit_order`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            console.log("Order success!");
            tg.showAlert("✅ Успішно!\n" + data.details.join('\n'));
            cart = [];
            render();
        } else {
            console.error("Server returned error:", data.error);
            tg.showAlert("❌ Помилка сервера: " + data.error);
        }

    } catch (e) {
        console.error("Submit failed:", e);
        tg.showAlert("❌ Помилка: " + e.message);
    }
    tg.MainButton.hideProgress();
}

function restoreTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateTgColors(true);
    } else {
        updateTgColors(false);
    }
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
    checkConnection();
}
function startScan() {
    if (!API_BASE) { tg.showAlert("⚠️ Немає API URL!"); return; }
    tg.showScanQrPopup({ text: "Наведи на QR-код" }, (text) => {
        tg.closeScanQrPopup();
        if (cart.find(i => i.id === text)) { tg.showAlert("⚠️ Вже в списку!"); return; }
        fetchItem(text);
    });
}
function addToCart(item) { cart.push({ ...item, inputQty: 0 }); render(); }
function removeFromCart(id) {
    tg.showConfirm("Видалити?", (ok) => { if (ok) { cart = cart.filter(i => i.id !== id); render(); } });
}
window.updateQty = function(id, val) { const item = cart.find(i => i.id === id); if (item) item.inputQty = parseInt(val) || 0; }
window.removeFromCart = removeFromCart;
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
        el.innerHTML = `
            <div class="card-header"><div class="item-icon">📦</div><div class="item-details"><h3>${item.name}</h3><p>ID: ...${item.id.slice(-6)}</p><p>На складі: <b>${item.quantity}</b> | ${item.location}</p></div></div>
            <div class="card-actions"><button class="remove-btn" onclick="removeFromCart('${item.id}')">🗑</button><div class="qty-control"><span>К-сть:</span><input type="number" class="qty-input" placeholder="0" value="${item.inputQty || ''}" oninput="updateQty('${item.id}', this.value)"></div></div>`;
        list.appendChild(el);
    });
    btn.disabled = false; btn.innerText = `Зберегти (${cart.length})`;
}