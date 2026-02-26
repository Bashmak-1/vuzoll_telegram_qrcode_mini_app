// === UI RENDERING ===

// --- Loading Modal ---
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

// --- Result & Logs Modals ---
function showResultModal(lines) {
    const text = lines.join('\n');
    document.getElementById('resultText').textContent = text;
    document.getElementById('resultModal').classList.remove('hidden');
}

function showLogs() {
    document.getElementById('logsModal').classList.remove('hidden');
    document.getElementById('logsArea').textContent = debugLogs.join('\n') || "Empty";
}

function clearLocalLogs() {
    debugLogs.length = 0;
    document.getElementById('logsArea').textContent = "Empty";
}

// --- Status Dot ---
function updateConnectionStatus(isConnected) {
    const dot = document.getElementById('statusDot');
    if (isConnected) {
        dot.className = 'status-dot connected';
    } else {
        dot.className = 'status-dot disconnected';
    }
}

// --- Role UI Update ---
function updateRoleUI(role) {
    const badge = document.getElementById('userRoleBadge');
    badge.textContent = role;
    badge.className = `role-badge ${role}`;

    // Якщо гість - блокуємо інтерфейс
    if (role === 'guest' || role === 'offline') {
        const search = document.getElementById('searchInput');
        search.disabled = true;
        search.placeholder = "⛔ Немає доступу";
        
        document.getElementById('scanBtn').disabled = true;
        document.getElementById('scanBtn').style.opacity = "0.5";
        document.getElementById('globalActionType').disabled = true;
        
        // tg.showAlert("⛔ Немає доступу. Зверніться до адміністратора."); // Можна розкоментувати
    }

    // Налаштування селекта глобальної дії
    const globalSelect = document.getElementById('globalActionType');
    const options = globalSelect.options;
    const isAdmin = ['admin', 'manager'].includes(role);
    
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === 'restock' || options[i].value === 'fact') {
            options[i].hidden = !isAdmin;
            options[i].disabled = !isAdmin; 
        }
    }
    
    // Скидання значення, якщо вибрано недоступне
    if (!isAdmin && (globalSelect.value === 'restock' || globalSelect.value === 'fact')) {
        globalSelect.value = 'take';
    }

    // Оновлення доступності меню
    const menuUsers = document.getElementById('menuUsers');
    const menuParts = document.getElementById('menuParts');
    if (menuUsers) menuUsers.disabled = role !== 'admin';
    if (menuParts) menuParts.disabled = !['admin', 'manager'].includes(role);
}

// --- Cart Rendering ---
function renderCart() {
    const list = document.getElementById('itemList');
    const btn = document.getElementById('submitBtn');

    if (cart.length === 0) {
        list.innerHTML = `<div class="empty-state"><div style="font-size: 40px; margin-bottom: 10px;">📷</div><p>Кошик пустий</p></div>`;
        btn.disabled = true; 
        btn.innerText = "Зберегти (0)"; 
        return;
    }

    list.innerHTML = "";
    const isAdmin = ['admin', 'manager'].includes(currentUserRole);

    cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'card';
        
        let selectOptions = `<option value="take" ${item.action === 'take' ? 'selected' : ''}>🔻 Взяти</option>`;
        if (isAdmin) {
            selectOptions += `
                <option value="restock" ${item.action === 'restock' ? 'selected' : ''}>🚚 Додати</option>
                <option value="fact" ${item.action === 'fact' ? 'selected' : ''}>📋 Факт</option>
            `;
        }

        // HTML Картки
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
                <select class="item-action-select" onchange="window.changeItemAction('${item.id}', this.value)">
                    ${selectOptions}
                </select>
                <div class="qty-control">
                    <input type="number" class="qty-input" placeholder="0" 
                        value="${item.inputQty || ''}" 
                        oninput="window.updateQty('${item.id}', this.value)">
                </div>
                <button class="remove-btn" onclick="window.removeFromCart('${item.id}')">✖</button>
            </div>
        `;
        list.appendChild(el);
    });

    btn.disabled = false; 
    btn.innerText = `Зберегти (${cart.length})`;
}

// --- Window Functions (для HTML onchange/onclick) ---
window.updateQty = function(id, val) { 
    const item = cart.find(i => i.id === id); 
    if (item) item.inputQty = parseInt(val) || 0; 
}
window.changeItemAction = function(id, val) { 
    const item = cart.find(i => i.id === id); 
    if (item) item.action = val; 
}
window.removeFromCart = function(id) { 
    tg.showConfirm("Видалити?", (ok) => { 
        if (ok) { 
            cart = cart.filter(i => i.id !== id); 
            renderCart(); 
        } 
    }); 
}