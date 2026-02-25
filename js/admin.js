// === ADMIN PAGES LOGIC (users & parts) ===

// USERS MANAGEMENT (ADMIN ONLY)
let usersLoadedOnce = false;

async function loadUsersPage() {
    const container = document.getElementById('usersList');
    const body = document.getElementById('usersPageBody');
    if (!container || !body) return;

    const userId = getTelegramUserId();
    if (!userId) {
        container.innerHTML = '<p class="hint-text">User ID не знайдено. Перезапустіть міні‑ап або зверніться до адміна.</p>';
        return;
    }

    showLoading('Завантаження користувачів...');
    try {
        container.innerHTML = '<p class="hint-text">Завантаження...</p>';
        const res = await fetch(`${API_BASE}/api/admin/users?user_id=${userId}`, { headers: HEADERS });

        if (res.status === 403 || res.status === 401) {
            container.innerHTML = '<p class="hint-text">⛔ Немає прав admin для перегляду користувачів.</p>';
            return;
        }

        const data = await res.json();
        const users = data.users || data.result || [];

        if (!Array.isArray(users) || users.length === 0) {
            container.innerHTML = '<p class="hint-text">Користувачів не знайдено.</p>';
            return;
        }

        container.innerHTML = '';
        users.forEach(u => {
            const id = u.user_id || u.id || '—';
            const name = u.name || u.username || `User ${id}`;
            const role = u.role || 'unknown';

            const div = document.createElement('div');
            div.className = 'simple-card';
            div.innerHTML = `
                <div class="simple-card-header">
                    <span>${name}</span>
                    <span class="simple-badge">${role}</span>
                </div>
                <div style="font-family: monospace; font-size: 12px; color: var(--hint-color);">user_id: ${id}</div>
            `;
            container.appendChild(div);
        });

        usersLoadedOnce = true;
    } catch (e) {
        console.error('Load users error:', e);
        container.innerHTML = '<p class="hint-text">❌ Помилка завантаження користувачів.</p>';
    } finally {
        hideLoading();
    }
}

async function inviteNewUser() {
    const status = document.getElementById('inviteStatus');
    const userId = getTelegramUserId();
    if (!status) return;

    if (!userId) {
        status.textContent = 'User ID не знайдено.';
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 3000);
        return;
    }

    status.textContent = 'Створення посилання...';
    status.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE}/api/admin/invite?user_id=${userId}`, { headers: HEADERS });
        if (res.status === 403 || res.status === 401) {
            status.textContent = '⛔ Немає прав admin для запрошень.';
            setTimeout(() => status.classList.add('hidden'), 3000);
            return;
        }

        const data = await res.json();
        const link = data.link || data.url || data.invite_url;
        if (!link) {
            status.textContent = '❌ Бекенд не повернув посилання.';
            setTimeout(() => status.classList.add('hidden'), 3000);
            return;
        }

        await navigator.clipboard.writeText(link);
        status.textContent = 'Посилання скопійовано в буфер обміну.';
        setTimeout(() => status.classList.add('hidden'), 3000);
    } catch (e) {
        console.error('Invite user error:', e);
        status.textContent = '❌ Помилка створення посилання.';
        setTimeout(() => status.classList.add('hidden'), 3000);
    }
}

// PARTS MANAGEMENT (ADMIN + MANAGER)
async function loadPartsPage() {
    const list = document.getElementById('partsList');
    if (!list) return;

    const userId = getTelegramUserId();
    if (!userId) {
        list.innerHTML = '<p class="hint-text">User ID не знайдено. Перезапустіть міні‑ап.</p>';
        return;
    }

    showLoading('Завантаження деталей...');
    try {
        list.innerHTML = '<p class="hint-text">Завантаження...</p>';

        const res = await fetch(`${API_BASE}/api/parts?user_id=${userId}`, { headers: HEADERS });
        if (res.status === 403 || res.status === 401) {
            list.innerHTML = '<p class="hint-text">⛔ Немає прав для перегляду деталей.</p>';
            return;
        }

        const data = await res.json();
        const items = data.items || data.results || data.details || [];

        if (!Array.isArray(items) || items.length === 0) {
            list.innerHTML = '<p class="hint-text">Деталей не знайдено.</p>';
            return;
        }

        list.innerHTML = '';
        items.forEach(item => {
            const id = item.id || item.code || '—';
            const name = item.name || 'Без назви';
            const qty = item.quantity ?? item.qty ?? '—';
            const location = item.location || item.place || '—';

            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `
                <div class="card-header">
                    <div class="item-icon">🔧</div>
                    <div class="item-details">
                        <h3>${name}</h3>
                        <div class="item-id-full">${id}</div>
                        <p>Склад: <b>${qty}</b> | ${location}</p>
                    </div>
                </div>
            `;
            list.appendChild(el);
        });
    } catch (e) {
        console.error('Load parts error:', e);
        list.innerHTML = '<p class="hint-text">❌ Помилка завантаження деталей.</p>';
    } finally {
        hideLoading();
    }
}

// DOM bindings for admin actions
document.addEventListener('DOMContentLoaded', () => {
    const inviteBtn = document.getElementById('inviteUserBtn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', inviteNewUser);
    }
    const reloadPartsBtn = document.getElementById('reloadPartsBtn');
    if (reloadPartsBtn) {
        reloadPartsBtn.addEventListener('click', () => loadPartsPage());
    }
});

