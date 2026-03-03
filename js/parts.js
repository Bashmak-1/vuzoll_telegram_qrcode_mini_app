document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.setBackgroundColor('#121212');
    tg.setHeaderColor('#1e1e1e');

    API_BASE = localStorage.getItem('vuzoll_api_url') || "";
    if (!API_BASE) { window.location.href = "index.html"; return; }

    // Listeners
    document.getElementById('backBtn').onclick = () => window.location.href = "index.html";
    document.getElementById('createPartBtn').onclick = () => openForm(null);
    document.getElementById('closeFormBtn').onclick = closeForm;
    document.getElementById('partForm').onsubmit = handleSave;
    document.getElementById('deletePartBtn').onclick = handleDelete;

    // Fake bulk save just for UI interaction
    document.getElementById('bulkSaveBtn').onclick = () => {
        tg.showAlert("Функція масового збереження в розробці");
    };

    loadParts();
    loadOptions();
});

let selectedCount = 0;

async function loadParts() {
    const container = document.getElementById('partsContainer');
    const userId = getTelegramUserId();
    container.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';

    try {
        const res = await fetch(`${API_BASE}/api/parts?user_id=${userId}`, { headers: HEADERS });
        if (res.status === 403) { container.innerHTML = "<p style='color:white; text-align:center'>Access Denied</p>"; return; }

        const data = await res.json();
        const items = data.items || [];

        container.innerHTML = '';
        if (items.length === 0) { container.innerHTML = "<p style='text-align:center; color:#888;'>Список пустий</p>"; return; }

        let total = items.length;
        let critical = 0;

        items.forEach(item => {
            // Data Parsing
            const qty = parseInt(item.quantity) || 0;
            const minStockRobots = parseInt(item.min_stock) || 0;
            const perRobot = parseInt(item.qty_per_robot) || 1;
            const minStockTotal = minStockRobots * perRobot;

            // Status Logic
            let statusText = "В наявності";
            let statusClass = "st-good";
            let progressClass = "fill-green";
            let progressWidth = "100%";

            if (qty <= 0) {
                statusText = "Критично / Замовити";
                statusClass = "st-crit";
                progressClass = "fill-red";
                progressWidth = "10%";
                critical++;
            } else if (qty < minStockTotal) {
                statusText = "Скоро мінімум";
                statusClass = "st-warn";
                progressClass = "fill-yellow";
                progressWidth = "40%";
            } else {
                // Calculation for width relative to a safe buffer (e.g. 2x min stock)
                const safeStock = minStockTotal * 2 || 10;
                let pct = (qty / safeStock) * 100;
                if (pct > 100) pct = 100;
                progressWidth = `${pct}%`;
            }

            // Price Logic
            const packQty = item.qty_in_pack || 1;
            const packPrice = parseFloat(item.pack_price) || 0;
            const pricePerItem = packQty > 0 ? (packPrice / packQty).toFixed(2) : "0.00";

            const card = document.createElement('div');
            card.className = 'part-card';

            card.innerHTML = `
                <div class="card-header-row">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" onchange="toggleSelect(this)">
                    </div>
                    <div class="part-icon-box">🔧</div>
                    <div class="part-titles">
                        <div class="part-name">${item.name}</div>
                        <div class="part-id">${item.id}</div>
                    </div>
                    <div class="card-actions">
                         <button class="edit-icon-btn" onclick="openForm('${item.id}')">✏️</button>
                         <button class="menu-icon-btn">⋮</button>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-item"><span class="info-icon">📂</span> ${item.category || '-'}</div>
                    <div class="info-item"><span class="info-icon">📏</span> ${item.unit || 'шт.'}</div>
                    <div class="info-item"><span class="info-icon">📍</span> ${item.location || '-'}</div>
                    <div class="info-item"><span class="info-icon">🏭</span> ${item.supplier || '-'}</div>
                    <div class="info-item"><span class="info-icon">📄</span> ${item.doc_name || '-'}</div>
                    <div class="info-item">
                        <span class="info-icon">🔗</span> 
                        ${item.link
                    ? `<a href="${item.link}" target="_blank" class="part-link">${item.link}</a>`
                    : '-'}
                    </div>
                </div>

                <div class="price-row">
                    <div>💰 Ціна/шт: ${pricePerItem} грн.</div>
                    <div>📦 Упак: ${packQty} / ${packPrice} грн.</div>
                </div>

                <div class="progress-section">
                    <div class="progress-bg">
                        <div class="progress-fill ${progressClass}" style="width: ${progressWidth}"></div>
                    </div>
                </div>

                <div class="card-footer-stats">
                    Склад: <span class="stat-val ${statusClass}">${qty}</span>
                    <span class="stat-separator">/</span>
                    Мін: <span class="stat-val">${minStockTotal}</span> ${item.unit || 'шт.'}
                    <span class="stat-separator">|</span>
                    На роб: <span class="stat-val">${perRobot}</span>
                    <span class="stat-separator">|</span>
                    Статус: <span class="status-text ${statusClass}">${statusText}</span>
                </div>
            `;
            container.appendChild(card);
        });

        // Update Summaries
        document.getElementById('totalCount').innerText = total;
        document.getElementById('criticalCount').innerText = critical;

        document.getElementById('footerTotal').innerText = total;
        document.getElementById('footerCrit').innerText = critical;

    } catch (e) {
        container.innerHTML = `<p style="color:red; text-align:center">Error: ${e.message}</p>`;
    }
}

