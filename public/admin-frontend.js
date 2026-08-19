// admin-frontend.js – полная версия с партнёрскими тарифами
// + автоматическая регулировка отступа под шапку

const API_BASE = '/api/admin';
let activityChart = null;

let currentListingsPage = 1, totalListingsPages = 1;
let currentUsersPage = 1, totalUsersPages = 1;
let currentLogsPage = 1, totalLogsPages = 1;
let currentUserActionsPage = 1, totalUserActionsPages = 1;
let currentComplaintsPage = 1, totalComplaintsPages = 1;
let currentContactPage = 1, totalContactPages = 1;
let currentSubscriptionsPage = 1, totalSubscriptionsPages = 1;
let partnerPlansList = []; // для выпадающих списков

let expandedRegions = {};

const settingLabels = {
    'hcaptcha_enabled': 'Включить hCaptcha',
    'hcaptcha_site_key': 'Публичный ключ hCaptcha',
    'price_listing': 'Стоимость размещения (₽)',
    'price_renewal': 'Стоимость продления (₽)',
    'price_autobump': 'Стоимость автопилота (₽)',
    'price_listing_period': 'Период размещения (дней)',
    'price_renewal_period': 'Период продления (дней)',
    'price_autobump_period': 'Период автопилота (дней)',
};

// ========== АВТОМАТИЧЕСКАЯ РЕГУЛИРОВКА ОТСТУПА ПОД ШАПКУ ==========
function adjustAdminHeaderOffset() {
    const header = document.querySelector('.admin-header');
    if (!header) return;
    const headerHeight = header.offsetHeight;
    document.body.style.paddingTop = (headerHeight + 5) + 'px';
}
window.addEventListener('load', adjustAdminHeaderOffset);
window.addEventListener('resize', adjustAdminHeaderOffset);
window.addEventListener('orientationchange', function() {
    setTimeout(adjustAdminHeaderOffset, 300);
});
const originalPushState = history.pushState;
history.pushState = function() {
    originalPushState.apply(this, arguments);
    setTimeout(adjustAdminHeaderOffset, 100);
};
const originalReplaceState = history.replaceState;
history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    setTimeout(adjustAdminHeaderOffset, 100);
};

// ========== ВСПОМОГАТЕЛЬНЫЕ ==========
function getToken() { return localStorage.getItem('token'); }

async function apiFetch(url, options = {}) {
    const token = getToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        }
    });
    if (res.status === 403) {
        alert('Доступ запрещён. У вас нет прав администратора.');
        window.location.href = '/';
        return null;
    }
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Ошибка сервера');
    }
    return res.json();
}

