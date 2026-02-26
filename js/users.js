document.addEventListener('DOMContentLoaded', () => {
    // 1. Ініціалізація (копіюємо базові речі)
    const tg = window.Telegram.WebApp;
    tg.expand();

    // Відновлюємо URL API з пам'яті (бо це окрема сторінка)
    API_BASE = localStorage.getItem('vuzoll_api_url') || "";

    if (!API_BASE) {
        alert("Помилка: API URL не знайдено. Зайдіть спочатку на головну сторінку.");
        window.location.href = "index.html";
        return;
    }

    restoreTheme();

    // 2. Кнопка "Назад"
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = "index.html"; // Повернення на головну
    });

    // 3. Кнопка "Запросити"
    document.getElementById('inviteUserBtn').addEventListener('click', inviteNewUser);

    // 4. Завантаження списку
    loadUsers();
});

async function loadUsers() {
    const container = document.getElementById('usersListContainer');
    const userId = getTelegramUserId(); // Функція з utils.js

    try {
        const res = await fetch(`${API_BASE}/api/admin/users?user_id=${userId}`, { headers: HEADERS });

        if (res.status === 403) {
            container.innerHTML = '<p style="text-align:center; color: #ff453a;">⛔ Доступ заборонено (Тільки Admin)</p>';
            return;
        }

        const data = await res.json();
        const users = data.users || [];

        container.innerHTML = ''; // Очистити спінер

        if (users.length === 0) {
            container.innerHTML = '<p style="text-align:center; color: #888;">Список пустий</p>';
            return;
        }

        // Рендеринг карток
        users.forEach(u => {
            const card = document.createElement('div');
            card.className = 'user-card';

            // Визначаємо клас для кольору бейджа
            let badgeClass = 'role-worker';
            if (u.role === 'admin') badgeClass = 'role-admin';
            if (u.role === 'manager') badgeClass = 'role-manager';

            // Іконка (перша літера імені)
            const initial = (u.name || 'U')[0].toUpperCase();

            card.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <div class="user-avatar">${initial}</div>
                    <div class="user-info">
                        <span class="user-name">${u.name}</span>
                        <div class="user-id">ID: ${u.id}</div>
                    </div>
                </div>
                <div class="role-select-badge ${badgeClass}">
                    ${u.role.toUpperCase()}
                </div>
            `;
            container.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="text-align:center; color: red;">Помилка: ${e.message}</p>`;
    }
}

async function inviteNewUser() {
    showLoading("Генерація посилання...");
    try {
        const data = await apiCall('/api/admin/invite');
        if (data.link) {
            await navigator.clipboard.writeText(data.link);
            tg.showAlert("✅ Посилання скопійовано в буфер обміну!");
        } else {
            tg.showAlert("❌ Помилка: " + (data.error || "Unknown"));
        }
    } catch (e) {
        tg.showAlert("❌ " + e.message);
    } finally {
        hideLoading();
    }
}