// === MAIN ENTRY POINT ===

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Init. UserID:", getTelegramUserId());
    
    // 1. URL Init
    const p = new URLSearchParams(window.location.search).get('api');
    if (p) { 
        API_BASE = p.replace(/\/$/, ""); 
        localStorage.setItem('vuzoll_api_url', API_BASE);
    } else {
        API_BASE = localStorage.getItem('vuzoll_api_url') || "";
    }

    const input = document.getElementById('apiUrlInput');
    if (input && API_BASE) input.value = API_BASE;

    restoreTheme();
    initMenu();

    // 2. Global Listeners
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('submitBtn').addEventListener('click', submitOrder);
    
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(handleSearch, 500));
    searchInput.addEventListener('focus', resetPolling);

    // Logs & Modals Listeners
    document.getElementById('logsBtn').addEventListener('click', showLogs);
    document.getElementById('closeLogs').addEventListener('click', () => document.getElementById('logsModal').classList.add('hidden'));
    document.getElementById('copyLogsBtn').addEventListener('click', copyLocalLogs);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLocalLogs);
    
    document.getElementById('closeResultBtn').addEventListener('click', () => document.getElementById('resultModal').classList.add('hidden'));
    document.getElementById('copyResultBtn').addEventListener('click', copyResultText);

    // Admin Page Listeners
    const inviteBtn = document.getElementById('inviteUserBtn');
    if(inviteBtn) inviteBtn.onclick = inviteNewUser;
    
    const refreshPartsBtn = document.getElementById('refreshPartsBtn');
    if(refreshPartsBtn) refreshPartsBtn.onclick = loadPartsPage;

    // Polling Activity Reset
    document.addEventListener('click', resetPolling);
    document.addEventListener('touchstart', resetPolling);

    // 3. Start
    if (API_BASE) {
        checkConnection();
        checkUserRole().then(() => {
            // Сховати пункти меню, якщо немає прав (додаткова UI перевірка)
            if (currentUserRole !== 'admin') {
                const navUsers = document.getElementById('navUsers');
                if(navUsers) navUsers.style.display = 'none';
            }
            if (!['admin', 'manager'].includes(currentUserRole)) {
                const navParts = document.getElementById('navParts');
                if(navParts) navParts.style.display = 'none';
            }
        });
        scheduleNextPoll();
    }
});

// Helpers for main.js specific logic
function addToCart(item) {
    const globalAction = document.getElementById('globalActionType').value;
    if(cart.find(i => i.id === item.id)) { tg.showAlert("⚠️ Вже є!"); return; }
    cart.push({ ...item, inputQty: 0, action: globalAction });
    renderCart();
}

function startScan() {
    if (!API_BASE) { tg.showAlert("⚠️ Немає API URL!"); return; }
    tg.showScanQrPopup({ text: "QR-код" }, (text) => { tg.closeScanQrPopup(); fetchItem(text); });
}

function saveApiUrl() {
    const val = document.getElementById('apiUrlInput').value.trim();
    API_BASE = val.replace(/\/$/, "");
    localStorage.setItem('vuzoll_api_url', API_BASE);
    tg.showAlert("URL збережено.");
    resetPolling();
    checkConnection();
}

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