function renderPagination(containerId, current, total, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (total <= 1) { container.innerHTML = ''; return; }
    let html = `<button onclick="(${callback.toString()})(${current-1})" ${current===1?'disabled':''}>◀ Назад</button>`;
    for (let i=Math.max(1, current-2); i<=Math.min(total, current+2); i++)
        html += `<button onclick="(${callback.toString()})(${i})" class="${i===current?'active':''}">${i}</button>`;
    html += `<button onclick="(${callback.toString()})(${current+1})" ${current===total?'disabled':''}>Вперёд ▶</button>`;
    container.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

function formatAction(action) {
    const map = {
        'login': '🔑 Вход',
        'logout': '🚪 Выход',
        'register': '📝 Регистрация',
        'change_username': '✏️ Смена имени',
        'change_password': '🔐 Смена пароля',
        'reset_password': '🔄 Восстановление пароля',
        'update_profile': '📋 Обновление профиля',
        'create_listing': '➕ Создание объявления',
        'edit_listing': '✏️ Редактирование объявления',
        'archive_listing': '📦 Архивация объявления',
        'restore_listing': '🔄 Восстановление из архива',
        'delete_listing_permanent': '🗑️ Удаление объявления',
        'bump_listing': '🚀 Поднятие объявления',
        'delete_media': '🖼️ Удаление медиа',
        'set_main_photo': '⭐ Установка главного фото',
        'complaint_listing': '🚨 Жалоба',
        'delete_account': '❌ Удаление аккаунта'
    };
    return map[action] || action;
}

// ========== СТАТИСТИКА ==========
async function loadStats() {
    try {
        const general = await apiFetch(`${API_BASE}/stats`);
        const statsGrid = document.getElementById('statsNumbers');
        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="stat-card"><div class="stat-number">${general.totalUsers||0}</div><div class="stat-label">👥 Пользователей</div></div>
                <div class="stat-card"><div class="stat-number">${general.totalListings||0}</div><div class="stat-label">📦 Объявлений</div></div>
                <div class="stat-card"><div class="stat-number">${general.totalChats||0}</div><div class="stat-label">💬 Чатов</div></div>
                <div class="stat-card"><div class="stat-number">${general.pendingComplaints||0}</div><div class="stat-label">⏳ Жалоб ожидает</div></div>
                <div class="stat-card"><div class="stat-number">${general.blockedListings||0}</div><div class="stat-label">🚫 Заблок. объявлений</div></div>
                <div class="stat-card"><div class="stat-number">${general.blockedUsers||0}</div><div class="stat-label">🚷 Заблок. пользователей</div></div>
            `;
        }
        await updatePeriodStats();
    } catch(e) { console.error(e); }
}

async function updatePeriodStats() {
    const start = document.getElementById('statsStartDate')?.value || '';
    const end = document.getElementById('statsEndDate')?.value || '';
    try {
        const data = await apiFetch(`${API_BASE}/stats/period?start_date=${start}&end_date=${end}`);
        const ctx = document.getElementById('activityChart')?.getContext('2d');
        if (!ctx) return;
        if (activityChart) activityChart.destroy();
        const labels = data.stats.map(s => s.day);
        const newUsers = data.stats.map(s => s.new_users);
        const newListings = data.stats.map(s => s.new_listings);
        const newChats = data.stats.map(s => s.new_chats);
        activityChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'Новые пользователи', data: newUsers, borderColor: '#2c3e66', fill: false },
                { label: 'Новые объявления', data: newListings, borderColor: '#f59e0b', fill: false },
                { label: 'Новые чаты', data: newChats, borderColor: '#10b981', fill: false }
            ]}
        });
    } catch(e) { console.error(e); }
}

// ========== ОБЪЯВЛЕНИЯ ==========
async function loadListings(page) {
    currentListingsPage = page;
    const search = document.getElementById('listingSearch')?.value || '';
    const status = document.getElementById('listingStatusFilter')?.value || '';
    const userId = document.getElementById('listingUserId')?.value || '';
    const showDeleted = document.getElementById('listingShowDeleted')?.value === 'true';
    const url = `${API_BASE}/listings?page=${page}&limit=15&search=${encodeURIComponent(search)}&status=${status}&user_id=${userId}&showDeleted=${showDeleted}`;
    try {
        const data = await apiFetch(url);
        const tbody = document.querySelector('#listingsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = data.listings.map(l => {
            const isDeleted = !!l.deleted_at;
            const statusText = isDeleted ? '🗑️ Удалено' : (l.status === 'blocked' ? '🔴 Заблокировано' : (l.status === 'archived' ? '📦 Архив' : '🟢 Активно'));
            let actions = `<button class="btn btn-primary btn-sm" onclick="window.open('/listing.html?id=${l.id}','_blank')">👁️</button>`;
            if (!isDeleted) {
                if (l.status !== 'blocked') actions += `<button class="btn btn-warning btn-sm block-listing" data-id="${l.id}">🚫 Заблокировать</button>`;
                else actions += `<button class="btn btn-primary btn-sm unblock-listing" data-id="${l.id}">🔓 Разблокировать</button>`;
                actions += `<button class="btn btn-danger btn-sm delete-listing" data-id="${l.id}">🗑️ Удалить</button>`;
            } else {
                actions += `<button class="btn btn-success btn-sm restore-listing" data-id="${l.id}">🔄 Восстановить</button>`;
            }
            return `<tr><td>${l.id}</td><td>${escapeHtml(l.title)}</td><td>${escapeHtml(l.username)} (${l.user_id})</td><td>${l.price} ₽</td><td>${statusText}</td><td>${actions}</td></tr>`;
        }).join('');
        totalListingsPages = data.pages;
        renderPagination('listingsPagination', currentListingsPage, totalListingsPages, (p) => loadListings(p));
        attachListingActions();
    } catch(e) { alert('Ошибка загрузки объявлений'); }
}

function attachListingActions() {
    document.querySelectorAll('.block-listing').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.id;
            const reason = prompt('Причина блокировки:');
            if (reason === null) return;
            await apiFetch(`${API_BASE}/listings/${id}/block`, { method: 'POST', body: JSON.stringify({ reason }) });
            loadListings(currentListingsPage);
        };
    });
    document.querySelectorAll('.unblock-listing').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Разблокировать объявление?'))
                await apiFetch(`${API_BASE}/listings/${btn.dataset.id}/unblock`, { method: 'POST' });
            loadListings(currentListingsPage);
        };
    });
    document.querySelectorAll('.delete-listing').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Удалить объявление (мягкое удаление)?')) {
                await apiFetch(`${API_BASE}/listings/${btn.dataset.id}`, { method: 'DELETE' });
                loadListings(currentListingsPage);
            }
        };
    });
    document.querySelectorAll('.restore-listing').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Восстановить объявление?')) {
                await apiFetch(`${API_BASE}/listings/${btn.dataset.id}/restore`, { method: 'POST' });
                loadListings(currentListingsPage);
            }
        };
    });
}

// ========== КАТЕГОРИИ ==========
async function loadCategoriesTree() {
    const container = document.getElementById('categoriesTreeContainer');
    if (!container) return;
    try {
        const tree = await apiFetch(`${API_BASE}/categories/tree`);
        renderCategoryTree(tree, container);
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="error">Ошибка загрузки дерева категорий</div>';
    }
}

function renderCategoryTree(nodes, container, level = 0) {
    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<div class="empty">Нет категорий. Нажмите «Добавить корневую группу».</div>';
        return;
    }
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    for (const node of nodes) {
        const li = document.createElement('li');
        li.style.margin = '0.5rem 0';
        li.style.padding = '0.25rem 0';
        li.style.borderLeft = '2px solid #e2e8f0';
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'category-node';
        nodeDiv.style.display = 'flex';
        nodeDiv.style.alignItems = 'center';
        nodeDiv.style.gap = '0.5rem';
        nodeDiv.style.flexWrap = 'wrap';
        nodeDiv.style.background = '#f8fafc';
        nodeDiv.style.padding = '0.5rem 0.75rem';
        nodeDiv.style.borderRadius = '12px';
        nodeDiv.style.marginLeft = `${level * 0.5}rem`;
        const hasChildren = node.children && node.children.length > 0;
        let toggleHtml = '';
        if (hasChildren) toggleHtml = `<span class="toggle" style="cursor:pointer; font-family:monospace; width:20px; display:inline-block; text-align:center;">▼</span>`;
        else toggleHtml = `<span style="width:20px; display:inline-block;"></span>`;
        nodeDiv.innerHTML = `
            ${toggleHtml}
            <span class="category-name" style="font-weight:500; flex:1;">${node.icon ? node.icon + ' ' : ''}${escapeHtml(node.name)} (slug: ${escapeHtml(node.slug)}) ${node.is_active ? '✅' : '❌'}</span>
            <div class="category-actions" style="display:flex; gap:0.3rem;">
                <button class="btn btn-sm btn-primary edit-category" data-id="${node.id}">✏️</button>
                ${node.is_active ? `<button class="btn btn-sm btn-warning delete-category" data-id="${node.id}">🗑️ Скрыть</button>` : `<button class="btn btn-sm btn-success restore-category" data-id="${node.id}">🔄 Восстановить</button>`}
                <button class="btn btn-sm btn-secondary add-subcategory" data-id="${node.id}">➕ Подкатегорию</button>
            </div>
        `;
        li.appendChild(nodeDiv);
        if (hasChildren) {
            const childUl = document.createElement('ul');
            childUl.style.listStyle = 'none';
            childUl.style.paddingLeft = '1.5rem';
            childUl.style.marginTop = '0.25rem';
            childUl.style.display = 'block';
            renderCategoryTree(node.children, childUl, level + 1);
            li.appendChild(childUl);
            const toggleSpan = nodeDiv.querySelector('.toggle');
            if (toggleSpan) toggleSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                if (childUl.style.display === 'none') { childUl.style.display = 'block'; toggleSpan.textContent = '▼'; }
                else { childUl.style.display = 'none'; toggleSpan.textContent = '▶'; }
            });
        }
        ul.appendChild(li);
    }
    container.innerHTML = '';
    container.appendChild(ul);
    document.querySelectorAll('.edit-category').forEach(btn => btn.onclick = () => openCategoryModal(btn.dataset.id));
    document.querySelectorAll('.delete-category').forEach(btn => btn.onclick = () => deleteCategory(btn.dataset.id));
    document.querySelectorAll('.restore-category').forEach(btn => btn.onclick = () => restoreCategory(btn.dataset.id));
    document.querySelectorAll('.add-subcategory').forEach(btn => btn.onclick = () => openCategoryModal(null, btn.dataset.id));
}

async function openCategoryModal(categoryId = null, parentId = null) {
    const modal = document.getElementById('categoryModal');
    const title = document.getElementById('categoryModalTitle');
    const idField = document.getElementById('categoryId');
    const nameField = document.getElementById('categoryName');
    const slugField = document.getElementById('categorySlug');
    const iconField = document.getElementById('categoryIcon');
    const parentSelect = document.getElementById('categoryParentId');
    const sortOrderField = document.getElementById('categorySortOrder');
    const isActiveCheck = document.getElementById('categoryIsActive');
    try {
        const tree = await apiFetch(`${API_BASE}/categories/tree`);
        parentSelect.innerHTML = '<option value="">-- Нет (корневая группа) --</option>';
        function flattenOptions(nodes, prefix = '') {
            for (const node of nodes) {
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = prefix + (node.icon || '📁') + ' ' + node.name;
                if (categoryId && node.id == categoryId) option.disabled = true;
                parentSelect.appendChild(option);
                if (node.children && node.children.length) flattenOptions(node.children, prefix + '—— ');
            }
        }
        flattenOptions(tree);
    } catch(e) { console.error(e); }
    if (categoryId) {
        title.textContent = '✏️ Редактировать категорию';
        const category = await apiFetch(`/api/categories/${categoryId}`);
        idField.value = category.id;
        nameField.value = category.name;
        slugField.value = category.slug;
        iconField.value = category.icon || '';
        sortOrderField.value = category.sort_order || 0;
        isActiveCheck.checked = category.is_active;
        parentSelect.value = category.parent_id || '';
    } else {
        title.textContent = '➕ Создать категорию';
        idField.value = '';
        nameField.value = '';
        slugField.value = '';
        iconField.value = '';
        sortOrderField.value = 0;
        isActiveCheck.checked = true;
        parentSelect.value = parentId || '';
    }
    modal.classList.remove('hidden');
}

async function saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = document.getElementById('categoryName').value.trim();
    const slug = document.getElementById('categorySlug').value.trim();
    const icon = document.getElementById('categoryIcon').value.trim();
    const parentId = document.getElementById('categoryParentId').value || null;
    const sortOrder = parseInt(document.getElementById('categorySortOrder').value) || 0;
    const isActive = document.getElementById('categoryIsActive').checked;
    if (!name || !slug) { alert('Название и slug обязательны'); return; }
    const url = id ? `${API_BASE}/categories/${id}` : `${API_BASE}/categories`;
    const method = id ? 'PUT' : 'POST';
    const body = { name, slug, parent_id: parentId, icon, sort_order: sortOrder, is_active: isActive };
    try {
        await apiFetch(url, { method, body: JSON.stringify(body) });
        alert(id ? 'Категория обновлена' : 'Категория создана');
        closeCategoryModal();
        loadCategoriesTree();
    } catch (err) { alert('Ошибка: ' + err.message); }
}

async function deleteCategory(id) {
    if (!confirm('Скрыть категорию?')) return;
    try {
        await apiFetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
        alert('Категория скрыта');
        loadCategoriesTree();
    } catch (err) { alert('Ошибка: ' + err.message); }
}

async function restoreCategory(id) {
    try {
        await apiFetch(`${API_BASE}/categories/${id}/restore`, { method: 'POST' });
        alert('Категория восстановлена');
        loadCategoriesTree();
    } catch (err) { alert('Ошибка: ' + err.message); }
}

function closeCategoryModal() { document.getElementById('categoryModal').classList.add('hidden'); }

// ========== ГОРОДА ==========
async function loadCitiesHierarchy() {
    const container = document.getElementById('citiesTreeContainer');
    if (!container) return;
    try {
        let regions = await apiFetch(`${API_BASE}/cities/regions`);
        const regionsWithCities = [];
        for (const region of regions) {
            const cities = await apiFetch(`/api/cities?region_id=${region.id}&limit=500`);
            regionsWithCities.push({ ...region, cities });
        }
        renderCitiesTree(regionsWithCities, container);
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="error">Ошибка загрузки</div>';
    }
}

function renderCitiesTree(regions, container) {
    if (!regions || regions.length === 0) { container.innerHTML = '<div class="empty">Нет регионов. Нажмите «➕ Добавить регион».</div>'; return; }
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    for (const region of regions) {
        const li = document.createElement('li');
        li.style.margin = '0.5rem 0';
        li.style.padding = '0.25rem 0';
        li.style.borderLeft = '2px solid #e2e8f0';
        const regionDiv = document.createElement('div');
        regionDiv.className = 'region-node';
        regionDiv.style.display = 'flex';
        regionDiv.style.alignItems = 'center';
        regionDiv.style.gap = '0.5rem';
        regionDiv.style.flexWrap = 'wrap';
        regionDiv.style.background = '#e2e8f0';
        regionDiv.style.padding = '0.5rem 0.75rem';
        regionDiv.style.borderRadius = '12px';
        regionDiv.style.marginLeft = '0';
        regionDiv.style.fontWeight = 'bold';
        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'toggle';
        toggleSpan.style.cursor = 'pointer';
        toggleSpan.style.fontFamily = 'monospace';
        toggleSpan.style.width = '20px';
        toggleSpan.style.display = 'inline-block';
        toggleSpan.style.textAlign = 'center';
        const isExpanded = expandedRegions[region.id] === true;
        toggleSpan.textContent = isExpanded ? '▼' : '▶';
        const nameSpan = document.createElement('span');
        nameSpan.style.flex = '1';
        nameSpan.textContent = `${escapeHtml(region.name)}`;
        const addCityBtn = document.createElement('button');
        addCityBtn.className = 'btn btn-sm btn-primary add-city-in-region';
        addCityBtn.textContent = '➕ Город';
        addCityBtn.onclick = () => openCityModal(null, region.id);
        const editRegionBtn = document.createElement('button');
        editRegionBtn.className = 'btn btn-sm btn-secondary';
        editRegionBtn.textContent = '✏️';
        editRegionBtn.onclick = () => openRegionModal(region.id, region.name, region.sort_order);
        const deleteRegionBtn = document.createElement('button');
        deleteRegionBtn.className = 'btn btn-sm btn-danger';
        deleteRegionBtn.textContent = '🗑️';
        deleteRegionBtn.onclick = () => deleteRegion(region.id);
        regionDiv.appendChild(toggleSpan);
        regionDiv.appendChild(nameSpan);
        regionDiv.appendChild(addCityBtn);
        regionDiv.appendChild(editRegionBtn);
        regionDiv.appendChild(deleteRegionBtn);
        li.appendChild(regionDiv);
        const childUl = document.createElement('ul');
        childUl.style.listStyle = 'none';
        childUl.style.paddingLeft = '1.5rem';
        childUl.style.marginTop = '0.25rem';
        childUl.style.display = isExpanded ? 'block' : 'none';
        for (const city of region.cities) {
            const cityLi = document.createElement('li');
            cityLi.style.margin = '0.25rem 0';
            cityLi.style.padding = '0.25rem 0';
            const cityDiv = document.createElement('div');
            cityDiv.className = 'city-node';
            cityDiv.style.display = 'flex';
            cityDiv.style.alignItems = 'center';
            cityDiv.style.gap = '0.5rem';
            cityDiv.style.flexWrap = 'wrap';
            cityDiv.style.background = '#f8fafc';
            cityDiv.style.padding = '0.5rem 0.75rem';
            cityDiv.style.borderRadius = '12px';
            cityDiv.style.marginLeft = '0.5rem';
            cityDiv.innerHTML = `<span style="flex:1;">${escapeHtml(city.name)} ${city.is_popular ? '⭐' : ''}</span>
                <div class="city-actions"><button class="btn btn-sm btn-primary edit-city" data-id="${city.id}">✏️</button><button class="btn btn-sm btn-danger delete-city" data-id="${city.id}">🗑️</button></div>`;
            cityLi.appendChild(cityDiv);
            childUl.appendChild(cityLi);
        }
        li.appendChild(childUl);
        ul.appendChild(li);
        toggleSpan.addEventListener('click', () => {
            if (childUl.style.display === 'none') { childUl.style.display = 'block'; toggleSpan.textContent = '▼'; expandedRegions[region.id] = true; }
            else { childUl.style.display = 'none'; toggleSpan.textContent = '▶'; expandedRegions[region.id] = false; }
        });
    }
    container.innerHTML = '';
    container.appendChild(ul);
    document.querySelectorAll('.edit-city').forEach(btn => btn.onclick = () => openCityModal(btn.dataset.id));
    document.querySelectorAll('.delete-city').forEach(btn => btn.onclick = () => deleteCity(btn.dataset.id));
}

async function loadRegionsForSelect(selectId) {
    try {
        const regions = await apiFetch(`${API_BASE}/cities/regions`);
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">-- Выберите регион --</option>';
        regions.forEach(r => { select.innerHTML += `<option value="${r.id}">${escapeHtml(r.name)}</option>`; });
    } catch(e) { console.error(e); }
}

async function openCityModal(cityId = null, preSelectedRegionId = null) {
    const modal = document.getElementById('cityModal');
    const title = document.getElementById('cityModalTitle');
    const idField = document.getElementById('cityId');
    const nameField = document.getElementById('cityName');
    const regionSelect = document.getElementById('cityRegionId');
    const isPopularCheck = document.getElementById('cityIsPopular');
    const sortOrderField = document.getElementById('citySortOrder');
    await loadRegionsForSelect('cityRegionId');
    if (preSelectedRegionId) regionSelect.value = preSelectedRegionId;
    if (cityId) {
        title.textContent = '✏️ Редактировать город';
        const city = await apiFetch(`/api/cities/${cityId}`);
        idField.value = city.id;
        nameField.value = city.name;
        regionSelect.value = city.region_id || '';
        isPopularCheck.checked = city.is_popular;
        sortOrderField.value = city.sort_order || 0;
    } else {
        title.textContent = '➕ Добавить город';
        idField.value = '';
        nameField.value = '';
        if (!preSelectedRegionId) regionSelect.value = '';
        isPopularCheck.checked = false;
        sortOrderField.value = 0;
    }
    modal.classList.remove('hidden');
}

async function saveCity() {
    const id = document.getElementById('cityId').value;
    const name = document.getElementById('cityName').value.trim();
    const region_id = document.getElementById('cityRegionId').value;
    const is_popular = document.getElementById('cityIsPopular').checked;
    const sort_order = parseInt(document.getElementById('citySortOrder').value) || 0;
    if (!name || !region_id) { alert('Заполните название и регион'); return; }
    const url = id ? `${API_BASE}/cities/${id}` : `${API_BASE}/cities`;
    const method = id ? 'PUT' : 'POST';
    const body = { name, region_id, is_popular, sort_order };
    try {
        await apiFetch(url, { method, body: JSON.stringify(body) });
        alert(id ? 'Город обновлён' : 'Город добавлен');
        closeCityModal();
        loadCitiesHierarchy();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

async function deleteCity(id) {
    if (!confirm('Удалить город?')) return;
    try {
        await apiFetch(`${API_BASE}/cities/${id}`, { method: 'DELETE' });
        alert('Город удалён');
        loadCitiesHierarchy();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

function closeCityModal() { document.getElementById('cityModal').classList.add('hidden'); }

// ========== РЕГИОНЫ ==========
async function openRegionModal(regionId = null, regionName = '', sortOrder = 0) {
    const modal = document.getElementById('regionModal');
    const title = document.getElementById('regionModalTitle');
    const idField = document.getElementById('regionId');
    const nameField = document.getElementById('regionName');
    const sortOrderField = document.getElementById('regionSortOrder');
    if (regionId) {
        title.textContent = '✏️ Редактировать регион';
        idField.value = regionId;
        nameField.value = regionName;
        sortOrderField.value = sortOrder;
    } else {
        title.textContent = '➕ Добавить регион';
        idField.value = '';
        nameField.value = '';
        sortOrderField.value = 0;
    }
    modal.classList.remove('hidden');
}

async function saveRegion() {
    const id = document.getElementById('regionId').value;
    const name = document.getElementById('regionName').value.trim();
    const sort_order = parseInt(document.getElementById('regionSortOrder').value) || 0;
    if (!name) { alert('Введите название региона'); return; }
    const url = id ? `${API_BASE}/cities/regions/${id}` : `${API_BASE}/cities/regions`;
    const method = id ? 'PUT' : 'POST';
    const body = { name, sort_order };
    try {
        await apiFetch(url, { method, body: JSON.stringify(body) });
        alert(id ? 'Регион обновлён' : 'Регион добавлен');
        closeRegionModal();
        loadCitiesHierarchy();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

async function deleteRegion(id) {
    if (!confirm('Удалить регион? Все города этого региона также будут удалены.')) return;
    try {
        await apiFetch(`${API_BASE}/cities/regions/${id}`, { method: 'DELETE' });
        alert('Регион удалён');
        loadCitiesHierarchy();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

function closeRegionModal() { document.getElementById('regionModal').classList.add('hidden'); }

// ========== ПОЛЬЗОВАТЕЛИ (С ПАРТНЁРСКИМИ ТАРИФАМИ) ==========
async function loadPartnerPlansList() {
    try {
        const data = await apiFetch(`${API_BASE}/../partner/admin/plans`);
        partnerPlansList = data.filter(p => p.is_active);
    } catch (err) {
        console.warn('Не удалось загрузить тарифы для выпадающего списка');
        partnerPlansList = [];
    }
}

function attachPartnerSaveButtons() {
    document.querySelectorAll('.save-partner-btn').forEach(btn => {
        btn.onclick = async function() {
            const userId = this.dataset.userid;
            const select = document.querySelector(`.partner-plan-select[data-userid="${userId}"]`);
            const planId = select.value ? parseInt(select.value) : null;
            try {
                await apiFetch(`${API_BASE}/../partner/admin/users/${userId}/partner`, {
                    method: 'PUT',
                    body: JSON.stringify({ planId })
                });
                alert('Статус партнёра обновлён');
                loadUsers(currentUsersPage);
            } catch (err) {
                alert('Ошибка: ' + err.message);
            }
        };
    });
}

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ loadUsers ==========
async function loadUsers(page) {
    currentUsersPage = page;
    const search = document.getElementById('searchUser')?.value || '';
    const role = document.getElementById('roleFilter')?.value || '';
    const blocked = document.getElementById('blockedFilter')?.value || '';
    const showDeleted = document.getElementById('showDeletedFilter')?.value || 'false';
    const url = `${API_BASE}/users?page=${page}&limit=15&search=${encodeURIComponent(search)}&role=${role}&blocked=${blocked}&showDeleted=${showDeleted}`;

    try {
        await loadPartnerPlansList();
        const data = await apiFetch(url);
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        const planOptions = partnerPlansList.map(p =>
            `<option value="${p.id}">${escapeHtml(p.name)} (до ${p.max_listings})</option>`
        ).join('');

        tbody.innerHTML = data.users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td>${escapeHtml(u.phone || '—')}</td>
                <td><select class="role-select" data-id="${u.id}" ${u.deleted_at ? 'disabled' : ''}><option value="user" ${u.role==='user'?'selected':''}>Пользователь</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Модератор</option><option value="admin" ${u.role==='admin'?'selected':''}>Администратор</option></select> ${!u.deleted_at ? `<button class="btn btn-primary btn-sm update-role" data-id="${u.id}">✓</button>` : ''}</td>
                <td>${u.is_blocked ? '🔴 Заблокирован' : '🟢 Активен'}</td>
                <td>
                    ${!u.deleted_at ? `
                        <button class="btn btn-primary btn-sm edit-user-btn" data-id="${u.id}">✏️ Редактировать</button>
                        <button class="btn btn-warning btn-sm block-user" data-id="${u.id}" data-blocked="${u.is_blocked}">${u.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button>
                        <button class="btn btn-danger btn-sm delete-user" data-id="${u.id}">🗑️ Удалить</button>
                    ` : `
                        <span class="badge">Удалён ${new Date(u.deleted_at).toLocaleDateString()}</span>
                        <button class="btn btn-success btn-sm restore-user" data-id="${u.id}">🔄 Восстановить</button>
                        <button class="btn btn-danger btn-sm delete-user-permanent" data-id="${u.id}">🗑️ Удалить навсегда</button>
                    `}
                </td>
                <td>
                    <select class="partner-plan-select" data-userid="${u.id}">
                        <option value="">— Не партнёр —</option>
                        ${planOptions}
                    </select>
                    <button class="btn btn-sm btn-primary save-partner-btn" data-userid="${u.id}">💾</button>
                </td>
            </tr>
        `).join('');

        // ===== ИСПРАВЛЕНИЕ: устанавливаем выбранные тарифы =====
        document.querySelectorAll('.partner-plan-select').forEach(select => {
            const userId = parseInt(select.dataset.userid);
            const user = data.users.find(u => u.id === userId);
            if (user && user.is_partner && user.partner_plan_id) {
                select.value = user.partner_plan_id;
            }
        });
        // ===== КОНЕЦ ИСПРАВЛЕНИЯ =====

        totalUsersPages = Math.ceil(data.total / data.limit);
        renderPagination('usersPagination', currentUsersPage, totalUsersPages, (p) => loadUsers(p));
        attachUserActions();
        attachPartnerSaveButtons();

        document.querySelectorAll('.delete-user-permanent').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.id;
                if (!confirm('Удалить пользователя навсегда? Это действие необратимо! Все его данные, объявления, чаты будут безвозвратно удалены.')) return;
                if (!confirm('Вы уверены? Восстановить будет невозможно.')) return;
                try {
                    await apiFetch(`${API_BASE}/users/${userId}/permanent`, { method: 'DELETE' });
                    alert('Пользователь удалён навсегда.');
                    loadUsers(currentUsersPage);
                } catch (err) {
                    alert('Ошибка: ' + err.message);
                }
            };
        });
    } catch(e) { alert('Ошибка загрузки пользователей'); }
}

