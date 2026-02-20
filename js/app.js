const tg = window.Telegram.WebApp;
tg.expand();

// Стан додатка
let cart = [];
let API_BASE = "";

// === ІНІЦІАЛІЗАЦІЯ ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. Отримуємо API URL (з параметра або пам'яті)
    API_BASE = getApiUrl();
    
    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) {
        input.value = API_BASE;
    }

    // 2. Відновлюємо тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateTgColors(true);
    } else {
        updateTgColors(false);
    }

    // 3. Вішаємо події на кнопки (щоб не засмічувати HTML)
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
});

// === ЛОГІКА URL ===
function getApiUrl() {
    // Пробуємо взяти з query string (?api=...)
    const urlParams = new URLSearchParams(window.location.search);
    const paramApi = urlParams.get('api');
    
    if (paramApi) {
        // Зберігаємо новий URL
        const cleanUrl = paramApi.replace(/\/$/, ""); // Прибрати слеш в кінці
        localStorage.setItem('vuzoll_api_url', cleanUrl);
        return cleanUrl;
    }
    
    // Якщо немає в параметрах, беремо старий
    return localStorage.getItem('vuzoll_api_url') || "";
}

function saveApiUrl() {
    const val = document.getElementById('apiUrlInput').value.trim();
    API_BASE = val.replace(/\/$/, "");
    localStorage.setItem('vuzoll_api_url', API_BASE);
    tg.showAlert("URL збережено вручну.");
}

// === ЛОГІКА ТЕМИ ===
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateTgColors(isLight);
}

function updateTgColors(isLight) {
    if (isLight) {
        tg.setHeaderColor('#ffffff');
        tg.setBackgroundColor('#f2f2f7');
    } else {
        tg.setHeaderColor('#2c2c2e');
        tg.setBackgroundColor('#1c1c1e');
    }
}

// === СКАНУВАННЯ ТА API ===
function startScan() {
    if (!API_BASE) {
        tg.showAlert("⚠️ Немає API URL! Перезапусти бота або введи URL вручну.");
        return;
    }

    tg.showScanQrPopup({
        text: "Наведи на QR-код"
    }, (text) => {
        tg.closeScanQrPopup();
        
        // Перевірка на дублікати
        if (cart.find(i => i.id === text)) {
            tg.showAlert("⚠️ Цей товар вже є в списку!");
            return;
        }
        
        fetchItem(text);
    });
}

async function fetchItem(id) {
    tg.MainButton.showProgress();
    try {
        const res = await fetch(`${API_BASE}/api/get_item?id=${id}`);
        const data = await res.json();
        
        if (data.error) {
            tg.showAlert(`❌ Помилка: ${data.error}`);
        } else {
            addToCart(data);
        }
    } catch (e) {
        tg.showAlert(`❌ Немає зв'язку з ботом!\nError: ${e.message}`);
    }
    tg.MainButton.hideProgress();
}

// === КОШИК (CART) ===
function addToCart(item) {
    cart.push({ ...item, inputQty: 0 });
    render();
}

function removeFromCart(id) {
    tg.showConfirm("Видалити цей товар зі списку?", (ok) => {
        if (ok) {
            cart = cart.filter(i => i.id !== id);
            render();
        }
    });
}

// Функція викликається з HTML (oninput) - тут треба зробити глобальний доступ
// Або краще додати event delegation, але для простоти залишимо так:
window.updateQty = function(id, val) {
    const item = cart.find(i => i.id === id);
    if (item) item.inputQty = parseInt(val) || 0;
}
window.removeFromCart = removeFromCart; // Експорт для HTML

function render() {
    const list = document.getElementById('itemList');
    const btn = document.getElementById('submitBtn');

    if (cart.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 40px; margin-bottom: 10px;">📷</div>
                <p>Кошик пустий</p>
                <p>Натисни "Скан", щоб додати деталі</p>
            </div>`;
        btn.disabled = true;
        btn.innerText = "Зберегти (0)";
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
                    <p>ID: ...${item.id.slice(-6)}</p>
                    <p>На складі: <b>${item.quantity}</b> | ${item.location}</p>
                </div>
            </div>
            <div class="card-actions">
                <button class="remove-btn" onclick="removeFromCart('${item.id}')">🗑</button>
                <div class="qty-control">
                    <span>Кількість:</span>
                    <input type="number" class="qty-input" placeholder="0" 
                        value="${item.inputQty || ''}"
                        oninput="updateQty('${item.id}', this.value)">
                </div>
            </div>
        `;
        list.appendChild(el);
    });

    btn.disabled = false;
    btn.innerText = `Зберегти (${cart.length})`;
}

// === ВІДПРАВКА ===
async function submitOrder() {
    if (!API_BASE) return;
    
    // Валідація
    const emptyItems = cart.filter(i => !i.inputQty || i.inputQty <= 0);
    if (emptyItems.length > 0) {
        tg.showAlert("⚠️ Вкажи кількість для всіх товарів!");
        return;
    }

    const action = document.getElementById('actionType').value;
    
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            tg.showAlert("✅ Успішно збережено!\n" + data.details.join('\n'));
            cart = [];
            render();
        } else {
            tg.showAlert("❌ Помилка сервера: " + data.error);
        }

    } catch (e) {
        tg.showAlert("❌ Помилка з'єднання: " + e.message);
    }
    tg.MainButton.hideProgress();
}