// Checkbox Logic for Footer
window.toggleSelect = function (el) {
    if (el.checked) selectedCount++;
    else selectedCount--;
    if (selectedCount < 0) selectedCount = 0;
    document.getElementById('selectedCount').innerText = selectedCount;
}

// --- FORM & OPTIONS (from previous version, slightly adjusted) ---
async function loadOptions() {
    try {
        const res = await fetch(`${API_BASE}/api/parts/options`, { headers: HEADERS });
        const data = await res.json();
        const catSelect = document.getElementById('catSelect');
        const unitSelect = document.getElementById('unitSelect');
        populateSelect(catSelect, data.categories);
        populateSelect(unitSelect, data.units);
    } catch (e) { console.error(e); }
}

function populateSelect(el, items) {
    el.innerHTML = '<option value="">-</option>';
    items.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        el.appendChild(opt);
    });
}

// === FORM HANDLING ===
let currentPartId = null;

async function openForm(id) {
    currentPartId = id;
    const formView = document.getElementById('formView');
    const formTitle = document.getElementById('formTitle');
    const deleteBtn = document.getElementById('deletePartBtn');
    const form = document.getElementById('partForm');

    form.reset();

    if (id) {
        formTitle.textContent = "Редагування";
        deleteBtn.style.display = 'block';
        showLoading("Завантаження...");
        try {
            const res = await fetch(`${API_BASE}/api/get_item?id=${id}&user_id=${getTelegramUserId()}`, { headers: HEADERS });
            const item = await res.json();
            for (const [key, value] of Object.entries(item)) {
                const input = form.elements[key];
                if (input) input.value = value;
            }
        } catch (e) {
            alert("Error"); closeForm();
        } finally { hideLoading(); }
    } else {
        formTitle.textContent = "Створення";
        deleteBtn.style.display = 'none';
    }
    formView.style.display = 'block';
}

function closeForm() {
    document.getElementById('formView').style.display = 'none';
}

async function handleSave(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    if (currentPartId) data.id = currentPartId;

    showLoading("Збереження...");
    try {
        const payload = {
            user_id: getTelegramUserId(),
            is_new: !currentPartId,
            part: data
        };
        const res = await fetch(`${API_BASE}/api/parts/save`, {
            method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) { closeForm(); loadParts(); }
        else { alert("Помилка: " + result.error); }
    } catch (err) { alert("Помилка: " + err.message); }
    finally { hideLoading(); }
}

async function handleDelete() {
    if (!confirm("Видалити?")) return;
    showLoading("Видалення...");
    try {
        const res = await fetch(`${API_BASE}/api/parts/delete?id=${currentPartId}&user_id=${getTelegramUserId()}`, {
            method: 'DELETE', headers: HEADERS
        });
        const result = await res.json();
        if (result.success) { closeForm(); loadParts(); }
        else { alert("Error: " + result.error); }
    } catch (e) { alert(e.message); }
    finally { hideLoading(); }
}