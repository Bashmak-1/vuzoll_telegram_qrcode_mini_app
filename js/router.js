// === ROUTING & MENU ===

function initMenu() {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('sideMenuOverlay');
    const btn = document.getElementById('burgerBtn');
    const close = document.getElementById('closeMenuBtn');

    if (!menu || !overlay || !btn || !close) return;

    function toggle(show) {
        if(show) { 
            menu.classList.add('open'); 
            overlay.classList.remove('hidden');
            menu.classList.remove('hidden');
        } else { 
            menu.classList.remove('open'); 
            overlay.classList.add('hidden'); 
        }
    }

    btn.onclick = () => toggle(true);
    close.onclick = () => toggle(false);
    overlay.onclick = () => toggle(false);

    // Обробка кліків по пунктах
    document.querySelectorAll('.menu-item').forEach(item => {
        item.onclick = () => {
            const page = item.dataset.page;
            navigateTo(page);
            toggle(false);
        };
    });
}

function navigateTo(pageId) {
    // Перевірка прав
    if (pageId === 'users' && currentUserRole !== 'admin') {
        tg.showAlert("⛔ Тільки для Admin");
        return;
    }
    if (pageId === 'parts' && !['admin', 'manager'].includes(currentUserRole)) {
        tg.showAlert("⛔ Тільки для Admin/Manager");
        return;
    }

    // Ховаємо всі сторінки
    document.querySelectorAll('.page-block').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    // Показуємо потрібну
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.remove('hidden');
    
    const activeMenuItem = document.querySelector(`.menu-item[data-page="${pageId}"]`);
    if (activeMenuItem) activeMenuItem.classList.add('active');

    // Логіка для хедера
    if (pageId === 'home') {
        document.getElementById('mainPageControls').classList.remove('hidden');
        document.getElementById('pageTitle').textContent = "Склад";
    } else {
        document.getElementById('mainPageControls').classList.add('hidden');
    }

    if (pageId === 'users') {
        document.getElementById('pageTitle').textContent = "Користувачі";
        loadUsersPage();
    }
    if (pageId === 'parts') {
        document.getElementById('pageTitle').textContent = "Всі деталі";
        loadPartsPage();
    }
}