function attachUserActions() {
    document.querySelectorAll('.update-role').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.id;
            const select = document.querySelector(`.role-select[data-id="${userId}"]`);
            const newRole = select.value;
            await apiFetch(`${API_BASE}/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
            loadUsers(currentUsersPage);
        };
    });
    document.querySelectorAll('.block-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.id;
            const currentlyBlocked = btn.dataset.blocked === 'true';
            await apiFetch(`${API_BASE}/users/${userId}/block`, { method: 'PUT', body: JSON.stringify({ blocked: !currentlyBlocked }) });
            loadUsers(currentUsersPage);
        };
    });
    document.querySelectorAll('.delete-user').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Удалить пользователя (мягкое удаление)?')) {
                await apiFetch(`${API_BASE}/users/${btn.dataset.id}`, { method: 'DELETE' });
                loadUsers(currentUsersPage);
            }
        };
    });
    document.querySelectorAll('.restore-user').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Восстановить пользователя?')) {
                await apiFetch(`${API_BASE}/users/${btn.dataset.id}/restore`, { method: 'POST' });
                loadUsers(currentUsersPage);
            }
        };
    });
    document.querySelectorAll('.edit-user-btn').forEach(btn => btn.onclick = () => openEditUserModal(btn.dataset.id));
}

async function openEditUserModal(userId) {
    try {
        const data = await apiFetch(`${API_BASE}/users?limit=1000`);
        const user = data.users.find(u => u.id == userId);
        if (!user) throw new Error('Пользователь не найден');
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email || '';
        document.getElementById('editPhone').value = user.phone || '';
        document.getElementById('editRole').value = user.role;
        document.getElementById('editSecurityQuestion').value = user.security_question || '';
        document.getElementById('editSecurityAnswer').value = '';
        const modal = document.getElementById('editUserModal');
        if (modal) modal.classList.remove('hidden');
    } catch(e) { alert('Ошибка загрузки данных'); }
}

async function saveUserEdit() {
    const id = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const role = document.getElementById('editRole').value;
    const security_question = document.getElementById('editSecurityQuestion').value;
    const security_answer = document.getElementById('editSecurityAnswer').value;

    if (!username) { alert('Имя обязательно'); return; }
    try {
        await apiFetch(`${API_BASE}/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ username, email, phone, role, security_question, security_answer })
        });
        alert('Данные обновлены');
        closeEditModal();
        loadUsers(currentUsersPage);
    } catch(e) { alert('Ошибка: ' + e.message); }
}

