// === API REQUESTS ===

// Універсальна функція запиту
async function apiCall(endpoint, method = 'GET', body = null) {
    if (!API_BASE) throw new Error("API URL not set");
    
    let url = `${API_BASE}${endpoint}`;
    const userId = getTelegramUserId();
    
    // Додаємо user_id до GET запитів
    if (method === 'GET' && userId) {
        url += (url.includes('?') ? '&' : '?') + `user_id=${userId}`;
    }

    const options = { method, headers: HEADERS };
    if (body) {
        if (!body.user_id && userId) body.user_id = userId;
        options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    
    const type = res.headers.get("content-type");
    if(type && !type.includes("json")) throw new Error("Server returned HTML (Ngrok Warning?)");

    if (res.status === 403 || res.status === 401) throw new Error("Access Denied");
    
    return await res.json();
}

// --- Core Functions ---

async function checkConnection() {
    if (!API_BASE) {
        updateConnectionStatus(false);
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/health`, { headers: HEADERS });
        updateConnectionStatus(res.ok);
    } catch (e) {
        console.warn("Ping failed");
        updateConnectionStatus(false);
    }
}

async function checkUserRole() {
    const userId = getTelegramUserId();
    if (!userId) {
        updateRoleUI('guest');
        return;
    }
    try {
        const data = await apiCall('/api/me');
        currentUserRole = data.role || 'worker';
        updateRoleUI(currentUserRole);
    } catch (e) {
        console.error("Role check error:", e);
        updateRoleUI('offline');
    }
}

async function fetchItem(id) {
    showLoading("Отримання даних...");
    try {
        console.log("Fetching", id);
        const data = await apiCall(`/api/get_item?id=${id}`);
        if (data.error) tg.showAlert(`❌ ${data.error}`);
        else addToCart(data);
    } catch (e) { 
        console.error(e);
        tg.showAlert(`❌ ${e.message}`); 
    } finally {
        hideLoading();
    }
}

async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    const spinner = document.getElementById('searchSpinner');

    if (query.length < 2) { resultsDiv.classList.add('hidden'); return; }

    spinner.classList.remove('hidden');
    try {
        await new Promise(r => setTimeout(r, 300)); // UX delay
        const data = await apiCall(`/api/search?q=${encodeURIComponent(query)}`);
        
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

async function submitOrder() {
    if (!API_BASE) return;
    
    const empty = cart.filter(i => i.inputQty <= 0);
    if(empty.length > 0) { tg.showAlert("⚠️ Введіть кількість!"); return; }

    showLoading("Збереження...", true);
    
    const totalItems = cart.length;
    const results = [];
    let successCount = 0;
    const userId = getTelegramUserId();

    try {
        for (let i = 0; i < totalItems; i++) {
            const item = cart[i];
            document.getElementById('loadingText').textContent = `Збереження: ${i + 1} з ${totalItems}`;
            updateProgress(Math.round(((i) / totalItems) * 100));

            const payload = {
                user_name: tg.initDataUnsafe?.user?.first_name,
                items: [{ id: item.id, qty: item.inputQty, action: item.action }]
            };

            // Використовуємо прямий fetch тут, бо нам потрібна кастомна обробка помилок для кожного елемента
            // (хоча можна переробити на apiCall, але залишимо як є для надійності циклу)
            if(!payload.user_id && userId) payload.user_id = userId;
            
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
            await new Promise(r => setTimeout(r, 100)); 
        }

        updateProgress(100);
        await new Promise(r => setTimeout(r, 300)); 
        showResultModal(results);
        
        if (successCount > 0) {
            cart = [];
            renderCart();
        }
    } catch (e) {
        console.error("Submit error:", e);
        tg.showAlert("❌ Помилка: " + e.message);
    } finally {
        hideLoading();
    }
}

// --- Admin API Functions ---

async function loadUsersPage() {
    const list = document.getElementById('usersList');
    if(!list) return;
    list.innerHTML = '<div class="spinner"></div>';
    
    try {
        const data = await apiCall('/api/admin/users');
        list.innerHTML = '';
        if (data.users && data.users.length > 0) {
            data.users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'data-item';
                div.innerHTML = `
                    <div class="data-info"><b>${u.name}</b><span>ID: ${u.id}</span></div>
                    <div class="role-badge ${u.role}">${u.role}</div>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<p class="hint-text">Список пустий</p>';
        }
    } catch (e) {
        list.innerHTML = `<p style="color:red">Помилка: ${e.message}</p>`;
    }
}

async function inviteNewUser() {
    const status = document.getElementById('inviteStatus');
    if(!status) return;
    status.textContent = 'Генерація...';
    status.classList.remove('hidden');
    
    try {
        const data = await apiCall('/api/admin/invite');
        if (data.link) {
            await navigator.clipboard.writeText(data.link);
            status.textContent = 'Посилання скопійовано!';
        } else {
            status.textContent = 'Помилка генерації';
        }
    } catch (e) {
        status.textContent = 'Помилка: ' + e.message;
    }
    setTimeout(() => status.classList.add('hidden'), 3000);
}

async function loadPartsPage() {
    const list = document.getElementById('partsList');
    if(!list) return;
    list.innerHTML = '<div class="spinner"></div>';
    try {
        const data = await apiCall('/api/parts');
        list.innerHTML = '';
        if (data.items) {
            data.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'data-item';
                div.innerHTML = `<div class="data-info"><b>${item.name}</b><span>${item.id}</span></div>`;
                list.appendChild(div);
            });
        }
    } catch (e) {
        list.innerHTML = `<p style="color:red">${e.message}</p>`;
    }
}