document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    API_BASE = localStorage.getItem('vuzoll_api_url') || "";
    if (!API_BASE) { window.location.href = "index.html"; return; }

    restoreTheme(); // з utils.js

    // Listeners
    document.getElementById('backBtn').onclick = () => window.location.href = "index.html";
    document.getElementById('createPartBtn').onclick = () => openForm(null);
    document.getElementById('closeFormBtn').onclick = closeForm;
    document.getElementById('partForm').onsubmit = handleSave;
    document.getElementById('deletePartBtn').onclick = handleDelete;

    // Load initial data
    loadParts();
    loadOptions();
});

async function loadParts() {
    const container = document.getElementById('partsContainer');
    const userId = getTelegramUserId();
    container.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';

    try {
        const res = await fetch(`${API_BASE}/api/parts?user_id=${userId}`, { headers: HEADERS });
        if (res.status === 403) { container.innerHTML = "<p>Access Denied</p>"; return; }

        const data = await res.json();
        const items = data.items || [];

        container.innerHTML = '';
        if (items.length === 0) { container.innerHTML = "<p style='text-align:center'>Список пустий</p>"; return; }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'part-card';
            card.innerHTML = `
                <div class="part-icon">🔧</div>
                <div class="part-info">
                    <div class="part-title">${item.name}</div>
                    <div class="part-meta">
                        <span>🆔 ${item.id.slice(0, 8)}...</span>
                        <span>📦 Лок: ${item.location}</span>
                    </div>
                </div>
                <div class="part-actions">
                    <div class="mini-btn" onclick="openForm('${item.id}')">✏️</div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
    }
}

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
    el.innerHTML = '<option value="">Оберіть...</option>';
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
    const saveBtn = document.querySelector('.save-btn-large');
    const form = document.getElementById('partForm');

    form.reset(); // Очистити поля

    if (id) {
        // Редагування
        formTitle.textContent = "Редагування деталі";
        deleteBtn.classList.remove('hidden');
        saveBtn.textContent = "Зберегти зміни";

        showLoading("Завантаження даних...");
        try {
            // Отримуємо повні дані деталі
            const res = await fetch(`${API_BASE}/api/get_item?id=${id}&user_id=${getTelegramUserId()}`, { headers: HEADERS });
            const item = await res.json();

            // Заповнюємо форму
            for (const [key, value] of Object.entries(item)) {
                const input = form.elements[key];
                if (input) input.value = value;
            }
            // Специфічні поля
            form.elements['qty_in_pack'].value = item.qty_in_pack || '';
            // ... заповнити всі інші поля ...

        } catch (e) {
            alert("Error loading details");
            closeForm();
        } finally { hideLoading(); }

    } else {
        // Створення
        formTitle.textContent = "Створення нової деталі";
        deleteBtn.classList.add('hidden');
        saveBtn.textContent = "Створити деталь";
    }

    formView.classList.remove('hidden');
}

function closeForm() {
    document.getElementById('formView').classList.add('hidden');
}

async function handleSave(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Додаємо ID, якщо це редагування
    if (currentPartId) data.id = currentPartId;

    showLoading("Збереження...");
    try {
        const payload = {
            user_id: getTelegramUserId(),
            is_new: !currentPartId,
            part: data
        };

        const res = await fetch(`${API_BASE}/api/parts/save`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            closeForm();
            loadParts(); // Оновити список
        } else {
            alert("Помилка: " + result.error);
        }
    } catch (err) {
        alert("Помилка збереження: " + err.message);
    } finally {
        hideLoading();
    }
}

async function handleDelete() {
    if (!confirm("Ви точно хочете видалити цю деталь?")) return;

    showLoading("Видалення...");
    try {
        const res = await fetch(`${API_BASE}/api/parts/delete?id=${currentPartId}&user_id=${getTelegramUserId()}`, {
            method: 'DELETE', headers: HEADERS
        });
        const result = await res.json();
        if (result.success) {
            closeForm();
            loadParts();
        } else {
            alert("Помилка: " + result.error);
        }
    } catch (e) { alert(e.message); }
    finally { hideLoading(); }
}