async function resetUserPassword() {
    const id = document.getElementById('editUserId').value;
    const customPassword = prompt('Введите новый пароль (оставьте пустым для генерации):');
    const payload = customPassword ? { newPassword: customPassword } : {};
    try {
        const result = await apiFetch(`${API_BASE}/users/${id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        alert(result.message);
        closeEditModal();
    } catch(e) { alert('Ошибка сброса пароля: ' + e.message); }
}

function closeEditModal() { document.getElementById('editUserModal').classList.add('hidden'); }

// ========== СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ ==========
function showCreateUserModal() {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newRole').value = 'user';
    document.getElementById('createUserModal').classList.remove('hidden');
}

async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const phone = document.getElementById('newPhone').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const role = document.getElementById('newRole').value;

    if (!username || !password || !phone) {
        alert('Имя, пароль и телефон обязательны');
        return;
    }
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов');
        return;
    }

    try {
        await apiFetch(`${API_BASE}/users/create`, {
            method: 'POST',
            body: JSON.stringify({ username, password, phone, email: email || null, role })
        });
        alert('Пользователь создан!');
        closeModal('createUserModal');
        loadUsers(currentUsersPage);
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// ========== ЖАЛОБЫ ==========
async function loadComplaints(page) {
    currentComplaintsPage = page;
    const status = document.getElementById('complaintStatusFilter')?.value || '';
    const url = `${API_BASE}/complaints/all?page=${page}&limit=20&status=${status}`;
    try {
        const data = await apiFetch(url);
        const container = document.getElementById('complaintsList');
        if (!container) return;
        if (!data.complaints.length) { container.innerHTML = '<div>Нет жалоб</div>'; return; }
        container.innerHTML = data.complaints.map(c => `
            <div class="complaint-card">
                <div><strong>Жалоба #${c.id}</strong> от ${new Date(c.created_at).toLocaleString()}</div>
                <div>👤 ${c.complainant_name} → ${c.listing_id ? `Объявление: ${c.listing_title}` : `Пользователь: ${c.complained_username}`}</div>
                <div>Статус: ${c.status}</div>
                <div>Причина: ${escapeHtml(c.reason)}</div>
                <div>${c.listing_id ? `<button class="btn btn-primary btn-sm" onclick="window.open('/listing.html?id=${c.listing_id}','_blank')">Просмотреть</button>` : ''}
                ${c.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="handleComplaint(${c.id}, 'approve')">✅ Принять</button><button class="btn btn-danger btn-sm" onclick="handleComplaint(${c.id}, 'reject')">❌ Отклонить</button>` : ''}</div>
            </div>
        `).join('');
        totalComplaintsPages = data.pages;
        renderPagination('complaintsPagination', currentComplaintsPage, totalComplaintsPages, (p) => loadComplaints(p));
    } catch(e) { alert('Ошибка жалоб'); }
}

async function handleComplaint(id, action) {
    await apiFetch(`${API_BASE}/complaints/${id}/${action}`, { method: 'POST' });
    loadComplaints(currentComplaintsPage);
}

// ========== АУДИТ АДМИНИСТРАТОРОВ ==========
async function loadLogs(page) {
    currentLogsPage = page;
    const action = document.getElementById('logActionFilter')?.value || '';
    const start = document.getElementById('logStartDate')?.value || '';
    const end = document.getElementById('logEndDate')?.value || '';
    const url = `${API_BASE}/logs?page=${page}&limit=30&action=${action}&start_date=${start}&end_date=${end}`;
    try {
        const data = await apiFetch(url);
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;
        tbody.innerHTML = data.logs.map(log => `<tr><td>${new Date(log.created_at).toLocaleString()}</td><td>${escapeHtml(log.admin_name)}</td><td>${log.action}</td><td>${log.target_type} #${log.target_id || '—'}</td><td>${JSON.stringify(log.details || {})}</td></tr>`).join('');
        totalLogsPages = data.pages;
        renderPagination('logsPagination', currentLogsPage, totalLogsPages, (p) => loadLogs(p));
    } catch(e) { alert('Ошибка логов'); }
}

async function loadLogActions() {
    try {
        const data = await apiFetch(`${API_BASE}/logs?limit=1`);
        const actions = [...new Set(data.logs.map(l => l.action))];
        const select = document.getElementById('logActionFilter');
        if (select) select.innerHTML = '<option value="">Все действия</option>' + actions.map(a => `<option value="${a}">${a}</option>`).join('');
    } catch(e) {}
}

// ========== ЖУРНАЛ ДЕЙСТВИЙ ПОЛЬЗОВАТЕЛЕЙ ==========
async function loadUserActions(page) {
    currentUserActionsPage = page;
    const search = document.getElementById('userActionSearch')?.value || '';
    const action = document.getElementById('userActionFilter')?.value || '';
    const start = document.getElementById('userActionStartDate')?.value || '';
    const end = document.getElementById('userActionEndDate')?.value || '';

    let url = `${API_BASE}/user-actions?page=${page}&limit=30`;
    if (search) {
        if (!isNaN(search) && search.trim() !== '') {
            url += `&user_id=${parseInt(search)}`;
        } else if (search.trim() !== '') {
            alert('Поиск по имени пока не поддерживается. Введите ID пользователя.');
        }
    }
    if (action) url += `&action=${action}`;
    if (start) url += `&start_date=${start}`;
    if (end) url += `&end_date=${end}`;

    try {
        const data = await apiFetch(url);
        const tbody = document.getElementById('userActionsTableBody');
        if (!tbody) return;

        if (data.actions && data.actions.length > 0) {
            let html = '';
            for (const row of data.actions) {
                const details = row.details ? JSON.stringify(row.details) : '—';
                html += `
                    <tr>
                        <td>${new Date(row.created_at).toLocaleString()}</td>
                        <td>${escapeHtml(row.username || 'ID ' + row.user_id)} (${row.user_id})</td>
                        <td>${formatAction(row.action)}</td>
                        <td style="font-size:0.8rem; max-width:200px; word-break:break-all;">${escapeHtml(details)}</td>
                        <td style="font-size:0.75rem;">${escapeHtml(row.ip_address || '—')}</td>
                        <td style="font-size:0.65rem; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(row.user_agent || '')}">${escapeHtml(row.user_agent ? row.user_agent.substring(0, 50) + '…' : '—')}</td>
                    </tr>
                `;
            }
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">Нет записей</td></tr>';
        }

        totalUserActionsPages = data.pages || 1;
        renderPagination('userActionsPagination', currentUserActionsPage, totalUserActionsPages, (p) => loadUserActions(p));
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:red;">Ошибка загрузки</td></tr>';
    }
}

// ========== НАСТРОЙКИ ==========
async function loadSettings() {
    try {
        const settings = await apiFetch(`${API_BASE}/settings`);
        const container = document.getElementById('settingsForm');
        if (!container) return;
        container.innerHTML = '';
        for (const s of settings) {
            const div = document.createElement('div');
            div.style.marginBottom = '1rem';
            const label = document.createElement('label');
            const displayName = settingLabels[s.key] || s.key;
            label.innerHTML = `<strong>${escapeHtml(displayName)}</strong><br>`;
            div.appendChild(label);

            const input = document.createElement('input');
            if (s.type === 'integer' || s.type === 'number') {
                input.type = 'number';
                input.step = '1';
                input.min = '0';
            } else if (s.key === 'hcaptcha_enabled') {
                const select = document.createElement('select');
                select.id = `setting_${s.key}`;
                select.style.width = '100%';
                select.style.padding = '0.5rem';
                const optTrue = document.createElement('option'); optTrue.value = 'true'; optTrue.textContent = '✅ Включить (рекомендуется)';
                const optFalse = document.createElement('option'); optFalse.value = 'false'; optFalse.textContent = '❌ Выключить';
                select.appendChild(optTrue); select.appendChild(optFalse);
                select.value = s.value === 'true' ? 'true' : 'false';
                div.appendChild(select);
                container.appendChild(div);
                continue;
            } else {
                input.type = 'text';
            }
            input.id = `setting_${s.key}`;
            input.value = s.value || '';
            input.style.width = '100%';
            input.style.padding = '0.5rem';
            div.appendChild(input);

            if (s.description) {
                const small = document.createElement('small');
                small.textContent = s.description;
                small.style.display = 'block';
                small.style.marginTop = '0.25rem';
                small.style.color = '#6c757d';
                div.appendChild(small);
            }
            container.appendChild(div);
        }
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-secondary';
        resetBtn.textContent = '↺ Сбросить цены к значениям по умолчанию (200, 150, 100)';
        resetBtn.onclick = resetPrices;
        container.appendChild(resetBtn);
    } catch(e) { alert('Ошибка настроек'); }
}

async function saveAllSettings() {
    const inputs = document.querySelectorAll('#settingsForm input, #settingsForm select');
    const settings = await apiFetch(`${API_BASE}/settings`);
    for (const inp of inputs) {
        const key = inp.id.replace('setting_', '');
        const value = inp.value.trim();
        const setting = settings.find(s => s.key === key);
        if (setting && (setting.type === 'integer' || setting.type === 'number')) {
            if (value === '' || isNaN(value) || parseInt(value) < 0) {
                alert(`Поле "${key}" должно содержать положительное число.`);
                return;
            }
        }
        await apiFetch(`${API_BASE}/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
    }
    alert('Настройки сохранены');
    loadSettings();
}

async function resetPrices() {
    if (!confirm('Сбросить цены к значениям по умолчанию (200, 150, 100)?')) return;
    await apiFetch(`${API_BASE}/settings/price_listing`, { method: 'PUT', body: JSON.stringify({ value: '200' }) });
    await apiFetch(`${API_BASE}/settings/price_renewal`, { method: 'PUT', body: JSON.stringify({ value: '150' }) });
    await apiFetch(`${API_BASE}/settings/price_autobump`, { method: 'PUT', body: JSON.stringify({ value: '100' }) });
    alert('Цены сброшены к значениям по умолчанию');
    loadSettings();
}

// ========== ОБРАЩЕНИЯ В ПОДДЕРЖКУ ==========
async function updateSupportBadge() {
    try {
        const token = getToken();
        const response = await fetch('/api/admin/support/unread-count', { headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) {
            const data = await response.json();
            const count = data.count || 0;
            const tabBtn = document.querySelector('.tab-btn[data-tab="supportTickets"]');
            if (tabBtn) {
                const oldBadge = tabBtn.querySelector('.badge');
                if (oldBadge) oldBadge.remove();
                if (count > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.marginLeft = '8px';
                    badge.style.backgroundColor = '#ef4444';
                    badge.style.padding = '2px 6px';
                    badge.style.borderRadius = '20px';
                    badge.style.fontSize = '0.7rem';
                    badge.style.fontWeight = 'bold';
                    tabBtn.appendChild(badge);
                }
            }
        }
    } catch (err) { console.error(err); }
}

async function loadSupportTickets() {
    try {
        const token = getToken();
        const response = await fetch('/api/support/tickets', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Ошибка загрузки');
        const tickets = await response.json();
        renderAdminTickets(tickets);
        updateSupportBadge();
    } catch (err) {
        console.error(err);
        const container = document.getElementById('adminTicketsList');
        if (container) container.innerHTML = '<p>Ошибка загрузки обращений</p>';
    }
}

function renderAdminTickets(tickets) {
    const container = document.getElementById('adminTicketsList');
    if (!container) return;
    if (!tickets.length) { container.innerHTML = '<p>Нет обращений.</p>'; return; }
    let html = '';
    for (const t of tickets) {
        const statusText = { open: 'Открыто', in_progress: 'В обработке', closed: 'Закрыто' }[t.status];
        const unreadCount = t.unread_messages_count || 0;
        const unreadBadgeHtml = unreadCount > 0 ? `<span class="unread-badge-item" style="margin-left:8px; background:#ef4444; padding:2px 8px; border-radius:20px; font-size:0.7rem; font-weight:bold; color:white;">🔔 ${unreadCount}</span>` : '';
        html += `
            <div class="ticket-item" data-id="${t.id}" data-chat="${t.chat_id || ''}">
                <div><strong>#${t.id}</strong> - ${escapeHtml(t.subject)} ${unreadBadgeHtml}</div>
                <div>Пользователь: ${escapeHtml(t.user_name || 'ID ' + t.user_id)}</div>
                <div>Статус: <span class="ticket-status status-${t.status}">${statusText}</span> | Приоритет: ${t.priority}</div>
                <div>Создано: ${new Date(t.created_at).toLocaleString()}</div>
                <div><em>${escapeHtml(t.message.substring(0, 150))}${t.message.length > 150 ? '…' : ''}</em></div>
                <div class="reply-area"><textarea id="reply-${t.id}" rows="2" placeholder="Введите ответ..."></textarea><button class="btn btn-primary send-reply-btn" data-id="${t.id}" data-chat="${t.chat_id || ''}">📨 Ответить</button></div>
                <div>${t.chat_id ? `<button class="btn btn-secondary open-chat-btn" data-chat="${t.chat_id}">💬 Перейти в чат</button>` : `<button class="btn btn-warning create-chat-btn" data-id="${t.id}">🆕 Создать чат</button>`}
                <select class="status-select" data-id="${t.id}"><option value="open" ${t.status === 'open' ? 'selected' : ''}>Открыто</option><option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>В обработке</option><option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Закрыто</option></select>
                <button class="btn btn-sm update-status-btn" data-id="${t.id}">Обновить статус</button></div>
            </div><hr>
        `;
    }
    container.innerHTML = html;
    document.querySelectorAll('.send-reply-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ticketId = btn.dataset.id;
            const message = document.getElementById(`reply-${ticketId}`).value.trim();
            if (!message) return;
            const token = getToken();
            const resp = await fetch(`/api/support/tickets/${ticketId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message })
            });
            if (resp.ok) { alert('Ответ отправлен'); loadSupportTickets(); }
            else alert('Ошибка');
        });
    });
    document.querySelectorAll('.open-chat-btn').forEach(btn => btn.addEventListener('click', () => window.open(`/chat.html?chatId=${btn.dataset.chat}&admin=1`, '_blank')));
    document.querySelectorAll('.create-chat-btn').forEach(btn => btn.addEventListener('click', async () => { await createSupportChat(btn.dataset.id); loadSupportTickets(); }));
    document.querySelectorAll('.update-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ticketId = btn.dataset.id;
            const newStatus = document.querySelector(`.status-select[data-id="${ticketId}"]`).value;
            const token = getToken();
            await fetch(`/api/support/tickets/${ticketId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus })
            });
            alert('Статус обновлён'); loadSupportTickets();
        });
    });
}

async function createSupportChat(ticketId) {
    const token = getToken();
    const response = await fetch(`/api/support/tickets/${ticketId}/create-chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Ошибка');
    const data = await response.json();
    alert('Чат создан');
    if (data.chatId && confirm('Перейти в чат?')) window.open(`/chat.html?chatId=${data.chatId}&admin=1`, '_blank');
}

// ========== ОБРАЩЕНИЯ С САЙТА ==========
async function loadContactMessages(page = 1, status = 'all') {
    currentContactPage = page;
    const url = `${API_BASE}/../contact/admin/messages?page=${page}&limit=20&status=${status}`;
    try {
        const data = await apiFetch(url);
        const container = document.getElementById('contactMessagesList');
        if (!container) return;
        if (!data.messages.length) { container.innerHTML = '<div class="empty">Нет сообщений</div>'; return; }
        let html = '<div class="table-responsive"><table class="messages-table"><thead><tr><th>ID</th><th>Дата</th><th>Имя</th><th>Email</th><th>Тема</th><th>Сообщение</th><th>Статус</th><th>Действия</th></tr></thead><tbody>';
        for (const msg of data.messages) {
            html += `<tr>
                <td>${msg.id}</td>
                <td>${new Date(msg.created_at).toLocaleString()}</td>
                <td>${escapeHtml(msg.name || '—')}</td>
                <td>${escapeHtml(msg.email)}</td>
                <td>${escapeHtml(msg.subject || '—')}</td>
                <td class="message-preview">${escapeHtml(msg.message.substring(0, 100))}…</td>
                <td>${msg.status === 'new' ? '🆕 Новое' : '📖 Прочитано'}</td>
                <td><button class="btn-sm btn-primary mark-read" data-id="${msg.id}" ${msg.status !== 'new' ? 'disabled' : ''}>✅ Отметить прочитанным</button>
                <a href="mailto:${escapeHtml(msg.email)}" class="btn-sm btn-secondary" target="_blank">✉️ Ответить</a></td>
            </tr>`;
        }
        html += '</tbody></table></div>';
        container.innerHTML = html;
        totalContactPages = data.pages;
        renderPagination('contactPagination', currentContactPage, totalContactPages, (p) => loadContactMessages(p, status));
        document.querySelectorAll('.mark-read').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                await apiFetch(`${API_BASE}/../contact/admin/messages/${id}/read`, { method: 'PUT' });
                loadContactMessages(currentContactPage, status);
            };
        });
    } catch(e) { console.error(e); container.innerHTML = '<div class="error">Ошибка загрузки</div>'; }
}

// ========== ПАРТНЁРСКИЕ ТАРИФЫ (НОВОЕ) ==========

async function loadPlans() {
    try {
        const data = await apiFetch(`${API_BASE}/../partner/admin/plans`);
        const tbody = document.getElementById('plansTableBody');
        if (!tbody) return;
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Нет тарифов</td></tr>';
            return;
        }
        let html = '';
        data.forEach(plan => {
            html += `
                <tr>
                    <td>${plan.id}</td>
                    <td>${escapeHtml(plan.name)}</td>
                    <td>${plan.max_listings}</td>
                    <td>${plan.price_renewal}</td>
                    <td>${plan.price_autobump}</td>
                    <td>${plan.period_days}</td>
                    <td>${plan.is_active ? '✅ Да' : '❌ Нет'}</td>
                    <td>
                        <button class="btn btn-primary btn-sm edit-plan" data-id="${plan.id}">✏️</button>
                        ${plan.is_active ? `<button class="btn btn-danger btn-sm delete-plan" data-id="${plan.id}">🗑️</button>` : `<button class="btn btn-secondary btn-sm activate-plan" data-id="${plan.id}">🔄 Активировать</button>`}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        document.querySelectorAll('.edit-plan').forEach(btn => {
            btn.onclick = () => openPlanModal(btn.dataset.id);
        });
        document.querySelectorAll('.delete-plan').forEach(btn => {
            btn.onclick = () => deletePlan(btn.dataset.id);
        });
        document.querySelectorAll('.activate-plan').forEach(btn => {
            btn.onclick = () => activatePlan(btn.dataset.id);
        });
    } catch (err) {
        console.error(err);
        const tbody = document.getElementById('plansTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Ошибка загрузки</td></tr>';
    }
}

async function openPlanModal(planId = null) {
    const modal = document.getElementById('planModal');
    const title = document.getElementById('planModalTitle');
    const idField = document.getElementById('planId');
    const nameField = document.getElementById('planName');
    const maxField = document.getElementById('planMaxListings');
    const priceRenewal = document.getElementById('planPriceRenewal');
    const priceAutobump = document.getElementById('planPriceAutobump');
    const periodField = document.getElementById('planPeriodDays');
    const isActiveCheck = document.getElementById('planIsActive');

    if (planId) {
        title.textContent = '✏️ Редактировать тариф';
        try {
            const plans = await apiFetch(`${API_BASE}/../partner/admin/plans`);
            const plan = plans.find(p => p.id == planId);
            if (!plan) throw new Error('Тариф не найден');
            idField.value = plan.id;
            nameField.value = plan.name;
            maxField.value = plan.max_listings;
            priceRenewal.value = plan.price_renewal;
            priceAutobump.value = plan.price_autobump;
            periodField.value = plan.period_days;
            isActiveCheck.checked = plan.is_active;
        } catch (err) {
            alert('Ошибка загрузки тарифа');
            return;
        }
    } else {
        title.textContent = '➕ Добавить тариф';
        idField.value = '';
        nameField.value = '';
        maxField.value = '';
        priceRenewal.value = '';
        priceAutobump.value = '';
        periodField.value = 30;
        isActiveCheck.checked = true;
    }
    modal.classList.remove('hidden');
}

async function savePlan() {
    const id = document.getElementById('planId').value;
    const name = document.getElementById('planName').value.trim();
    const max_listings = parseInt(document.getElementById('planMaxListings').value);
    const price_renewal = parseInt(document.getElementById('planPriceRenewal').value) || 0;
    const price_autobump = parseInt(document.getElementById('planPriceAutobump').value) || 0;
    const period_days = parseInt(document.getElementById('planPeriodDays').value) || 30;
    const is_active = document.getElementById('planIsActive').checked;

    if (!name || !max_listings) {
        alert('Заполните название и лимит объявлений');
        return;
    }
    if (max_listings < 1) {
        alert('Лимит должен быть больше 0');
        return;
    }

    try {
        const url = id ? `${API_BASE}/../partner/admin/plans/${id}` : `${API_BASE}/../partner/admin/plans`;
        const method = id ? 'PUT' : 'POST';
        const body = { name, max_listings, price_renewal, price_autobump, period_days, is_active };
        const result = await apiFetch(url, { method, body: JSON.stringify(body) });
        alert(id ? 'Тариф обновлён' : 'Тариф создан');
        closePlanModal();
        loadPlans();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function deletePlan(id) {
    if (!confirm('Деактивировать тариф? Он станет недоступен для новых назначений.')) return;
    try {
        await apiFetch(`${API_BASE}/../partner/admin/plans/${id}`, { method: 'DELETE' });
        alert('Тариф деактивирован');
        loadPlans();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

async function activatePlan(id) {
    try {
        await apiFetch(`${API_BASE}/../partner/admin/plans/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: true })
        });
        alert('Тариф активирован');
        loadPlans();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

function closePlanModal() {
    document.getElementById('planModal').classList.add('hidden');
}

// ========== ВЫДАЧА ПОДПИСОК ==========
async function loadUsersForGrant(searchQuery = '') {
    const select = document.getElementById('grantUserSelect');
    const resultDiv = document.getElementById('grantResultMessage');
    if (!select) return;

    try {
        const token = getToken();
        let url = `${API_BASE}/users?limit=50`;
        if (searchQuery.trim()) {
            url += `&search=${encodeURIComponent(searchQuery.trim())}`;
        }
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Ошибка загрузки пользователей');
        }

        const data = await response.json();
        select.innerHTML = '<option value="">-- Выберите пользователя --</option>';
        if (data.users && data.users.length > 0) {
            data.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                const email = user.email ? `, ${user.email}` : '';
                const phone = user.phone ? `, ${user.phone}` : '';
                option.textContent = `${user.username} (ID: ${user.id}${email}${phone})`;
                select.appendChild(option);
            });
            resultDiv.innerHTML = `<span style="color:green;">✅ Найдено ${data.users.length} пользователей</span>`;
        } else {
            select.innerHTML = '<option value="">-- Пользователи не найдены --</option>';
            resultDiv.innerHTML = `<span style="color:orange;">⚠️ По запросу ничего не найдено</span>`;
        }
    } catch (e) {
        console.error('Ошибка загрузки пользователей:', e);
        select.innerHTML = '<option value="">-- Ошибка загрузки --</option>';
        resultDiv.innerHTML = `<span style="color:red;">❌ Ошибка: ${e.message || 'Неизвестная ошибка'}</span>`;
    }
}

async function grantSubscription() {
    const userId = document.getElementById('grantUserSelect').value;
    const packageType = document.getElementById('grantPackageType').value;
    const durationDays = parseInt(document.getElementById('grantDurationDays').value, 10);
    const resultDiv = document.getElementById('grantResultMessage');

    if (!userId) {
        resultDiv.innerHTML = '<span style="color:red;">❌ Выберите пользователя из списка</span>';
        return;
    }
    if (isNaN(durationDays) || durationDays < 1) {
        resultDiv.innerHTML = '<span style="color:red;">❌ Укажите корректное количество дней (≥1)</span>';
        return;
    }

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/subscriptions/grant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId, packageType, durationDays })
        });

        const data = await response.json();
        if (response.ok) {
            resultDiv.innerHTML = `<span style="color:green;">✅ ${data.message}</span>`;
        } else {
            resultDiv.innerHTML = `<span style="color:red;">❌ Ошибка: ${data.error || 'Неизвестная ошибка'}</span>`;
        }
    } catch (e) {
        console.error('Ошибка при выдаче подписки:', e);
        resultDiv.innerHTML = `<span style="color:red;">❌ Ошибка соединения: ${e.message || 'Проверьте соединение с сервером'}</span>`;
    }
}

// ========== СПИСОК ПОДПИСОК ==========
async function loadSubscriptionsList(page = 1) {
    currentSubscriptionsPage = page;
    const search = document.getElementById('subscriptionSearch')?.value || '';
    const packageType = document.getElementById('subscriptionTypeFilter')?.value || '';
    const status = document.getElementById('subscriptionStatusFilter')?.value || 'all';
    const adminOnly = document.getElementById('subscriptionAdminOnly')?.checked ? 'true' : '';

    let url = `${API_BASE}/subscriptions?page=${page}&limit=20&search=${encodeURIComponent(search)}&package_type=${packageType}&status=${status}&admin_created=${adminOnly}`;

    try {
        const data = await apiFetch(url);
        const tbody = document.getElementById('subscriptionsTableBody');
        if (!tbody) return;

        if (data.subscriptions && data.subscriptions.length > 0) {
            let html = '';
            for (const sub of data.subscriptions) {
                const daysLeft = sub.days_left;
                let daysClass = 'green';
                let statusBadge = '';
                if (daysLeft > 7) {
                    daysClass = 'green';
                    statusBadge = '<span class="subscription-status-badge badge-active">🟢 Активна</span>';
                } else if (daysLeft > 0 && daysLeft <= 7) {
                    daysClass = 'yellow';
                    statusBadge = '<span class="subscription-status-badge badge-near">🟡 Скоро истечёт</span>';
                } else {
                    daysClass = 'red';
                    statusBadge = '<span class="subscription-status-badge badge-expired">🔴 Истекла</span>';
                }

                const packageTypeLabel = sub.package_type === 'listing' ? '📦 Продление' : '🤖 Автопилот';
                const startDate = new Date(sub.start_date).toLocaleDateString();
                const endDate = new Date(sub.end_date).toLocaleDateString();

                let actionsHtml = '';
                if (sub.admin_created) {
                    actionsHtml = `
                        <button class="btn btn-primary btn-sm" onclick="openEditSubscriptionModal(${sub.id}, '${sub.end_date}')" title="Редактировать">✏️</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSubscription(${sub.id})" title="Удалить">🗑️</button>
                    `;
                } else {
                    actionsHtml = '<span style="color:#999; font-size:0.8rem;">—</span>';
                }

                html += `
                    <tr>
                        <td>${sub.id}</td>
                        <td><a href="/profile.html?id=${sub.user_id}" target="_blank">${escapeHtml(sub.username)}</a> (ID: ${sub.user_id})</td>
                        <td>${packageTypeLabel}</td>
                        <td>${startDate}</td>
                        <td>${endDate}</td>
                        <td><span class="days-left ${daysClass}">${daysLeft}</span> ${statusBadge}</td>
                        <td>${sub.listing_count} / ${sub.max_slots || 5}</td>
                        <td>${sub.listing_ids ? sub.listing_ids.map(id => `<a href="/listing.html?id=${id}" target="_blank">#${id}</a>`).join(', ') : '—'}</td>
                        <td>${actionsHtml}</td>
                    </tr>
                `;
            }
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem;">Нет подписок по заданным фильтрам</td></tr>';
        }

        totalSubscriptionsPages = data.pages || 1;
        renderPagination('subscriptionsPagination', currentSubscriptionsPage, totalSubscriptionsPages, (p) => loadSubscriptionsList(p));
    } catch (e) {
        console.error('Ошибка загрузки списка подписок:', e);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:red;">Ошибка загрузки данных</td></tr>';
    }
}

function openEditSubscriptionModal(subscriptionId, currentEndDate) {
    document.getElementById('editSubscriptionId').value = subscriptionId;
    const date = new Date(currentEndDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    document.getElementById('editSubscriptionEndDate').value = `${year}-${month}-${day}`;
    document.getElementById('editSubscriptionModal').classList.remove('hidden');
}

function closeEditSubscriptionModal() {
    document.getElementById('editSubscriptionModal').classList.add('hidden');
}

async function saveSubscriptionEdit() {
    const id = document.getElementById('editSubscriptionId').value;
    const endDate = document.getElementById('editSubscriptionEndDate').value;
    if (!endDate) {
        alert('Укажите новую дату окончания');
        return;
    }
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/subscriptions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ endDate })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message || 'Подписка обновлена');
            closeEditSubscriptionModal();
            loadSubscriptionsList(currentSubscriptionsPage);
        } else {
            alert(data.error || 'Ошибка обновления');
        }
    } catch (e) {
        alert('Ошибка соединения');
        console.error(e);
    }
}

async function deleteSubscription(id) {
    if (!confirm('Удалить эту подписку? Это действие необратимо.')) return;
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/subscriptions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message || 'Подписка удалена');
            loadSubscriptionsList(currentSubscriptionsPage);
        } else {
            alert(data.error || 'Ошибка удаления');
        }
    } catch (e) {
        alert('Ошибка соединения');
        console.error(e);
    }
}

// ========== МАССОВАЯ РАССЫЛКА ==========
document.getElementById('sendNewsletterBtn')?.addEventListener('click', async () => {
    const subject = document.getElementById('newsletterSubject').value.trim();
    const message = document.getElementById('newsletterMessage').value.trim();
    const statusSpan = document.getElementById('newsletterStatus');
    const resultDiv = document.getElementById('newsletterResult');

    if (!subject || !message) {
        alert('Заполните тему и текст сообщения');
        return;
    }

    if (!confirm(`Отправить рассылку "${subject}" всем активным пользователям?`)) return;

    statusSpan.textContent = '⏳ Отправка...';
    resultDiv.innerHTML = '';

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/newsletter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ subject, message })
        });

        const data = await response.json();

        if (response.ok) {
            statusSpan.textContent = '✅ Готово';
            resultDiv.innerHTML = `
                <div style="background:#d1fae5; padding:1rem; border-radius:0.75rem; color:#065f46;">
                    <strong>${data.message}</strong><br>
                    Всего пользователей: ${data.total}, успешно: ${data.success}, ошибок: ${data.errors}
                </div>
            `;
            document.getElementById('newsletterSubject').value = '';
            document.getElementById('newsletterMessage').value = '';
        } else {
            statusSpan.textContent = '❌ Ошибка';
            resultDiv.innerHTML = `<div style="background:#fee2e2; padding:1rem; border-radius:0.75rem; color:#991b1b;">Ошибка: ${data.error || 'Неизвестная ошибка'}</div>`;
        }
    } catch (e) {
        statusSpan.textContent = '❌ Ошибка';
        resultDiv.innerHTML = `<div style="background:#fee2e2; padding:1rem; border-radius:0.75rem; color:#991b1b;">Ошибка соединения: ${e.message}</div>`;
    }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
    adjustAdminHeaderOffset();

    document.getElementById('addRootCategoryBtn')?.addEventListener('click', () => openCategoryModal());
    document.getElementById('closeCategoryModal')?.addEventListener('click', closeCategoryModal);
    document.getElementById('saveCategoryBtn')?.addEventListener('click', saveCategory);
    document.getElementById('categoryModal')?.addEventListener('click', (e) => { if (e.target === document.getElementById('categoryModal')) closeCategoryModal(); });
    document.getElementById('addRegionBtn')?.addEventListener('click', () => openRegionModal());
    document.getElementById('closeCityModal')?.addEventListener('click', closeCityModal);
    document.getElementById('saveCityBtn')?.addEventListener('click', saveCity);
    document.getElementById('cityModal')?.addEventListener('click', (e) => { if (e.target === document.getElementById('cityModal')) closeCityModal(); });
    document.getElementById('closeRegionModal')?.addEventListener('click', closeRegionModal);
    document.getElementById('saveRegionBtn')?.addEventListener('click', saveRegion);
    document.getElementById('regionModal')?.addEventListener('click', (e) => { if (e.target === document.getElementById('regionModal')) closeRegionModal(); });
    document.getElementById('searchCityBtn')?.addEventListener('click', () => loadCitiesHierarchy());
    document.getElementById('saveUserBtn')?.addEventListener('click', saveUserEdit);
    document.getElementById('resetPasswordBtn')?.addEventListener('click', resetUserPassword);
    document.getElementById('editUserModal')?.addEventListener('click', (e) => { if (e.target === document.getElementById('editUserModal')) closeEditModal(); });
    document.getElementById('applyListingFilters')?.addEventListener('click', () => loadListings(1));
    document.getElementById('applyUserFilters')?.addEventListener('click', () => loadUsers(1));
    document.getElementById('exportUsersBtn')?.addEventListener('click', () => window.location.href = `${API_BASE}/users/export`);
    document.getElementById('importUsersFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        const token = getToken();
        const res = await fetch(`${API_BASE}/users/import`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (res.ok) alert('Импорт завершён'); else alert('Ошибка импорта');
        loadUsers(currentUsersPage);
    });
    document.getElementById('applyComplaintFilters')?.addEventListener('click', () => loadComplaints(1));
    document.getElementById('applyLogFilters')?.addEventListener('click', () => loadLogs(1));
    document.getElementById('applyUserActionFilters')?.addEventListener('click', () => loadUserActions(1));
    document.getElementById('saveAllSettings')?.addEventListener('click', saveAllSettings);
    document.getElementById('applyContactFilters')?.addEventListener('click', () => {
        const status = document.getElementById('contactStatusFilter').value;
        loadContactMessages(1, status);
    });
    document.getElementById('grantSubscriptionBtn')?.addEventListener('click', grantSubscription);

    document.getElementById('grantSearchBtn')?.addEventListener('click', () => {
        const searchQuery = document.getElementById('grantSearchInput')?.value || '';
        loadUsersForGrant(searchQuery);
    });
    document.getElementById('grantClearSearchBtn')?.addEventListener('click', () => {
        document.getElementById('grantSearchInput').value = '';
        loadUsersForGrant('');
    });
    document.getElementById('grantSearchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('grantSearchBtn').click();
        }
    });

    document.getElementById('applySubscriptionFilters')?.addEventListener('click', () => {
        loadSubscriptionsList(1);
    });
    document.getElementById('resetSubscriptionFilters')?.addEventListener('click', () => {
        document.getElementById('subscriptionSearch').value = '';
        document.getElementById('subscriptionTypeFilter').value = '';
        document.getElementById('subscriptionStatusFilter').value = 'all';
        document.getElementById('subscriptionAdminOnly').checked = false;
        loadSubscriptionsList(1);
    });
    document.getElementById('subscriptionSearch')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadSubscriptionsList(1);
        }
    });
    document.getElementById('saveSubscriptionEditBtn')?.addEventListener('click', saveSubscriptionEdit);

    document.getElementById('showCreateUserBtn')?.addEventListener('click', showCreateUserModal);
    document.getElementById('submitCreateUser')?.addEventListener('click', createUser);
    document.getElementById('cancelCreateUser')?.addEventListener('click', () => closeModal('createUserModal'));
    document.getElementById('createUserModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('createUserModal')) closeModal('createUserModal');
    });

    // ===== НОВОЕ: обработчики для партнёрских тарифов =====
    document.getElementById('addPlanBtn')?.addEventListener('click', () => openPlanModal());
    document.getElementById('closePlanModal')?.addEventListener('click', closePlanModal);
    document.getElementById('savePlanBtn')?.addEventListener('click', savePlan);
    document.getElementById('planModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('planModal')) closePlanModal();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(div => div.classList.add('hidden'));
            document.getElementById(`${tab}Section`).classList.remove('hidden');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setTimeout(adjustAdminHeaderOffset, 100);
            if (tab === 'stats') loadStats();
            if (tab === 'listings') loadListings(1);
            if (tab === 'categoriesTree') loadCategoriesTree();
            if (tab === 'users') loadUsers(1);
            if (tab === 'cities') loadCitiesHierarchy();
            if (tab === 'complaints') loadComplaints(1);
            if (tab === 'logs') loadLogs(1);
            if (tab === 'userActions') loadUserActions(1);
            if (tab === 'settings') loadSettings();
            if (tab === 'newsletter') { /* просто показываем форму */ }
            if (tab === 'grantSubscription') loadUsersForGrant('');
            if (tab === 'subscriptionsList') loadSubscriptionsList(1);
            if (tab === 'supportTickets') loadSupportTickets();
            if (tab === 'contactMessages') loadContactMessages(1, document.getElementById('contactStatusFilter').value);
            // Новая вкладка
            if (tab === 'partnerPlans') loadPlans();
        });
    });

    setInterval(updateSupportBadge, 30000);
    window.addEventListener('focus', updateSupportBadge);
    loadStats();
    loadLogActions();
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7*24*3600000).toISOString().split('T')[0];
    if (document.getElementById('statsStartDate')) document.getElementById('statsStartDate').value = weekAgo;
    if (document.getElementById('statsEndDate')) document.getElementById('statsEndDate').value = today;
});