// ========== УПРАВЛЕНИЕ КОЛИЧЕСТВОМ ОБЪЯВЛЕНИЙ НА СТРАНИЦЕ =====
let currentLimit = parseInt(localStorage.getItem('listingsLimit')) || 20;

function setLimit(value) {
    currentLimit = parseInt(value);
    localStorage.setItem('listingsLimit', currentLimit);
    if (typeof applyFilters === 'function') {
        applyFilters();
    } else if (typeof loadListingsWithoutFilters === 'function') {
        loadListingsWithoutFilters();
    }
}

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ initMapForModal ========== 
function initMapForModal(containerId, latInputId, lngInputId, searchInputId, searchBtnId, clearBtnId, geoBtnId, suggestListId) {
    if (typeof ymaps === 'undefined') {
        setTimeout(() => initMapForModal(containerId, latInputId, lngInputId, searchInputId, searchBtnId, clearBtnId, geoBtnId, suggestListId), 500);
        return;
    }
    ymaps.ready(() => {
        const container = document.getElementById(containerId);
        if (!container || container._map) return;
        const lat = parseFloat(document.getElementById(latInputId).value) || 55.75;
        const lng = parseFloat(document.getElementById(lngInputId).value) || 37.62;
        const map = new ymaps.Map(container, {
            center: [lat, lng],
            zoom: 12,
            controls: ['zoomControl']
        });
        container._map = map;
        let placemark = null;
        if (document.getElementById(latInputId).value && document.getElementById(lngInputId).value) {
            placemark = new ymaps.Placemark([lat, lng], {}, { draggable: true });
            map.geoObjects.add(placemark);
        }
        map.events.add('click', function(e) {
            const coords = e.get('coords');
            document.getElementById(latInputId).value = coords[0];
            document.getElementById(lngInputId).value = coords[1];
            if (placemark) {
                placemark.geometry.setCoordinates(coords);
            } else {
                placemark = new ymaps.Placemark(coords, {}, { draggable: true });
                map.geoObjects.add(placemark);
            }
            ymaps.geocode(coords).then(res => {
                const first = res.geoObjects.get(0);
                if (first) document.getElementById(searchInputId).value = first.getAddressLine();
            }).catch(() => showNotification('Ошибка геокодирования', 'error'));
        });
        const suggestList = document.getElementById(suggestListId);
        const searchInput = document.getElementById(searchInputId);
        let suggestTimer = null;
        searchInput.addEventListener('input', function() {
            const query = this.value.trim();
            if (query.length < 2) {
                suggestList.style.display = 'none';
                return;
            }
            clearTimeout(suggestTimer);
            suggestTimer = setTimeout(() => {
                ymaps.suggest(query, { results: 5 })
                    .then(res => {
                        suggestList.innerHTML = '';
                        if (res.length === 0) {
                            suggestList.style.display = 'none';
                            return;
                        }
                        res.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'suggest-item';
                            div.textContent = item;
                            div.addEventListener('mousedown', function(e) {
                                e.preventDefault();
                                searchInput.value = item;
                                suggestList.style.display = 'none';
                                ymaps.geocode(item)
                                    .then(geoRes => {
                                        const first = geoRes.geoObjects.get(0);
                                        if (!first) {
                                            showNotification('Адрес не найден', 'error');
                                            return;
                                        }
                                        const coords = first.geometry.getCoordinates();
                                        map.setCenter(coords, 14);
                                        document.getElementById(latInputId).value = coords[0];
                                        document.getElementById(lngInputId).value = coords[1];
                                        if (placemark) {
                                            placemark.geometry.setCoordinates(coords);
                                        } else {
                                            placemark = new ymaps.Placemark(coords, {}, { draggable: true });
                                            map.geoObjects.add(placemark);
                                        }
                                        searchInput.value = first.getAddressLine();
                                    })
                                    .catch(() => showNotification('Ошибка при определении адреса', 'error'));
                            });
                            suggestList.appendChild(div);
                        });
                        suggestList.style.display = 'block';
                    })
                    .catch(() => {
                        suggestList.style.display = 'none';
                    });
            }, 200);
        });
        searchInput.addEventListener('blur', function() {
            setTimeout(() => {
                suggestList.style.display = 'none';
            }, 300);
        });
        document.getElementById(searchBtnId).addEventListener('click', function() {
            const query = searchInput.value.trim();
            if (!query) return;
            ymaps.geocode(query)
                .then(res => {
                    const first = res.geoObjects.get(0);
                    if (!first) {
                        showNotification('Адрес не найден', 'error');
                        return;
                    }
                    const coords = first.geometry.getCoordinates();
                    map.setCenter(coords, 14);
                    document.getElementById(latInputId).value = coords[0];
                    document.getElementById(lngInputId).value = coords[1];
                    if (placemark) {
                        placemark.geometry.setCoordinates(coords);
                    } else {
                        placemark = new ymaps.Placemark(coords, {}, { draggable: true });
                        map.geoObjects.add(placemark);
                    }
                    searchInput.value = first.getAddressLine();
                    suggestList.style.display = 'none';
                })
                .catch(() => showNotification('Ошибка поиска адреса', 'error'));
        });
        document.getElementById(clearBtnId).addEventListener('click', function() {
            document.getElementById(latInputId).value = '';
            document.getElementById(lngInputId).value = '';
            searchInput.value = '';
            if (placemark) {
                map.geoObjects.remove(placemark);
                placemark = null;
            }
            map.setCenter([55.75, 37.62], 10);
            suggestList.style.display = 'none';
        });
        document.getElementById(geoBtnId).addEventListener('click', function() {
            ymaps.geolocation.get({
                provider: 'browser',
                mapStateAutoApply: true
            })
            .then(res => {
                const coords = res.geoObjects.get(0).geometry.getCoordinates();
                map.setCenter(coords, 14);
                document.getElementById(latInputId).value = coords[0];
                document.getElementById(lngInputId).value = coords[1];
                if (placemark) {
                    placemark.geometry.setCoordinates(coords);
                } else {
                    placemark = new ymaps.Placemark(coords, {}, { draggable: true });
                    map.geoObjects.add(placemark);
                }
                ymaps.geocode(coords).then(res2 => {
                    const first = res2.geoObjects.get(0);
                    if (first) searchInput.value = first.getAddressLine();
                });
            })
            .catch(() => showNotification('Не удалось определить местоположение', 'error'));
        });
    });
}

// ========== ТОКЕН ИЗ URL ==========
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        localStorage.setItem('token', token);
        window.location.href = window.location.pathname;
        return;
    }
})();

const API_URL = '/api';
let currentToken = localStorage.getItem('token');
let currentMediaList = [];
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let favoritedStatus = {};
let isModerator = false;
let currentMyListings = [];
let currentArchivedListings = [];
let currentFavoritesList = [];

// ===== ДОБАВЛЕНО: ID ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ДЛЯ КОНТАКТОВ =====
let currentUserId = null;
if (currentToken) {
    try {
        const decoded = JSON.parse(atob(currentToken.split('.')[1]));
        currentUserId = decoded.userId;
    } catch(e) {}
}
window.currentUserId = currentUserId;

// ========== ПЕРЕМЕННЫЕ ДЛЯ КАРТЫ ==========
let map = null;
let mapObjects = null;
let currentMapMode = false;
let userLocation = null;
let selectedLocation = null;
let mapInitPromise = null;
let markers = [];
let clusterer = null;
let mapHighlightActive = false;

function showNotification(m, t) { var n = document.getElementById('notification'); n.textContent = m; n.className = 'notification ' + t; n.style.display = 'block'; setTimeout(() => n.style.display = 'none', 3000); }
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function escapeHtml(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ========== ФУНКЦИИ ДЛЯ РЕГИОНОВ И ГОРОДОВ ==========
async function loadRegionsForSelect(selectId) {
    try {
        const resp = await fetch('/api/cities/regions/all');
        const regions = await resp.json();
        regions.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">-- Выберите регион --</option>';
        regions.forEach(region => {
            select.innerHTML += `<option value="${region.id}">${escapeHtml(region.name)}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function loadCitiesByRegionForSelect(regionId, targetSelectId, cityGroupId) {
    if (!regionId) {
        const select = document.getElementById(targetSelectId);
        if (select) select.innerHTML = '<option value="">-- Сначала выберите регион --</option>';
        const group = document.getElementById(cityGroupId);
        if (group) group.style.display = 'none';
        return;
    }
    try {
        const resp = await fetch(`/api/cities?region_id=${regionId}&limit=500`);
        const cities = await resp.json();
        cities.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        const select = document.getElementById(targetSelectId);
        select.innerHTML = '<option value="">-- Выберите город --</option>';
        cities.forEach(city => {
            select.innerHTML += `<option value="${city.id}">${escapeHtml(city.name)}</option>`;
        });
        const group = document.getElementById(cityGroupId);
        if (group) group.style.display = 'block';
    } catch(e) { console.error(e); }
}

async function loadRegionsForFilter() {
    try {
        const resp = await fetch('/api/cities/regions/all');
        const regions = await resp.json();
        regions.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        const select = document.getElementById('filterRegion');
        select.innerHTML = '<option value="all">Все регионы</option>';
        regions.forEach(region => {
            select.innerHTML += `<option value="${region.id}">${escapeHtml(region.name)}</option>`;
        });
    } catch(e) { console.error(e); }
}

document.getElementById('filterRegion')?.addEventListener('change', async (e) => {
    const regionId = e.target.value;
    if (regionId === 'all') {
        document.getElementById('cityFilterGroup').style.display = 'none';
        document.getElementById('filterCity').innerHTML = '<option value="all">Все города</option>';
        applyFilters();
        return;
    }
    try {
        const resp = await fetch(`/api/cities?region_id=${regionId}&limit=500`);
        const cities = await resp.json();
        cities.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        const citySelect = document.getElementById('filterCity');
        citySelect.innerHTML = '<option value="all">Все города</option>';
        cities.forEach(city => {
            citySelect.innerHTML += `<option value="${city.id}">${escapeHtml(city.name)}</option>`;
        });
        document.getElementById('cityFilterGroup').style.display = 'block';
        applyFilters();
    } catch(e) { console.error(e); }
});

document.getElementById('filterCity')?.addEventListener('change', () => applyFilters());
document.getElementById('filterType')?.addEventListener('change', () => applyFilters());
document.getElementById('filterSort')?.addEventListener('change', () => applyFilters());
document.getElementById('filterRadius')?.addEventListener('change', () => { if (currentMapMode) applyFilters(); });

// ========== ПЕРЕКЛЮЧЕНИЕ МЕЖДУ СПИСКОМ И КАРТОЙ ==========
document.getElementById('viewGrid')?.addEventListener('click', function() {
    currentMapMode = false;
    document.getElementById('viewGrid').classList.add('active');
    document.getElementById('viewMap').classList.remove('active');
    document.getElementById('listings').style.display = 'grid';
    document.getElementById('mapContainer').classList.remove('active');
    document.getElementById('mapContainer').classList.remove('highlight');
    mapHighlightActive = false;
    document.getElementById('pagination').style.display = 'flex';
    applyFilters();
});

document.getElementById('viewMap')?.addEventListener('click', function() {
    currentMapMode = true;
    document.getElementById('viewMap').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
    document.getElementById('listings').style.display = 'none';
    document.getElementById('mapContainer').classList.add('active');
    document.getElementById('pagination').style.display = 'none';
    initMap().then(() => {
        applyFilters();
    });
});

// ========== УПРАВЛЕНИЕ ВЫПАДАЮЩИМ МЕНЮ МЕСТОПОЛОЖЕНИЯ ==========
document.getElementById('locationToggleBtn')?.addEventListener('click', function(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('locationDropdown');
    dropdown.classList.toggle('active');
});

document.addEventListener('click', function(e) {
    const wrapper = document.querySelector('.location-btn-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById('locationDropdown').classList.remove('active');
    }
});

// ========== АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ==========
document.getElementById('autoLocationBtn')?.addEventListener('click', function() {
    document.getElementById('locationDropdown').classList.remove('active');
    if (!currentMapMode) {
        showNotification('Переключитесь на режим карты', 'error');
        return;
    }
    initMap().then(() => {
        if (userLocation) {
            selectedLocation = userLocation;
            if (mapObjects) {
                map.geoObjects.remove(mapObjects);
            }
            mapObjects = new ymaps.Placemark([userLocation.lat, userLocation.lng], {
                hintContent: 'Моё местоположение',
                balloonContent: 'Поиск в радиусе'
            }, {
                preset: 'islands#blueDotIconWithCaption',
                draggable: true
            });
            map.geoObjects.add(mapObjects);
            map.setCenter([userLocation.lat, userLocation.lng], 12);
            applyFilters();
            showNotification('Местоположение определено автоматически', 'success');
        } else {
            showNotification('Не удалось определить местоположение', 'error');
        }
    });
});

// ========== УКАЗАТЬ НА КАРТЕ ==========
document.getElementById('mapLocationBtn')?.addEventListener('click', function() {
    document.getElementById('locationDropdown').classList.remove('active');
    if (!currentMapMode) {
        showNotification('Переключитесь на режим карты', 'error');
        return;
    }
    initMap().then(() => {
        mapHighlightActive = true;
        document.getElementById('mapContainer').classList.add('highlight');
        showNotification('Кликните на карту, чтобы выбрать местоположение', 'success');
        if (mapObjects) {
            map.geoObjects.remove(mapObjects);
            mapObjects = null;
        }
        selectedLocation = null;
        applyFilters();
    });
});

// ========== ИНИЦИАЛИЗАЦИЯ КАРТЫ ==========
function initMap() {
    if (mapInitPromise) return mapInitPromise;
    mapInitPromise = new Promise((resolve, reject) => {
        if (typeof ymaps === 'undefined') {
            const checkYmaps = setInterval(() => {
                if (typeof ymaps !== 'undefined') {
                    clearInterval(checkYmaps);
                    ymaps.ready(() => {
                        createMap().then(resolve).catch(reject);
                    });
                }
            }, 100);
            setTimeout(() => {
                clearInterval(checkYmaps);
                reject('Таймаут загрузки Яндекс.Карт');
            }, 10000);
            return;
        }
        ymaps.ready(() => {
            createMap().then(resolve).catch(reject);
        });
    });
    return mapInitPromise;
}

async function createMap() {
    const container = document.getElementById('map');
    if (!container) return;
    if (map) return map;
    const defaultCoords = [55.75, 37.62];
    map = new ymaps.Map(container, {
        center: defaultCoords,
        zoom: 10,
        controls: ['zoomControl', 'geolocationControl']
    });
    clusterer = new ymaps.Clusterer({
        preset: 'islands#blueClusterIcons',
        groupByCoordinates: false,
        clusterDisableClickZoom: false,
        clusterHideIconOnBalloonOpen: true,
        geoObjectHideIconOnBalloonOpen: true
    });
    map.geoObjects.add(clusterer);
    map.events.add('click', function(e) {
        const coords = e.get('coords');
        selectedLocation = { lat: coords[0], lng: coords[1] };
        if (mapObjects) {
            map.geoObjects.remove(mapObjects);
        }
        mapObjects = new ymaps.Placemark(coords, {
            hintContent: 'Выбранное местоположение',
            balloonContent: 'Поиск в радиусе'
        }, {
            preset: 'islands#redDotIconWithCaption',
            draggable: true
        });
        map.geoObjects.add(mapObjects);
        if (mapHighlightActive) {
            mapHighlightActive = false;
            document.getElementById('mapContainer').classList.remove('highlight');
        }
        applyFilters();
    });
    try {
        const geolocation = await ymaps.geolocation.get({
            provider: 'browser',
            mapStateAutoApply: true
        });
        const coords = geolocation.geoObjects.get(0).geometry.getCoordinates();
        userLocation = { lat: coords[0], lng: coords[1] };
        map.setCenter(coords, 12);
    } catch(e) {
        console.warn('Геолокация не доступна', e);
        map.setCenter(defaultCoords, 10);
    }
    return map;
}

// ========== ОТОБРАЖЕНИЕ ОБЪЯВЛЕНИЙ НА КАРТЕ ==========
function renderMapListings(listings) {
    if (!map || !clusterer) return;
    clusterer.removeAll();
    if (!listings || listings.length === 0) return;
    const geoObjects = [];
    for (const l of listings) {
        if (!l.lat || !l.lng) continue;
        const coords = [parseFloat(l.lat), parseFloat(l.lng)];
        const balloonContent = `
            <div style="max-width:250px;">
                <strong>${escapeHtml(l.title)}</strong><br>
                Цена: ${l.price.toLocaleString()} ₽
                ${l.price_max ? ` – ${l.price_max.toLocaleString()} ₽` : ''}
                <br>
                <a href="/listing.html?id=${l.id}" target="_blank">Подробнее</a>
            </div>
        `;
        const placemark = new ymaps.Placemark(coords, {
            balloonContent: balloonContent,
            hintContent: escapeHtml(l.title)
        }, {
            preset: 'islands#blueDotIcon',
            balloonMaxWidth: 300
        });
        geoObjects.push(placemark);
    }
    clusterer.add(geoObjects);
    if (selectedLocation) {
        map.setCenter([selectedLocation.lat, selectedLocation.lng], 12);
    } else if (geoObjects.length > 0) {
        map.setBounds(clusterer.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 30
        });
    }
}
// ========== applyFilters (С ПОДДЕРЖКОЙ ДИАПАЗОНА ЦЕН И currentLimit) ==========
async function applyFilters() {
    console.log('🔄 applyFilters вызвана');
    if (isLoading) return;
    isLoading = true;
    document.getElementById('loadingIndicator').style.display = 'block';

    let categoryId = 'all';
    const catSelect = document.getElementById('filterCategory');
    if (catSelect && catSelect.style.display !== 'none' && catSelect.value !== 'all') {
        categoryId = catSelect.value;
        console.log('✅ Выбрана категория ID:', categoryId);
    } else {
        const subgroupSelect = document.getElementById('filterSubgroup');
        if (subgroupSelect && subgroupSelect.style.display !== 'none' && subgroupSelect.value !== 'all') {
            categoryId = subgroupSelect.value;
            console.log('✅ Выбрана подгруппа ID:', categoryId);
        } else {
            const groupSelect = document.getElementById('filterGroup');
            if (groupSelect && groupSelect.value !== 'all') {
                categoryId = groupSelect.value;
                console.log('✅ Выбрана группа ID:', categoryId);
            } else {
                console.log('ℹ️ Категория не выбрана, фильтр по всем');
            }
        }
    }

    let regionId = 'all';
    const regionSelect = document.getElementById('filterRegion');
    if (regionSelect && regionSelect.value !== 'all') {
        regionId = regionSelect.value;
    }
    let cityId = 'all';
    const citySelect = document.getElementById('filterCity');
    if (citySelect && citySelect.style.display !== 'none' && citySelect.value !== 'all') {
        cityId = citySelect.value;
    }
    let type = 'all';
    const typeSelect = document.getElementById('filterType');
    if (typeSelect && typeSelect.value !== 'all') {
        type = typeSelect.value;
    }
    let sort = 'date_desc';
    const sortSelect = document.getElementById('filterSort');
    if (sortSelect && sortSelect.value) {
        sort = sortSelect.value;
    }
    let lat = null, lng = null, radius = null;
    if (currentMapMode && selectedLocation) {
        lat = selectedLocation.lat;
        lng = selectedLocation.lng;
        const radiusInput = document.getElementById('filterRadius');
        radius = radiusInput ? parseFloat(radiusInput.value) || 10 : 10;
    }

    // ===== ИСПОЛЬЗУЕМ currentLimit вместо 22 =====
    let url = API_URL + '/listings/filter?page=' + currentPage + '&limit=' + currentLimit;
    if (categoryId !== 'all') url += '&category_id=' + categoryId;
    if (cityId !== 'all') {
        url += '&city_id=' + cityId;
    } else if (regionId !== 'all') {
        url += '&region_id=' + regionId;
    }
    if (type !== 'all') url += '&type=' + type;
    if (sort) url += '&sort=' + sort;
    if (lat !== null && lng !== null) {
        url += '&lat=' + lat + '&lng=' + lng + '&radius=' + radius;
    }
    const min = document.getElementById('minPrice').value;
    const max = document.getElementById('maxPrice').value;
    const search = document.getElementById('searchText').value;
    if (min) url += '&min_price=' + min;
    if (max) url += '&max_price=' + max;
    if (search) url += '&search=' + encodeURIComponent(search);

    console.log('🌐 Запрос:', url);
    try {
        let r = await fetch(url);
        let data = await r.json();
        let listings = data.listings || [];
        totalPages = data.pagination ? data.pagination.pages : 1;

        // ========== НОВЫЙ БЛОК ДЛЯ ОТОБРАЖЕНИЯ НАЗВАНИЯ КАТЕГОРИИ И КНОПКИ "i" ==========
        const infoBar = document.getElementById('categoryInfoBar');
        const nameDisplay = document.getElementById('categoryNameDisplay');
        const infoBtn = document.getElementById('categoryInfoBtn');

        if (categoryId && categoryId !== 'all') {
            try {
                const descResp = await fetch(`/api/categories/${categoryId}/description`);
                if (descResp.ok) {
                    const catData = await descResp.json();
                    let catName = 'Категория';
                    const catSelect = document.getElementById('filterCategory');
                    if (catSelect && catSelect.value !== 'all') {
                        catName = catSelect.options[catSelect.selectedIndex]?.text || 'Категория';
                    } else {
                        const subgroupSelect = document.getElementById('filterSubgroup');
                        if (subgroupSelect && subgroupSelect.value !== 'all') {
                            catName = subgroupSelect.options[subgroupSelect.selectedIndex]?.text || 'Категория';
                        } else {
                            const groupSelect = document.getElementById('filterGroup');
                            if (groupSelect && groupSelect.value !== 'all') {
                                catName = groupSelect.options[groupSelect.selectedIndex]?.text || 'Категория';
                            }
                        }
                    }
                    nameDisplay.textContent = `📂 ${catName}`;
                    infoBar.style.display = 'flex';
                    infoBtn.dataset.description = `<div class="category-description-content">${catData.description || 'Описание отсутствует'}</div>`;
                    infoBtn.dataset.title = catName;
                    if (catData.seo_title) {
                        document.title = catData.seo_title + ' | IronAds';
                    } else {
                        document.title = `Объявления в категории ${catName} | IronAds`;
                    }
                    if (catData.seo_description) {
                        const metaDesc = document.querySelector('meta[name="description"]');
                        if (metaDesc) metaDesc.content = catData.seo_description;
                    }
                } else {
                    infoBar.style.display = 'none';
                }
            } catch(e) {
                console.warn('Ошибка загрузки описания категории', e);
                infoBar.style.display = 'none';
            }
        } else {
            infoBar.style.display = 'none';
            if (typeof window.updatePageMeta === 'function') {
                window.updatePageMeta('Бесплатная доска объявлений по всей России', 'Размещайте объявления о продаже, покупке, услугах по всей России. Просто и удобно.');
            }
        }
        const oldDesc = document.getElementById('categoryDescription');
        if (oldDesc) oldDesc.style.display = 'none';

        if (!listings.length) {
            if (currentMapMode) {
                document.getElementById('listings').innerHTML = '';
                renderMapListings([]);
                document.getElementById('pagination').innerHTML = '';
                document.getElementById('loadingIndicator').style.display = 'none';
                isLoading = false;
                if (typeof window.applyCurrentViewToContainers === 'function') {
                    window.applyCurrentViewToContainers();
                }
                return;
            } else {
                document.getElementById('listings').innerHTML = '<div style="color:white;text-align:center;padding:40px;">😕 Ничего не найдено</div>';
                document.getElementById('pagination').innerHTML = '';
                document.getElementById('loadingIndicator').style.display = 'none';
                isLoading = false;
                if (typeof window.applyCurrentViewToContainers === 'function') {
                    window.applyCurrentViewToContainers();
                }
                return;
            }
        }
        if (currentToken) {
            for (let l of listings) if (favoritedStatus[l.id] === undefined) await checkFavoriteStatus(l.id);
        }
        if (currentMapMode) {
            renderMapListings(listings);
        } else {
            const view = window.listingViewMode || 'grid-large';
            if (view === 'list') renderListView(listings);
            else renderGridView(listings);
            renderPagination();
        }
        if (typeof window.applyCurrentViewToContainers === 'function') {
            window.applyCurrentViewToContainers();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
        console.error('Ошибка фильтрации:', e);
        showNotification('Ошибка загрузки объявлений', 'error');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        isLoading = false;
    }
}

// ========== GRID / LIST (С ПОДДЕРЖКОЙ ДИАПАЗОНА ЦЕН И width/height) ==========
function renderGridView(listings) {
    let html = '';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of listings) {
        let isFav = favoritedStatus[l.id] || false;
        let imageHtml = '<div class="listing-image">📷 Фото</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = '<div class="listing-image"><img src="' + l.first_media.file_path + '" alt="' + escapeHtml(l.title) + '" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML=\'📷 Фото\'"></div>';
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += '<div class="listing-card" onclick="window.location.href=\'/listing.html?id=' + l.id + '\'">';
        html += '<button class="favorite-btn ' + (isFav ? 'active' : '') + '" onclick="event.stopPropagation(); toggleFavorite(' + l.id + ', this)">' + (isFav ? '❤️' : '🤍') + '</button>';
        html += imageHtml;
        html += '<div class="listing-info">';
        html += '<div class="listing-price">' + priceDisplay + '</div>';
        html += '<div class="listing-title">' + escapeHtml(l.title) + '</div>';
        html += '<div class="listing-meta">';
        html += '<span>👤 <a href="#" onclick="event.stopPropagation(); window.location.href=\'/profile.html?id=' + l.user_id + '\'; return false;" style="color:#667eea;text-decoration:none;">' + escapeHtml(l.username) + '</a> ' + (l.is_online ? '<span class="online-indicator"></span>' : '') + '</span>';
        if (l.rating_avg && l.rating_avg > 0) html += ' | ' + renderRatingStars(l.rating_avg);
        html += ' | 📁 ' + escapeHtml(l.category_name || 'Без категории');
        if (l.city_name) html += ' | 📍 ' + escapeHtml(l.city_name);
        html += ' | <span class="listing-type-badge ' + typeClass + '">' + typeLabel + '</span>';
        html += '</div>';
        html += '<div class="listing-description">' + escapeHtml(l.description || '') + '</div>';
        if (typeof getContactsHtml === 'function') {
            html += getContactsHtml(l, currentUserId);
        }
        html += '</div></div>';
    }
    const container = document.getElementById('listings');
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
}

function renderListView(listings) {
    let html = '';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of listings) {
        let isFav = favoritedStatus[l.id] || false;
        let imageHtml = '<div class="listing-row-image">📷 Фото</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = '<div class="listing-row-image"><img src="' + l.first_media.file_path + '" alt="' + escapeHtml(l.title) + '" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML=\'📷 Фото\'"></div>';
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += '<div class="listing-row" onclick="window.location.href=\'/listing.html?id=' + l.id + '\'">';
        html += '<button class="favorite-btn ' + (isFav ? 'active' : '') + '" onclick="event.stopPropagation(); toggleFavorite(' + l.id + ', this)">' + (isFav ? '❤️' : '🤍') + '</button>';
        html += imageHtml;
        html += '<div class="listing-row-info">';
        html += '<div class="listing-row-price">' + priceDisplay + '</div>';
        html += '<div class="listing-row-title">' + escapeHtml(l.title) + '</div>';
        html += '<div class="listing-row-meta">';
        html += '<span>👤 <a href="#" onclick="event.stopPropagation(); window.location.href=\'/profile.html?id=' + l.user_id + '\'; return false;" style="color:#667eea;text-decoration:none;">' + escapeHtml(l.username) + '</a> ' + (l.is_online ? '<span class="online-indicator"></span>' : '') + '</span>';
        if (l.rating_avg && l.rating_avg > 0) html += ' | ' + renderRatingStars(l.rating_avg);
        html += ' | 📁 ' + escapeHtml(l.category_name || 'Без категории');
        if (l.city_name) html += ' | 📍 ' + escapeHtml(l.city_name);
        html += ' | <span class="listing-type-badge ' + typeClass + '">' + typeLabel + '</span>';
        html += '</div>';
        html += '<div class="listing-row-description">' + escapeHtml(l.description || '') + '</div>';
        if (typeof getContactsHtml === 'function') {
            html += getContactsHtml(l, currentUserId);
        }
        html += '</div></div>';
    }
    const container = document.getElementById('listings');
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
}

function renderPagination() {
    let container = document.getElementById('pagination');
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<button onclick="changePage(' + (currentPage-1) + ')" ' + (currentPage===1 ? 'disabled' : '') + '>◀ Назад</button>';
    let start = Math.max(1, currentPage-2);
    let end = Math.min(totalPages, currentPage+2);
    for (let i=start; i<=end; i++) html += '<button onclick="changePage(' + i + ')" class="' + (i===currentPage ? 'active' : '') + '">' + i + '</button>';
    html += '<button onclick="changePage(' + (currentPage+1) + ')" ' + (currentPage===totalPages ? 'disabled' : '') + '>Вперед ▶</button>';
    container.innerHTML = html;
}
function changePage(page) { if (isLoading) return; if (page<1 || page>totalPages) return; currentPage = page; applyFilters(); }
function renderRatingStars(rating) { if (!rating || rating === 0) return ''; return '<span class="rating-stars">⭐ ' + rating.toFixed(1) + '</span>'; }

// ========== ИЗБРАННОЕ ==========
window.showFavoritesPage = async function() {
    if (!currentToken) { showNotification('Войдите, чтобы посмотреть избранное', 'error'); return; }
    document.getElementById('mainPage').classList.add('hidden');
    document.getElementById('profilePage').classList.add('hidden');
    document.getElementById('favoritesPage').classList.remove('hidden');
    await loadFavoritesList();
    if (typeof window.applyCurrentViewToContainers === 'function') {
        window.applyCurrentViewToContainers();
    }
};

async function loadFavoritesList() {
    if (!currentToken) {
        console.warn('Попытка загрузить избранное без токена');
        return;
    }
    const container = document.getElementById('favoritesList');
    const loading = document.getElementById('favoritesLoading');
    loading.style.display = 'block';
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/my`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!resp.ok) {
            if (resp.status === 403 || resp.status === 401) {
                localStorage.removeItem('token');
                currentToken = null;
                showNotification('Сессия истекла, войдите снова', 'error');
                window.location.reload();
                return;
            }
            throw new Error(`HTTP ${resp.status}`);
        }
        const listings = await resp.json();
        currentFavoritesList = listings;
        if (!listings.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;">У вас пока нет избранных объявлений</div>';
            loading.style.display = 'none';
            return;
        }
        renderFavoritesByMode();
    } catch(e) {
        console.error(e);
        container.innerHTML = '<div style="text-align:center;padding:40px;">Ошибка загрузки</div>';
    }
    finally { loading.style.display = 'none'; }
}

function renderFavoritesGrid() {
    const container = document.getElementById('favoritesList');
    let html = '';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentFavoritesList) {
        let imageHtml = '<div class="listing-image">📷 Фото</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-image"><img loading="lazy" src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷 Фото'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-card" onclick="window.location.href='/listing.html?id=${l.id}'">
                ${imageHtml}
                <div class="listing-info">
                    <div class="listing-price">${priceDisplay}</div>
                    <div class="listing-title">${escapeHtml(l.title)}</div>
                    <div class="listing-meta">
                        👤 <a href="#" onclick="event.stopPropagation(); window.location.href='/profile.html?id=${l.user_id}'; return false;" style="color:#667eea;text-decoration:none;">${escapeHtml(l.username)}</a> ${l.is_online ? '<span class="online-indicator"></span>' : ''}
                        | 📁 ${escapeHtml(l.category_name || 'Без категории')}
                        ${l.city_name ? `| 📍 ${escapeHtml(l.city_name)}` : ''}
                        | <span class="listing-type-badge ${typeClass}">${typeLabel}</span>
                    </div>
                    <div class="listing-description">${escapeHtml(l.description || '')}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <button class="remove-fav-btn" onclick="event.stopPropagation(); removeFromFavorites(${l.id}, this)">🗑️ Удалить из избранного</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') {
        window.applyCurrentViewToContainers();
    }
}

function renderFavoritesList() {
    const container = document.getElementById('favoritesList');
    let html = '';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentFavoritesList) {
        let imageHtml = '<div class="listing-row-image">📷 Фото</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-row-image"><img loading="lazy" src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷 Фото'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-row" onclick="window.location.href='/listing.html?id=${l.id}'">
                ${imageHtml}
                <div class="listing-row-info">
                    <div class="listing-row-price">${priceDisplay}</div>
                    <div class="listing-row-title">${escapeHtml(l.title)}</div>
                    <div class="listing-row-meta">
                        👤 <a href="#" onclick="event.stopPropagation(); window.location.href='/profile.html?id=${l.user_id}'; return false;" style="color:#667eea;text-decoration:none;">${escapeHtml(l.username)}</a>
                        | 📁 ${escapeHtml(l.category_name || 'Без категории')}
                        ${l.city_name ? `| 📍 ${escapeHtml(l.city_name)}` : ''}
                        | <span class="listing-type-badge ${typeClass}">${typeLabel}</span>
                    </div>
                    <div class="listing-row-description">${escapeHtml(l.description || '')}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <button class="remove-fav-btn" onclick="event.stopPropagation(); removeFromFavorites(${l.id}, this)">🗑️ Удалить</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') {
        window.applyCurrentViewToContainers();
    }
}

function renderFavoritesByMode() {
    const viewMode = window.listingViewMode || 'grid-large';
    if (viewMode === 'list') renderFavoritesList();
    else renderFavoritesGrid();
    if (typeof window.applyCurrentViewToContainers === 'function') {
        window.applyCurrentViewToContainers();
    }
}

async function removeFromFavorites(listingId, btn) {
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ listing_id: listingId })
        });
        if (resp.ok) {
            showNotification('Удалено из избранного', 'success');
            currentFavoritesList = currentFavoritesList.filter(l => l.id !== listingId);
            renderFavoritesByMode();
            favoritedStatus[listingId] = false;
            if (currentFavoritesList.length === 0) document.getElementById('favoritesList').innerHTML = '<div style="text-align:center;padding:40px;">У вас пока нет избранных объявлений</div>';
        } else { showNotification('Ошибка', 'error'); }
    } catch(e) { showNotification('Ошибка соединения', 'error'); }
}

async function toggleFavorite(listingId, element) {
    if (!currentToken) { showNotification('Войдите, чтобы добавить в избранное', 'error'); return; }
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ listing_id: listingId })
        });
        const data = await resp.json();
        if (resp.ok) {
            favoritedStatus[listingId] = data.favorited;
            if (element) { element.textContent = data.favorited ? '❤️' : '🤍'; element.classList.toggle('active', data.favorited); }
            showNotification(data.favorited ? 'Добавлено в избранное' : 'Удалено из избранного', 'success');
        } else { showNotification(data.error || 'Ошибка', 'error'); }
    } catch(e) { showNotification('Ошибка соединения', 'error'); }
}

async function checkFavoriteStatus(listingId) {
    if (!currentToken) return false;
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/check/${listingId}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const data = await resp.json();
        favoritedStatus[listingId] = data.favorited;
        return data.favorited;
    } catch(e) { return false; }
}
// ========== ЛИЧНЫЙ КАБИНЕТ И АРХИВ ==========
async function showMyListings() {
    document.getElementById('myListings').classList.remove('hidden');
    document.getElementById('favoritesInProfile').classList.add('hidden');
    document.getElementById('archivedListings').classList.add('hidden');
    document.querySelectorAll('#profilePage .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('#profilePage .tab[data-tab="my"]').classList.add('active');
    await loadMyListings();
}

async function loadMyListings() {
    if (!currentToken) {
        console.warn('Попытка загрузить мои объявления без токена');
        return;
    }
    try {
        const resp = await fetch(`${API_URL}/listings/my`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const listings = await resp.json();
        currentMyListings = listings;
        renderMyListingsByMode();
        attachBumpButtons();
    } catch(e) { console.error(e); showNotification('Ошибка загрузки объявлений', 'error'); }
}

function renderMyListingsGrid() {
    const container = document.getElementById('myListings');
    if (!currentMyListings.length) { container.innerHTML = '<div style="text-align:center;padding:40px;">У вас пока нет объявлений</div>'; return; }
    let html = '<div class="listings-grid">';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentMyListings) {
        let imageHtml = '<div class="listing-image">📷</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-image"><img src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-card" onclick="window.location.href='/listing.html?id=${l.id}'">
                ${imageHtml}
                <div class="listing-info">
                    <div class="listing-price">${priceDisplay}</div>
                    <div class="listing-title">${escapeHtml(l.title)}</div>
                    <div class="listing-meta">📁 ${escapeHtml(l.category_name || 'Без категории')}${l.city_name ? ` | 📍 ${escapeHtml(l.city_name)}` : ''} | <span class="listing-type-badge ${typeClass}">${typeLabel}</span></div>
                    <div class="listing-description">${escapeHtml(l.description || '')}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <div class="listing-actions">
                        <button class="btn-view-listing" onclick="event.stopPropagation(); window.location.href='/listing.html?id=${l.id}'">🔍 Открыть</button>
                        <button class="btn-edit-listing" onclick="event.stopPropagation(); openEditModal(${l.id})">✏️ Редактировать</button>
                        <button class="btn-delete-listing" onclick="event.stopPropagation(); archiveListing(${l.id})">🗑️ В архив</button>
                        ${getBumpButtonHtml(l)}
                    </div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') window.applyCurrentViewToContainers();
}

function renderMyListingsList() {
    const container = document.getElementById('myListings');
    if (!currentMyListings.length) { container.innerHTML = '<div style="text-align:center;padding:40px;">У вас пока нет объявлений</div>'; return; }
    let html = '<div class="listings-list">';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentMyListings) {
        let imageHtml = '<div class="listing-row-image">📷</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-row-image"><img src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-row" onclick="window.location.href='/listing.html?id=${l.id}'">
                ${imageHtml}
                <div class="listing-row-info">
                    <div class="listing-row-price">${priceDisplay}</div>
                    <div class="listing-row-title">${escapeHtml(l.title)}</div>
                    <div class="listing-row-meta">📁 ${escapeHtml(l.category_name || 'Без категории')}${l.city_name ? ` | 📍 ${escapeHtml(l.city_name)}` : ''} | <span class="listing-type-badge ${typeClass}">${typeLabel}</span></div>
                    <div class="listing-row-description">${escapeHtml((l.description || '').substring(0, 100))}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <div class="listing-actions">
                        <button class="btn-view-listing" onclick="event.stopPropagation(); window.location.href='/listing.html?id=${l.id}'">🔍 Открыть</button>
                        <button class="btn-edit-listing" onclick="event.stopPropagation(); openEditModal(${l.id})">✏️ Редактировать</button>
                        <button class="btn-delete-listing" onclick="event.stopPropagation(); archiveListing(${l.id})">🗑️ В архив</button>
                        ${getBumpButtonHtml(l)}
                    </div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') window.applyCurrentViewToContainers();
}

function renderMyListingsByMode() { const viewMode = window.listingViewMode || 'grid-large'; if (viewMode === 'list') renderMyListingsList(); else renderMyListingsGrid(); }

function getBumpButtonHtml(listing) {
    if (!listing.last_bump_at) {
        return `<button class="btn-bump-listing" data-id="${listing.id}">🚀 Поднять</button>`;
    }
    const lastBump = new Date(listing.last_bump_at);
    const now = new Date();
    const hoursDiff = (now - lastBump) / (1000 * 60 * 60);
    if (hoursDiff >= 3) {
        return `<button class="btn-bump-listing" data-id="${listing.id}">🚀 Поднять</button>`;
    } else {
        const nextBump = new Date(lastBump.getTime() + 3 * 60 * 60 * 1000);
        const minutesLeft = Math.ceil((nextBump - now) / (1000 * 60));
        return `<button class="btn-bump-listing disabled" disabled data-id="${listing.id}" style="background:#9ca3af; cursor:not-allowed;">⏳ Через ${minutesLeft} мин</button>`;
    }
}

function attachBumpButtons() {
    document.querySelectorAll('.btn-bump-listing:not(.disabled)').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const listingId = btn.dataset.id;
            if (!listingId) return;
            const originalText = btn.textContent;
            btn.textContent = '...';
            btn.disabled = true;
            try {
                const resp = await fetch(`${API_URL}/listings/${listingId}/bump`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentToken}` }
                });
                const data = await resp.json();
                if (resp.ok) {
                    showNotification('Объявление поднято!', 'success');
                    loadMyListings();
                } else {
                    showNotification(data.error || 'Ошибка', 'error');
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            } catch(e) {
                showNotification('Ошибка соединения', 'error');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        };
    });
}

async function archiveListing(id) {
    if (!currentToken) {
        showNotification('Войдите, чтобы архивировать объявление', 'error');
        return;
    }
    await fetch(API_URL + '/listings/' + id + '/archive', { method: 'POST', headers: { 'Authorization': 'Bearer ' + currentToken } });
    showNotification('Объявление перемещено в архив', 'success');
    loadMyListings();
}

async function showFavoritesInProfile() {
    document.getElementById('myListings').classList.add('hidden');
    document.getElementById('favoritesInProfile').classList.add('hidden');
    document.getElementById('archivedListings').classList.add('hidden');
    document.querySelectorAll('#profilePage .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('#profilePage .tab[data-tab="fav"]').classList.add('active');
    await loadFavoritesInProfile();
}

async function loadFavoritesInProfile() {
    if (!currentToken) {
        console.warn('Попытка загрузить избранное в профиле без токена');
        return;
    }
    const container = document.getElementById('favoritesInProfile');
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/my`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const listings = await resp.json();
        if (!listings.length) { container.innerHTML = '<div style="text-align:center;padding:40px;">У вас пока нет избранных объявлений</div>'; return; }
        let html = '<div class="listings-grid">';
        const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
        for (let l of listings) {
            let imageHtml = '<div class="listing-image">📷 Фото</div>';
            if (l.first_media && l.first_media.file_path) imageHtml = `<div class="listing-image"><img src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:200px;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷 Фото'"></div>`;
            const typeLabel = typeLabels[l.type] || 'Продам';
            const typeClass = l.type || 'sell';
            let priceDisplay = l.price.toLocaleString() + ' ₽';
            if (l.price_max && l.price_max > l.price) {
                priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
            }
            html += `
                <div class="listing-card" onclick="window.location.href='/listing.html?id=${l.id}'">
                    ${imageHtml}
                    <div class="listing-info">
                        <div class="listing-price">${priceDisplay}</div>
                        <div class="listing-title">${escapeHtml(l.title)}</div>
                        <div class="listing-meta">👤 <a href="#" onclick="event.stopPropagation(); window.location.href='/profile.html?id=${l.user_id}'; return false;" style="color:#667eea;text-decoration:none;">${escapeHtml(l.username)}</a> | 📁 ${escapeHtml(l.category_name || 'Без категории')}${l.city_name ? ` | 📍 ${escapeHtml(l.city_name)}` : ''} | <span class="listing-type-badge ${typeClass}">${typeLabel}</span></div>
                        <div class="listing-description">${escapeHtml(l.description || '')}</div>
                        ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                        <button class="remove-fav-btn" onclick="event.stopPropagation(); removeFromFavoritesInProfile(${l.id}, this)">🗑️ Удалить</button>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
        if (typeof attachContactHandlers === 'function') {
            attachContactHandlers(container);
        }
        if (typeof window.applyCurrentViewToContainers === 'function') window.applyCurrentViewToContainers();
    } catch(e) { container.innerHTML = '<div style="text-align:center;padding:40px;">Ошибка загрузки</div>'; }
}

async function removeFromFavoritesInProfile(listingId, btn) {
    if (!currentToken) {
        showNotification('Войдите, чтобы удалить из избранного', 'error');
        return;
    }
    try {
        const resp = await fetch(`${API_URL}/listings/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ listing_id: listingId })
        });
        if (resp.ok) {
            showNotification('Удалено из избранного', 'success');
            await loadFavoritesInProfile();
            favoritedStatus[listingId] = false;
        } else { showNotification('Ошибка', 'error'); }
    } catch(e) { showNotification('Ошибка соединения', 'error'); }
}

async function showArchivedListings() {
    document.getElementById('myListings').classList.add('hidden');
    document.getElementById('favoritesInProfile').classList.add('hidden');
    document.getElementById('archivedListings').classList.remove('hidden');
    document.querySelectorAll('#profilePage .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('#profilePage .tab[data-tab="archive"]').classList.add('active');
    await loadArchivedListings();
}

async function loadArchivedListings() {
    if (!currentToken) {
        console.warn('Попытка загрузить архив без токена');
        return;
    }
    try {
        const resp = await fetch(`${API_URL}/listings/my/archived`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const listings = await resp.json();
        currentArchivedListings = listings;
        renderArchivedByMode();
    } catch(e) { console.error(e); showNotification('Ошибка загрузки архива', 'error'); }
}

function renderArchivedGrid() {
    const container = document.getElementById('archivedListings');
    if (!currentArchivedListings.length) { container.innerHTML = '<div style="text-align:center;padding:40px;">В архиве нет объявлений</div>'; return; }
    let html = '<div class="listings-grid">';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentArchivedListings) {
        let imageHtml = '<div class="listing-image">📷</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-image"><img src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-card">
                ${imageHtml}
                <div class="listing-info">
                    <div class="listing-price">${priceDisplay}</div>
                    <div class="listing-title">${escapeHtml(l.title)}</div>
                    <div class="listing-meta"><span class="listing-type-badge ${typeClass}">${typeLabel}</span></div>
                    <div class="listing-description">${escapeHtml(l.description || '')}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <div class="listing-actions">
                        <button class="btn-secondary" onclick="restoreListing(${l.id})">🔄 Восстановить</button>
                        <button class="btn-danger" onclick="deleteListingForever(${l.id})">🗑️ Удалить навсегда</button>
                    </div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') window.applyCurrentViewToContainers();
}

function renderArchivedList() {
    const container = document.getElementById('archivedListings');
    if (!currentArchivedListings.length) { container.innerHTML = '<div style="text-align:center;padding:40px;">В архиве нет объявлений</div>'; return; }
    let html = '<div class="listings-list">';
    const typeLabels = { sell: 'Продам', buy: 'Куплю', rent: 'Сдам', exchange: 'Продам' };
    for (let l of currentArchivedListings) {
        let imageHtml = '<div class="listing-row-image">📷</div>';
        if (l.first_media && l.first_media.file_path) {
            imageHtml = `<div class="listing-row-image"><img src="${l.first_media.file_path}" alt="${escapeHtml(l.title)}" width="400" height="300" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='📷'"></div>`;
        }
        const typeLabel = typeLabels[l.type] || 'Продам';
        const typeClass = l.type || 'sell';
        let priceDisplay = l.price.toLocaleString() + ' ₽';
        if (l.price_max && l.price_max > l.price) {
            priceDisplay = l.price.toLocaleString() + ' – ' + l.price_max.toLocaleString() + ' ₽';
        }
        html += `
            <div class="listing-row">
                ${imageHtml}
                <div class="listing-row-info">
                    <div class="listing-row-price">${priceDisplay}</div>
                    <div class="listing-row-title">${escapeHtml(l.title)}</div>
                    <div class="listing-meta"><span class="listing-type-badge ${typeClass}">${typeLabel}</span></div>
                    <div class="listing-row-description">${escapeHtml(l.description || '')}</div>
                    ${typeof getContactsHtml === 'function' ? getContactsHtml(l, currentUserId) : ''}
                    <div class="listing-actions">
                        <button class="btn-secondary" onclick="restoreListing(${l.id})">🔄 Восстановить</button>
                        <button class="btn-danger" onclick="deleteListingForever(${l.id})">🗑️ Удалить</button>
                    </div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
    if (typeof attachContactHandlers === 'function') {
        attachContactHandlers(container);
    }
    if (typeof window.applyCurrentViewToContainers === 'function') window.applyCurrentViewToContainers();
}

function renderArchivedByMode() { const viewMode = window.listingViewMode || 'grid-large'; if (viewMode === 'list') renderArchivedList(); else renderArchivedGrid(); }

async function restoreListing(id) {
    if (!currentToken) {
        showNotification('Войдите, чтобы восстановить объявление', 'error');
        return;
    }
    await fetch(API_URL + '/listings/' + id + '/restore', { method: 'POST', headers: { 'Authorization': 'Bearer ' + currentToken } });
    showNotification('Восстановлено', 'success');
    showArchivedListings();
}

async function deleteListingForever(id) {
    if (!currentToken) {
        showNotification('Войдите, чтобы удалить объявление', 'error');
        return;
    }
    if (!confirm('Удалить навсегда? Это действие необратимо.')) return;
    try {
        const resp = await fetch(`${API_URL}/listings/my/${id}/permanent`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (resp.ok) {
            showNotification('Объявление удалено навсегда', 'success');
            loadArchivedListings();
        } else {
            const err = await resp.json();
            showNotification(err.error || 'Ошибка удаления', 'error');
        }
    } catch(e) { showNotification('Ошибка соединения', 'error'); }
}

function setupEditCategoryHandlers() {
    const groupSelect = document.getElementById('editGroup');
    const subgroupSelect = document.getElementById('editSubgroup');
    if (!groupSelect || !subgroupSelect) return;
    groupSelect.addEventListener('change', async function() {
        const groupId = this.value;
        const subgroupGroup = document.getElementById('editSubgroupGroup');
        const categoryGroup = document.getElementById('editCategoryGroup');
        if (!groupId) {
            subgroupGroup.style.display = 'none';
            categoryGroup.style.display = 'none';
            document.getElementById('editSubgroup').innerHTML = '<option value="">-- Сначала выберите группу --</option>';
            document.getElementById('editCategorySelect').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
            return;
        }
        subgroupGroup.style.display = 'block';
        await loadSubcategories(groupId, 'editSubgroup');
        categoryGroup.style.display = 'none';
        document.getElementById('editCategorySelect').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
    });
    subgroupSelect.addEventListener('change', async function() {
        const subgroupId = this.value;
        const categoryGroup = document.getElementById('editCategoryGroup');
        if (!subgroupId) {
            categoryGroup.style.display = 'none';
            document.getElementById('editCategorySelect').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
            return;
        }
        categoryGroup.style.display = 'block';
        await loadCategoryChildren(subgroupId, 'editCategorySelect');
    });
}

async function openEditModal(listingId) {
    try {
        const resp = await fetch(`${API_URL}/listings/${listingId}`);
        const listing = await resp.json();
        document.getElementById('editId').value = listing.id;
        document.getElementById('editTitle').value = listing.title;
        document.getElementById('editPriceMin').value = listing.price;
        document.getElementById('editPriceMax').value = listing.price_max || '';
        document.getElementById('editDescription').value = listing.description || '';
        document.getElementById('editType').value = listing.type || 'sell';
        if (listing.lat && listing.lng) {
            document.getElementById('editLat').value = listing.lat;
            document.getElementById('editLng').value = listing.lng;
        }
        let phone = listing.phone || '';
        let whatsapp = listing.whatsapp || '';
        let telegram = listing.telegram || '';
        let showPhone = listing.show_phone !== false;
        let showWhatsapp = listing.show_whatsapp !== false;
        let showTelegram = listing.show_telegram !== false;

        if (!phone && !whatsapp && !telegram) {
            try {
                const user = await loadUserProfileForCreate();
                if (user) {
                    if (!phone) phone = user.phone || '';
                    if (!whatsapp) whatsapp = user.whatsapp || '';
                    if (!telegram) telegram = user.telegram || '';
                    if (user.phone) showPhone = true;
                    if (user.whatsapp) showWhatsapp = true;
                    if (user.telegram) showTelegram = true;
                }
            } catch(e) {
                console.warn('Не удалось загрузить профиль для подстановки контактов:', e);
            }
        }

        document.getElementById('editPhone').value = phone;
        document.getElementById('editWhatsapp').value = whatsapp;
        document.getElementById('editTelegram').value = telegram;
        document.getElementById('editShowPhone').checked = showPhone;
        document.getElementById('editShowWhatsapp').checked = showWhatsapp;
        document.getElementById('editShowTelegram').checked = showTelegram;

        currentMediaList = listing.media || [];
        renderEditMediaList();
        const ancestors = await getAncestors(listing.category_id);
        let groupId = null, subgroupId = null, categoryId = null;
        for (const a of ancestors) {
            if (a.level === 1) groupId = a.id;
            else if (a.level === 2) subgroupId = a.id;
            else if (a.level === 3) categoryId = a.id;
        }
        await loadGroups('editGroup', groupId);
        if (groupId) {
            document.getElementById('editSubgroupGroup').style.display = 'block';
            await loadSubcategories(groupId, 'editSubgroup', subgroupId);
            if (subgroupId) {
                document.getElementById('editCategoryGroup').style.display = 'block';
                await loadCategoryChildren(subgroupId, 'editCategorySelect', categoryId);
            }
        }
        await loadRegionsForSelect('editRegion');
        if (listing.city_id) {
            const cityResp = await fetch(`/api/cities/${listing.city_id}`);
            const cityData = await cityResp.json();
            if (cityData.region_id) {
                document.getElementById('editRegion').value = cityData.region_id;
                await loadCitiesByRegionForSelect(cityData.region_id, 'editCity', 'editCityGroup');
                document.getElementById('editCity').value = listing.city_id;
            }
        }
        showModal('editModal');
        setTimeout(() => {
            initMapForModal('editMap', 'editLat', 'editLng', 'editMapSearch', 'editMapSearchBtn', 'editMapClearBtn', 'editMapGeoBtn', 'editSuggestList');
        }, 300);
    } catch(e) {
        showNotification('Ошибка загрузки', 'error');
    }
}

function renderEditMediaList() {
    let container = document.getElementById('editMediaList');
    if (!currentMediaList.length) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">Нет фото</div>'; return; }
    let html = '';
    for (let m of currentMediaList) {
        html += `<div class="media-item" data-id="${m.id}"><img src="${m.file_path}"><div class="media-actions"><button onclick="setMainPhoto(${m.id})">⭐ Главное</button><button onclick="deletePhoto(${m.id})">🗑️</button></div></div>`;
    }
    container.innerHTML = html;
}

async function setMainPhoto(mediaId) {
    try {
        await fetch(API_URL + '/listings/media/' + mediaId + '/main', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + currentToken } });
        showNotification('Главное фото обновлено', 'success');
        let editId = document.getElementById('editId').value;
        await openEditModal(editId);
        loadMyListings();
    } catch(e) { showNotification('Ошибка', 'error'); }
}

async function deletePhoto(mediaId) {
    if (!confirm('Удалить фото?')) return;
    try {
        await fetch(API_URL + '/listings/media/' + mediaId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + currentToken } });
        showNotification('Фото удалено', 'success');
        let editId = document.getElementById('editId').value;
        await openEditModal(editId);
        loadMyListings();
    } catch(e) { showNotification('Ошибка', 'error'); }
}

document.getElementById('submitUpdateModalBtn')?.addEventListener('click', async function() {
    let categoryId = document.getElementById('editCategorySelect').value;
    if (!categoryId) categoryId = document.getElementById('editSubgroup').value;
    if (!categoryId) categoryId = document.getElementById('editGroup').value;
    if (!categoryId) {
        showNotification('Выберите категорию (хотя бы группу)', 'error');
        return;
    }
    const cityId = document.getElementById('editCity').value;
    const type = document.getElementById('editType').value;
    const lat = document.getElementById('editLat').value;
    const lng = document.getElementById('editLng').value;
    const priceMin = document.getElementById('editPriceMin').value;
    const priceMax = document.getElementById('editPriceMax').value || null;
    if (!priceMin) { showNotification('Укажите цену от', 'error'); return; }
    if (priceMax && parseFloat(priceMax) < parseFloat(priceMin)) {
        showNotification('Максимальная цена не может быть меньше минимальной', 'error');
        return;
    }
    const phone = document.getElementById('editPhone').value.trim();
    const whatsapp = document.getElementById('editWhatsapp').value.trim();
    const telegram = document.getElementById('editTelegram').value.trim();
    const showPhone = document.getElementById('editShowPhone').checked;
    const showWhatsapp = document.getElementById('editShowWhatsapp').checked;
    const showTelegram = document.getElementById('editShowTelegram').checked;
    const updateBtn = this;
    if (updateBtn.disabled) return;
    updateBtn.disabled = true;
    updateBtn.classList.add('btn-loading');
    const originalText = updateBtn.textContent;
    updateBtn.textContent = 'Сохранение...';
    let id = document.getElementById('editId').value;
    let fd = new FormData();
    fd.append('title', document.getElementById('editTitle').value);
    fd.append('price', priceMin);
    if (priceMax) fd.append('price_max', priceMax);
    fd.append('description', document.getElementById('editDescription').value);
    fd.append('category_id', categoryId);
    fd.append('type', type);
    if (cityId) fd.append('city_id', cityId);
    if (lat && lng) {
        fd.append('lat', lat);
        fd.append('lng', lng);
    }
    fd.append('phone', phone);
    fd.append('whatsapp', whatsapp);
    fd.append('telegram', telegram);
    fd.append('show_phone', showPhone ? 'true' : 'false');
    fd.append('show_whatsapp', showWhatsapp ? 'true' : 'false');
    fd.append('show_telegram', showTelegram ? 'true' : 'false');
    let files = document.getElementById('editMedia').files;
    for (let i=0; i<files.length; i++) fd.append('media', files[i]);
    try {
        let r = await fetch(API_URL + '/listings/' + id, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + currentToken },
            body: fd
        });
        if (r.ok) {
            showNotification('Объявление обновлено', 'success');
            closeModal('editModal');
            loadMyListings();
        } else {
            let text = await r.text();
            let d;
            try { d = JSON.parse(text); } catch(e) { d = { error: text }; }
            showNotification(d.error || 'Ошибка сервера', 'error');
            console.error('Ошибка обновления объявления:', d);
        }
    } catch(e) {
        showNotification('Ошибка соединения: ' + e.message, 'error');
        console.error(e);
    } finally {
        updateBtn.disabled = false;
        updateBtn.classList.remove('btn-loading');
        updateBtn.textContent = originalText;
    }
});

document.getElementById('submitCreateModalBtn')?.addEventListener('click', async function() {
    let categoryId = null;
    const catSelect = document.getElementById('modalCategory');
    if (catSelect && catSelect.style.display !== 'none' && catSelect.value) {
        categoryId = catSelect.value;
    } else {
        const subgroupSelect = document.getElementById('modalSubgroup');
        if (subgroupSelect && subgroupSelect.style.display !== 'none' && subgroupSelect.value) {
            categoryId = subgroupSelect.value;
        } else {
            const groupSelect = document.getElementById('modalGroup');
            if (groupSelect && groupSelect.value) {
                categoryId = groupSelect.value;
            }
        }
    }
    let cityId = document.getElementById('modalCity').value;
    const type = document.getElementById('listingTypeModal').value;
    const lat = document.getElementById('createLat').value;
    const lng = document.getElementById('createLng').value;
    const priceMin = document.getElementById('listingPriceModal').value;
    const priceMax = document.getElementById('listingPriceMaxModal').value || null;
    if (!categoryId) {
        showNotification('Выберите категорию (хотя бы группу)', 'error');
        return;
    }
    if (!priceMin) { showNotification('Укажите цену от', 'error'); return; }
    if (priceMax && parseFloat(priceMax) < parseFloat(priceMin)) {
        showNotification('Максимальная цена не может быть меньше минимальной', 'error');
        return;
    }
    const phone = document.getElementById('createPhone').value.trim();
    const whatsapp = document.getElementById('createWhatsapp').value.trim();
    const telegram = document.getElementById('createTelegram').value.trim();
    const showPhone = document.getElementById('createShowPhone').checked;
    const showWhatsapp = document.getElementById('createShowWhatsapp').checked;
    const showTelegram = document.getElementById('createShowTelegram').checked;
    const submitBtn = this;
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Отправка...';
    let fd = new FormData();
    fd.append('title', document.getElementById('listingTitleModal').value);
    fd.append('price', priceMin);
    if (priceMax) fd.append('price_max', priceMax);
    fd.append('description', document.getElementById('listingDescriptionModal').value);
    fd.append('category_id', categoryId);
    fd.append('type', type);
    if (cityId) fd.append('city_id', cityId);
    if (lat && lng) {
        fd.append('lat', lat);
        fd.append('lng', lng);
    }
    fd.append('phone', phone);
    fd.append('whatsapp', whatsapp);
    fd.append('telegram', telegram);
    fd.append('show_phone', showPhone ? 'true' : 'false');
    fd.append('show_whatsapp', showWhatsapp ? 'true' : 'false');
    fd.append('show_telegram', showTelegram ? 'true' : 'false');
    let files = document.getElementById('listingMediaModal').files;
    for (let i = 0; i < files.length; i++) {
        const compressed = await safeCompressImage(files[i], 1200, 1200, 0.7);
        fd.append('media', compressed);
    }
    try {
        let r = await fetch(API_URL + '/listings', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + currentToken },
            body: fd
        });
        if (r.ok) {
            showNotification('Объявление создано!', 'success');
            closeModal('createModal');
            document.getElementById('listingTitleModal').value = '';
            document.getElementById('listingPriceModal').value = '';
            document.getElementById('listingPriceMaxModal').value = '';
            document.getElementById('listingDescriptionModal').value = '';
            document.getElementById('listingMediaModal').value = '';
            document.getElementById('modalGroup').value = '';
            document.getElementById('modalSubgroupGroup').style.display = 'none';
            document.getElementById('modalCategoryGroup').style.display = 'none';
            document.getElementById('modalSubgroup').innerHTML = '<option value="">-- Сначала выберите группу --</option>';
            document.getElementById('modalCategory').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
            document.getElementById('modalRegion').value = '';
            document.getElementById('modalCityGroup').style.display = 'none';
            document.getElementById('modalCity').innerHTML = '<option value="">-- Сначала выберите регион --</option>';
            document.getElementById('listingTypeModal').value = 'sell';
            document.getElementById('createPhone').value = '';
            document.getElementById('createWhatsapp').value = '';
            document.getElementById('createTelegram').value = '';
            document.getElementById('createShowPhone').checked = true;
            document.getElementById('createShowWhatsapp').checked = true;
            document.getElementById('createShowTelegram').checked = true;
            applyFilters();
            showMainPage();
        } else {
            let text = await r.text();
            let d;
            try { d = JSON.parse(text); } catch(e) { d = { error: text }; }
            showNotification(d.error || 'Ошибка сервера', 'error');
            console.error('Ошибка создания объявления:', d);
        }
    } catch(e) {
        showNotification('Ошибка соединения: ' + e.message, 'error');
        console.error(e);
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = originalText;
    }
});

async function loadGroups(selectId, targetValue) {
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=');
        const groups = await resp.json();
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">-- Выберите группу --</option>';
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = (g.icon || '📁') + ' ' + g.name;
            select.appendChild(opt);
        });
        if (targetValue) select.value = targetValue;
    } catch(e) { console.error(e); }
}

async function loadSubcategories(parentId, selectId, targetValue) {
    const select = document.getElementById(selectId);
    if (!select) return;
    if (!parentId) {
        select.innerHTML = '<option value="">-- Сначала выберите группу --</option>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=' + parentId);
        const categories = await resp.json();
        select.innerHTML = '<option value="">-- Выберите подгруппу --</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = (c.icon || '📂') + ' ' + c.name;
            select.appendChild(opt);
        });
        if (targetValue) select.value = targetValue;
    } catch(e) { console.error(e); }
}

async function loadCategoryChildren(parentId, selectId, targetValue) {
    const select = document.getElementById(selectId);
    if (!select) return;
    if (!parentId) {
        select.innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=' + parentId);
        const categories = await resp.json();
        select.innerHTML = '<option value="">-- Выберите категорию --</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = (c.icon || '📂') + ' ' + c.name;
            select.appendChild(opt);
        });
        if (targetValue) select.value = targetValue;
    } catch(e) { console.error(e); }
}

async function loadGroupsForFilter() {
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=');
        const groups = await resp.json();
        const select = document.getElementById('filterGroup');
        if (!select) return;
        select.innerHTML = '<option value="all">Все группы</option>';
        groups.forEach(group => {
            select.innerHTML += `<option value="${group.id}">${group.icon || '📁'} ${group.name}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function loadSubcategoriesForFilter(parentId, targetSelectId, defaultValue) {
    const select = document.getElementById(targetSelectId);
    if (!select) return;
    if (!parentId || parentId === 'all') {
        select.innerHTML = '<option value="all">Все подгруппы</option>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=' + parentId);
        const categories = await resp.json();
        select.innerHTML = '<option value="all">Все подгруппы</option>';
        categories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.icon || '📂'} ${cat.name}</option>`;
        });
        if (defaultValue && defaultValue !== 'all') select.value = defaultValue;
    } catch(e) { console.error(e); }
}

async function loadCategoryChildrenForFilter(parentId, targetSelectId) {
    const select = document.getElementById(targetSelectId);
    if (!select) return;
    if (!parentId || parentId === 'all') {
        select.innerHTML = '<option value="all">Все категории</option>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=' + parentId);
        const categories = await resp.json();
        select.innerHTML = '<option value="all">Все категории</option>';
        categories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.icon || '📂'} ${cat.name}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function loadModalGroups() {
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=');
        const groups = await resp.json();
        const select = document.getElementById('modalGroup');
        select.innerHTML = '<option value="">-- Выберите группу --</option>';
        groups.forEach(group => {
            select.innerHTML += `<option value="${group.id}">${group.icon || '📁'} ${group.name}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function loadModalSubcategories(parentId, targetSelectId) {
    if (!parentId) {
        const select = document.getElementById(targetSelectId);
        if (select) select.innerHTML = '<option value="">-- Сначала выберите группу --</option>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/categories?parent_id=' + parentId);
        const categories = await resp.json();
        const select = document.getElementById(targetSelectId);
        select.innerHTML = '<option value="">-- Выберите --</option>';
        categories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.icon || '📂'} ${cat.name}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function getAncestors(categoryId) {
    try {
        const resp = await fetch(API_URL + '/categories/ancestors/' + categoryId);
        if (!resp.ok) return [];
        const ancestors = await resp.json();
        return ancestors;
    } catch(e) { return []; }
}

async function loadCategories() {
    try {
        let r = await fetch(API_URL + '/categories');
        if (r.ok) {
            let cats = await r.json();
            let filter = document.getElementById('filterCategory');
            if (filter) {
                filter.innerHTML = '<option value="all">Все категории</option>';
                cats.forEach(c => {
                    filter.innerHTML += `<option value="${c.id}">${(c.icon || '•')} ${c.name}</option>`;
                });
            }
            let form = document.getElementById('listingCategory');
            if (form) {
                form.innerHTML = '';
                cats.forEach(c => {
                    form.innerHTML += `<option value="${c.id}">${(c.icon || '•')} ${c.name}</option>`;
                });
            }
            let edit = document.getElementById('editCategory');
            if (edit) {
                edit.innerHTML = '';
                cats.forEach(c => {
                    edit.innerHTML += `<option value="${c.id}">${(c.icon || '•')} ${c.name}</option>`;
                });
            }
        }
    } catch(e) {
        console.error('Ошибка загрузки категорий:', e);
    }
    await loadListingsWithoutFilters();
}

async function updateUnreadCount() {
    if (!currentToken) return;
    try {
        const resp = await fetch(`${API_URL}/chats/unread/count`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            const badge = document.getElementById('unreadBadge');
            if (data.count > 0) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } else {
            const badge = document.getElementById('unreadBadge');
            if (badge) badge.classList.add('hidden');
        }
    } catch(e) { console.error(e); }
}

async function checkAuth() {
    if (!currentToken) { await loadCategories(); return; }
    try {
        let r = await fetch(API_URL + '/auth/me', { headers: { 'Authorization': 'Bearer ' + currentToken } });
        if (r.ok) {
            let u = await r.json();
            document.getElementById('username').textContent = u.username;
            document.getElementById('profileUsername').value = u.username;
            document.getElementById('profilePhone').value = u.phone || '';
            document.getElementById('profileEmail').value = u.email || '';
            if (u.role === 'admin' || u.role === 'moderator') {
                isModerator = true;
                const modBtn = document.querySelector('.moderator-only');
                if (modBtn) modBtn.classList.remove('hidden');
            }
            await loadCategories();
            updateUnreadCount();
            setInterval(updateUnreadCount, 60000);
            window.addEventListener('focus', updateUnreadCount);
        } else { localStorage.removeItem('token'); currentToken = null; await loadCategories(); }
    } catch(e) { console.error(e); await loadCategories(); }
}

async function loadListingsWithoutFilters() {
    if (isLoading) return;
    isLoading = true;
    document.getElementById('loadingIndicator').style.display = 'block';
    let url = API_URL + '/listings/filter?page=' + currentPage + '&limit=' + currentLimit;
    try {
        let r = await fetch(url);
        let data = await r.json();
        let listings = data.listings || [];
        totalPages = data.pagination ? data.pagination.pages : 1;
        if (!listings.length) {
            document.getElementById('listings').innerHTML = '<div style="color:white;text-align:center;padding:40px;">😕 Объявлений пока нет</div>';
            document.getElementById('pagination').innerHTML = '';
            isLoading = false;
            document.getElementById('loadingIndicator').style.display = 'none';
            if (typeof window.applyCurrentViewToContainers === 'function') {
                window.applyCurrentViewToContainers();
            }
            return;
        }
        if (currentToken) {
            for (let l of listings) if (favoritedStatus[l.id] === undefined) await checkFavoriteStatus(l.id);
        }
        const view = window.listingViewMode || 'grid-large';
        if (view === 'list') renderListView(listings);
        else renderGridView(listings);
        renderPagination();
        if (typeof window.applyCurrentViewToContainers === 'function') {
            window.applyCurrentViewToContainers();
        }
    } catch(e) { console.error(e); }
    finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        isLoading = false;
    }
}

let hcaptchaSiteKey = null;
let hcaptchaEnabled = false;
let loginWidgetId = null;
let registerWidgetId = null;

async function loadHCaptchaSettings() {
    try {
        const resp = await fetch('/api/public-settings');
        const settings = await resp.json();
        hcaptchaEnabled = settings.hcaptcha_enabled === 'true';
        hcaptchaSiteKey = settings.hcaptcha_site_key || '';
        console.log('hCaptcha settings loaded:', { enabled: hcaptchaEnabled, siteKeyExists: !!hcaptchaSiteKey });
    } catch(e) { console.warn('Ошибка загрузки настроек капчи', e); }
}

function createCaptchaWidget(containerId, isLogin = true) {
    if (!hcaptchaEnabled || !hcaptchaSiteKey) return null;
    const container = document.getElementById(containerId);
    if (!container) return null;
    container.innerHTML = '';
    const captchaDiv = document.createElement('div');
    captchaDiv.className = 'h-captcha';
    container.appendChild(captchaDiv);
    let widgetId = null;
    const renderWidget = () => {
        if (typeof hcaptcha !== 'undefined') {
            try {
                widgetId = hcaptcha.render(captchaDiv, {
                    sitekey: hcaptchaSiteKey,
                    hl: 'ru'
                });
                if (isLogin) loginWidgetId = widgetId;
                else registerWidgetId = widgetId;
                return true;
            } catch(e) { console.warn('Ошибка рендеринга hCaptcha', e); }
        }
        return false;
    };
    if (!renderWidget()) {
        const interval = setInterval(() => {
            if (renderWidget()) clearInterval(interval);
        }, 200);
        setTimeout(() => clearInterval(interval), 5000);
    }
    return widgetId;
}

function getCaptchaToken(widgetId) {
    if (!hcaptchaEnabled || widgetId === null) return null;
    if (typeof hcaptcha !== 'undefined') {
        try {
            return hcaptcha.getResponse(widgetId);
        } catch(e) { console.warn('Ошибка получения токена капчи', e); }
    }
    return null;
}

// ===== ИСПРАВЛЕННЫЕ ФУНКЦИИ showLoginModal И showRegisterModal =====
function showLoginModal() {
    showModal('loginModal');
    if (hcaptchaEnabled && hcaptchaSiteKey) {
        let attempts = 0;
        const maxAttempts = 5;
        const tryRender = () => {
            attempts++;
            if (loginWidgetId !== null) {
                try { hcaptcha.reset(loginWidgetId); } catch(e) {}
                return;
            }
            loginWidgetId = createCaptchaWidget('loginCaptchaContainer', true);
            if (loginWidgetId !== null) {
                console.log('✅ Виджет создан (логин)');
                return;
            }
            if (attempts < maxAttempts) {
                console.log(`⏳ Попытка ${attempts}...`);
                setTimeout(tryRender, 500);
            } else {
                console.warn('⚠️ Не удалось создать виджет за ' + maxAttempts + ' попыток');
            }
        };
        setTimeout(tryRender, 400);
    }
}

function showRegisterModal() {
    const successDiv = document.getElementById('regSuccessMessage');
    const errorDiv = document.getElementById('regTermsError');
    if (successDiv) successDiv.style.display = 'none';
    if (errorDiv) errorDiv.textContent = '';
    const acceptCheckbox = document.getElementById('regAcceptTerms');
    if (acceptCheckbox) acceptCheckbox.checked = false;
    document.getElementById('regRegion').value = '';
    document.getElementById('regCityGroup').style.display = 'none';
    document.getElementById('regCity').innerHTML = '<option value="">-- Сначала выберите регион --</option>';
    document.querySelector('input[name="questionType"][value="predefined"]').checked = true;
    document.getElementById('securityQuestionSelect').style.display = 'block';
    document.getElementById('securityQuestionCustom').style.display = 'none';
    document.getElementById('securityQuestionSelect').value = '';
    document.getElementById('securityQuestionCustom').value = '';
    document.getElementById('securityAnswer').value = '';
    loadRegionsForSelect('regRegion');
    showModal('registerModal');
    if (hcaptchaEnabled && hcaptchaSiteKey) {
        let attempts = 0;
        const maxAttempts = 5;
        const tryRender = () => {
            attempts++;
            if (registerWidgetId !== null) {
                try { hcaptcha.reset(registerWidgetId); } catch(e) {}
                return;
            }
            registerWidgetId = createCaptchaWidget('registerCaptchaContainer', false);
            if (registerWidgetId !== null) {
                console.log('✅ Виджет создан (регистрация)');
                return;
            }
            if (attempts < maxAttempts) {
                console.log(`⏳ Попытка ${attempts}...`);
                setTimeout(tryRender, 500);
            } else {
                console.warn('⚠️ Не удалось создать виджет за ' + maxAttempts + ' попыток');
            }
        };
        setTimeout(tryRender, 400);
    }
}

// ===== ОСТАЛЬНЫЕ ФУНКЦИИ (LOGIN, REGISTER, UPDATE PROFILE, И Т.Д.) БЕЗ ИЗМЕНЕНИЙ =====
async function login() {
    let u = document.getElementById('loginUsername').value, p = document.getElementById('loginPassword').value;
    if (!u || !p) { showNotification('Заполните все поля', 'error'); return; }
    
    let hcaptchaToken = null;
    if (hcaptchaEnabled) {
        if (loginWidgetId === null) {
            loginWidgetId = createCaptchaWidget('loginCaptchaContainer', true);
            if (loginWidgetId === null) {
                showNotification('Ошибка капчи, попробуйте обновить страницу', 'error');
                return;
            }
        }
        hcaptchaToken = getCaptchaToken(loginWidgetId);
        if (!hcaptchaToken) {
            showNotification('Пожалуйста, подтвердите, что вы не робот', 'error');
            return;
        }
        console.log('✅ Токен капчи получен:', hcaptchaToken.substring(0, 10) + '...');
    } else {
        console.log('ℹ️ Капча отключена');
    }
    
    try {
        let r = await fetch(API_URL + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: u, 
                password: p, 
                hcaptchaToken: hcaptchaToken,
                'h-captcha-response': hcaptchaToken,
                token: hcaptchaToken
            })
        });
        let d = await r.json();
        if (r.ok) {
            localStorage.setItem('token', d.token);
            showNotification('Вход выполнен!', 'success');
            closeModal('loginModal');
            if (loginWidgetId !== null) {
                try { hcaptcha.reset(loginWidgetId); } catch(e) {}
            }
            location.reload();
        } else {
            showNotification(d.error || 'Ошибка входа', 'error');
            if (loginWidgetId !== null) {
                try { hcaptcha.reset(loginWidgetId); } catch(e) {}
            }
        }
    } catch(e) {
        showNotification('Ошибка соединения', 'error');
        console.error(e);
        if (loginWidgetId !== null) {
            try { hcaptcha.reset(loginWidgetId); } catch(e) {}
        }
    }
}

async function register() {
    const successDiv = document.getElementById('regSuccessMessage');
    const errorDiv = document.getElementById('regTermsError');
    if (successDiv) successDiv.style.display = 'none';
    if (errorDiv) errorDiv.textContent = '';
    let u = document.getElementById('regUsername').value;
    let e = document.getElementById('regEmail').value;
    let p = document.getElementById('regPassword').value;
    let ph = document.getElementById('regPhone').value;
    let cityId = document.getElementById('regCity').value;
    let accept = document.getElementById('regAcceptTerms').checked;
    let security_question = '';
    const questionType = document.querySelector('input[name="questionType"]:checked').value;
    if (questionType === 'predefined') {
        security_question = document.getElementById('securityQuestionSelect').value;
    } else {
        security_question = document.getElementById('securityQuestionCustom').value.trim();
    }
    let security_answer = document.getElementById('securityAnswer').value.trim();
    if (!u || !e || !p) {
        showNotification('Имя пользователя, email и пароль обязательны', 'error');
        return;
    }
    if (!accept) {
        if (errorDiv) errorDiv.textContent = 'Необходимо принять пользовательское соглашение';
        return;
    }
    if (!security_question || !security_answer) {
        showNotification('Выберите или введите контрольный вопрос и укажите ответ', 'error');
        return;
    }
    if (security_answer.length < 3) {
        showNotification('Ответ на контрольный вопрос должен содержать минимум 3 символа', 'error');
        return;
    }
    let hcaptchaToken = null;
    if (hcaptchaEnabled) {
        if (registerWidgetId === null) {
            registerWidgetId = createCaptchaWidget('registerCaptchaContainer', false);
            if (registerWidgetId === null) {
                showNotification('Ошибка капчи, попробуйте обновить страницу', 'error');
                return;
            }
        }
        hcaptchaToken = getCaptchaToken(registerWidgetId);
        if (!hcaptchaToken) {
            showNotification('Пожалуйста, подтвердите, что вы не робот', 'error');
            return;
        }
        console.log('✅ Токен капчи (регистрация) получен');
    }
    try {
        let r = await fetch(API_URL + '/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: u, 
                email: e, 
                password: p, 
                phone: ph, 
                acceptTerms: true, 
                city_id: cityId || null, 
                hcaptchaToken,
                'h-captcha-response': hcaptchaToken,
                token: hcaptchaToken,
                security_question, 
                security_answer 
            })
        });
        let d = await r.json();
        if (r.ok) {
            localStorage.setItem('token', d.token);
            if (successDiv) {
                successDiv.textContent = 'Регистрация успешна! Выполняется вход...';
                successDiv.style.display = 'block';
            }
            if (registerWidgetId !== null) {
                try { hcaptcha.reset(registerWidgetId); } catch(e) {}
            }
            setTimeout(() => { window.location.reload(); }, 1500);
        } else {
            showNotification(d.error || 'Ошибка регистрации', 'error');
            if (registerWidgetId !== null) {
                try { hcaptcha.reset(registerWidgetId); } catch(e) {}
            }
        }
    } catch(e) {
        showNotification('Ошибка соединения', 'error');
        if (registerWidgetId !== null) {
            try { hcaptcha.reset(registerWidgetId); } catch(e) {}
        }
    }
}

async function updateProfile() {
    let phone = document.getElementById('profilePhone').value, email = document.getElementById('profileEmail').value;
    try {
        let r = await fetch(API_URL + '/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken }, body: JSON.stringify({ phone, email }) });
        if (r.ok) showNotification('Профиль обновлён!', 'success');
        else showNotification('Ошибка', 'error');
    } catch(e) { showNotification('Ошибка соединения', 'error'); }
}

document.getElementById('submitCreateListingBtn')?.addEventListener('click', async function() {
    let categoryId = document.getElementById('listingCategory').value;
    let cityId = document.getElementById('listingCity').value;
    if (!categoryId) {
        showNotification('Выберите категорию', 'error');
        return;
    }
    const priceMin = document.getElementById('listingPrice').value;
    const priceMax = document.getElementById('listingPriceMax').value || null;
    if (!priceMin) { showNotification('Укажите цену от', 'error'); return; }
    if (priceMax && parseFloat(priceMax) < parseFloat(priceMin)) {
        showNotification('Максимальная цена не может быть меньше минимальной', 'error');
        return;
    }
    const phone = document.getElementById('createPhone')?.value?.trim() || '';
    const whatsapp = document.getElementById('createWhatsapp')?.value?.trim() || '';
    const telegram = document.getElementById('createTelegram')?.value?.trim() || '';
    const showPhone = document.getElementById('createShowPhone')?.checked ?? true;
    const showWhatsapp = document.getElementById('createShowWhatsapp')?.checked ?? true;
    const showTelegram = document.getElementById('createShowTelegram')?.checked ?? true;
    const submitBtn = this;
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Отправка...';
    let fd = new FormData();
    fd.append('title', document.getElementById('listingTitle').value);
    fd.append('price', priceMin);
    if (priceMax) fd.append('price_max', priceMax);
    fd.append('description', document.getElementById('listingDescription').value);
    fd.append('category_id', categoryId);
    fd.append('type', 'sell');
    if (cityId) fd.append('city_id', cityId);
    fd.append('phone', phone);
    fd.append('whatsapp', whatsapp);
    fd.append('telegram', telegram);
    fd.append('show_phone', showPhone ? 'true' : 'false');
    fd.append('show_whatsapp', showWhatsapp ? 'true' : 'false');
    fd.append('show_telegram', showTelegram ? 'true' : 'false');
    let files = document.getElementById('listingMedia').files;
    for (let i = 0; i < files.length; i++) {
        const compressed = await safeCompressImage(files[i], 1200, 1200, 0.7);
        fd.append('media', compressed);
    }
    try {
        let r = await fetch(API_URL + '/listings', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + currentToken },
            body: fd
        });
        if (r.ok) {
            showNotification('Объявление создано!', 'success');
            document.getElementById('listingTitle').value = '';
            document.getElementById('listingPrice').value = '';
            document.getElementById('listingPriceMax').value = '';
            document.getElementById('listingDescription').value = '';
            document.getElementById('listingMedia').value = '';
            applyFilters();
            showMainPage();
        } else {
            let text = await r.text();
            let d;
            try { d = JSON.parse(text); } catch(e) { d = { error: text }; }
            showNotification(d.error || 'Ошибка сервера', 'error');
            console.error('Ошибка создания объявления:', d);
        }
    } catch(e) {
        showNotification('Ошибка соединения: ' + e.message, 'error');
        console.error(e);
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = originalText;
    }
});

async function loadUserProfileForCreate() {
    if (!currentToken) return null;
    try {
        const resp = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (resp.ok) {
            const user = await resp.json();
            return user;
        }
    } catch(e) {
        console.warn('Ошибка загрузки профиля:', e);
    }
    return null;
}

function showCreateModal() {
    document.getElementById('modalGroup').value = '';
    document.getElementById('modalSubgroupGroup').style.display = 'none';
    document.getElementById('modalCategoryGroup').style.display = 'none';
    document.getElementById('modalSubgroup').innerHTML = '<option value="">-- Сначала выберите группу --</option>';
    document.getElementById('modalCategory').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
    document.getElementById('modalRegion').value = '';
    document.getElementById('modalCityGroup').style.display = 'none';
    document.getElementById('modalCity').innerHTML = '<option value="">-- Сначала выберите регион --</option>';
    document.getElementById('listingTitleModal').value = '';
    document.getElementById('listingPriceModal').value = '';
    document.getElementById('listingPriceMaxModal').value = '';
    document.getElementById('listingDescriptionModal').value = '';
    document.getElementById('listingMediaModal').value = '';
    document.getElementById('listingTypeModal').value = 'sell';
    document.getElementById('createLat').value = '';
    document.getElementById('createLng').value = '';
    document.getElementById('createMapSearch').value = '';

    loadUserProfileForCreate().then(user => {
        if (user) {
            document.getElementById('createPhone').value = user.phone || '';
            document.getElementById('createWhatsapp').value = user.whatsapp || '';
            document.getElementById('createTelegram').value = user.telegram || '';
            if (user.phone) document.getElementById('createShowPhone').checked = true;
            if (user.whatsapp) document.getElementById('createShowWhatsapp').checked = true;
            if (user.telegram) document.getElementById('createShowTelegram').checked = true;
        } else {
            document.getElementById('createPhone').value = '';
            document.getElementById('createWhatsapp').value = '';
            document.getElementById('createTelegram').value = '';
            document.getElementById('createShowPhone').checked = true;
            document.getElementById('createShowWhatsapp').checked = true;
            document.getElementById('createShowTelegram').checked = true;
        }
    });

    loadRegionsForSelect('modalRegion');
    loadModalGroups();
    showModal('createModal');
    setTimeout(() => {
        initMapForModal('createMap', 'createLat', 'createLng', 'createMapSearch', 'createMapSearchBtn', 'createMapClearBtn', 'createMapGeoBtn', 'createSuggestList');
    }, 300);
}

function showMainPage() { document.getElementById('profilePage').classList.add('hidden'); document.getElementById('favoritesPage').classList.add('hidden'); document.getElementById('mainPage').classList.remove('hidden'); loadListingsWithoutFilters(); }

(function patchSetListingView() {
    const originalSetView = window.setListingView;
    if (typeof originalSetView === 'function') {
        window.setListingView = function(view) {
            originalSetView(view);
            if (typeof window.applyCurrentViewToContainers === 'function') {
                window.applyCurrentViewToContainers();
            }
            if (!document.getElementById('favoritesPage').classList.contains('hidden')) {
                renderFavoritesByMode();
            }
        };
    }
})();

(function handleTabOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab === 'favorites') {
        const token = localStorage.getItem('token');
        if (token) {
            if (typeof window.showFavoritesPage === 'function') {
                window.showFavoritesPage();
            }
        } else {
            showNotification('Войдите, чтобы посмотреть избранное', 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
})();

(async function init() {
    await loadHCaptchaSettings();
    if (currentToken) checkAuth();
    else { loadCategories(); }
    document.getElementById('searchText').value = '';
    loadGroupsForFilter();
    loadModalGroups();
    loadRegionsForFilter();
    loadRegionsForSelect('listingRegion');
    loadRegionsForSelect('modalRegion');
    loadRegionsForSelect('editRegion');
    loadRegionsForSelect('regRegion');
    loadListingsWithoutFilters();
    setupEditCategoryHandlers();

    document.getElementById('filterGroup')?.addEventListener('change', async function() {
        const groupId = this.value;
        const subgroupGroup = document.getElementById('subgroupFilterGroup');
        const categoryGroup = document.getElementById('categoryFilterGroup');
        const subgroupSelect = document.getElementById('filterSubgroup');
        const categorySelect = document.getElementById('filterCategory');

        if (groupId === 'all') {
            subgroupGroup.style.display = 'none';
            categoryGroup.style.display = 'none';
            subgroupSelect.innerHTML = '<option value="all">Все подгруппы</option>';
            categorySelect.innerHTML = '<option value="all">Все категории</option>';
            applyFilters();
            return;
        }
        subgroupGroup.style.display = 'block';
        await loadSubcategoriesForFilter(groupId, 'filterSubgroup');
        categoryGroup.style.display = 'none';
        categorySelect.innerHTML = '<option value="all">Все категории</option>';
        applyFilters();
    });

    document.getElementById('filterSubgroup')?.addEventListener('change', async function() {
        const subgroupId = this.value;
        const categoryGroup = document.getElementById('categoryFilterGroup');
        const categorySelect = document.getElementById('filterCategory');

        if (subgroupId === 'all' || subgroupId === '') {
            categoryGroup.style.display = 'none';
            categorySelect.innerHTML = '<option value="all">Все категории</option>';
            applyFilters();
            return;
        }
        categoryGroup.style.display = 'block';
        await loadCategoryChildrenForFilter(subgroupId, 'filterCategory');
        applyFilters();
    });

    document.getElementById('filterCategory')?.addEventListener('change', applyFilters);

    const originalOpenEdit = window.openEditModal;
    window.openEditModal = async function(listingId) {
        await originalOpenEdit(listingId);
        setTimeout(() => {
            initMapForModal('editMap', 'editLat', 'editLng', 'editMapSearch', 'editMapSearchBtn', 'editMapClearBtn', 'editMapGeoBtn', 'editSuggestList');
        }, 300);
    };

    currentMapMode = false;
    document.getElementById('viewGrid').classList.add('active');
    document.getElementById('viewMap').classList.remove('active');
    document.getElementById('listings').style.display = 'grid';
    document.getElementById('mapContainer').classList.remove('active');
    document.getElementById('pagination').style.display = 'flex';
    window.showCreateModal = showCreateModal;
})();

function goBackInProfile() { showMyListings(); }

// ===== ПЕРЕОПРЕДЕЛЯЕМ showCreateModal ДЛЯ ГЛАВНОЙ СТРАНИЦЫ =====
(function() {
    const originalShow = window.showCreateModal;
    window.showCreateModal = function() {
        document.getElementById('modalGroup').value = '';
        document.getElementById('modalSubgroupGroup').style.display = 'none';
        document.getElementById('modalCategoryGroup').style.display = 'none';
        document.getElementById('modalSubgroup').innerHTML = '<option value="">-- Сначала выберите группу --</option>';
        document.getElementById('modalCategory').innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
        document.getElementById('modalRegion').value = '';
        document.getElementById('modalCityGroup').style.display = 'none';
        document.getElementById('modalCity').innerHTML = '<option value="">-- Сначала выберите регион --</option>';
        document.getElementById('listingTitleModal').value = '';
        document.getElementById('listingPriceModal').value = '';
        document.getElementById('listingPriceMaxModal').value = '';
        document.getElementById('listingDescriptionModal').value = '';
        document.getElementById('listingMediaModal').value = '';
        document.getElementById('listingTypeModal').value = 'sell';
        document.getElementById('createLat').value = '';
        document.getElementById('createLng').value = '';
        document.getElementById('createMapSearch').value = '';

        loadUserProfileForCreate().then(user => {
            if (user) {
                document.getElementById('createPhone').value = user.phone || '';
                document.getElementById('createWhatsapp').value = user.whatsapp || '';
                document.getElementById('createTelegram').value = user.telegram || '';
                if (user.phone) document.getElementById('createShowPhone').checked = true;
                if (user.whatsapp) document.getElementById('createShowWhatsapp').checked = true;
                if (user.telegram) document.getElementById('createShowTelegram').checked = true;
            } else {
                document.getElementById('createPhone').value = '';
                document.getElementById('createWhatsapp').value = '';
                document.getElementById('createTelegram').value = '';
                document.getElementById('createShowPhone').checked = true;
                document.getElementById('createShowWhatsapp').checked = true;
                document.getElementById('createShowTelegram').checked = true;
            }
        });

        fetch('/api/categories?parent_id=')
            .then(r => r.json())
            .then(groups => {
                const select = document.getElementById('modalGroup');
                if (select) {
                    select.innerHTML = '<option value="">-- Выберите группу --</option>';
                    groups.forEach(g => {
                        select.innerHTML += `<option value="${g.id}">${g.icon || '📁'} ${g.name}</option>`;
                    });
                }
            })
            .catch(console.error);

        fetch('/api/cities/regions/all')
            .then(r => r.json())
            .then(regions => {
                const select = document.getElementById('modalRegion');
                if (select) {
                    select.innerHTML = '<option value="">-- Выберите регион --</option>';
                    regions.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
                    regions.forEach(r => {
                        select.innerHTML += `<option value="${r.id}">${r.name}</option>`;
                    });
                }
            })
            .catch(console.error);

        const subgroupGroup = document.getElementById('modalSubgroupGroup');
        const categoryGroup = document.getElementById('modalCategoryGroup');
        const cityGroup = document.getElementById('modalCityGroup');
        if (subgroupGroup) subgroupGroup.style.display = 'none';
        if (categoryGroup) categoryGroup.style.display = 'none';
        if (cityGroup) cityGroup.style.display = 'none';

        const subgroupSelect = document.getElementById('modalSubgroup');
        const categorySelect = document.getElementById('modalCategory');
        const citySelect = document.getElementById('modalCity');
        if (subgroupSelect) subgroupSelect.innerHTML = '<option value="">-- Сначала выберите группу --</option>';
        if (categorySelect) categorySelect.innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
        if (citySelect) citySelect.innerHTML = '<option value="">-- Сначала выберите регион --</option>';

        if (typeof showModal === 'function') {
            showModal('createModal');
        } else {
            document.getElementById('createModal').style.display = 'flex';
        }

        setTimeout(() => {
            if (typeof initMapForModal === 'function') {
                initMapForModal('createMap', 'createLat', 'createLng', 'createMapSearch', 'createMapSearchBtn', 'createMapClearBtn', 'createMapGeoBtn', 'createSuggestList');
            }
        }, 300);
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    const groupSelect = document.getElementById('modalGroup');
    if (groupSelect) {
        const newGroup = groupSelect.cloneNode(true);
        groupSelect.parentNode.replaceChild(newGroup, groupSelect);
        newGroup.addEventListener('change', function() {
            const groupId = this.value;
            const subgroupSelect = document.getElementById('modalSubgroup');
            const categorySelect = document.getElementById('modalCategory');
            const subgroupGroup = document.getElementById('modalSubgroupGroup');
            const categoryGroup = document.getElementById('modalCategoryGroup');

            if (!groupId) {
                if (subgroupGroup) subgroupGroup.style.display = 'none';
                if (categoryGroup) categoryGroup.style.display = 'none';
                if (subgroupSelect) subgroupSelect.innerHTML = '<option value="">-- Сначала выберите группу --</option>';
                if (categorySelect) categorySelect.innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
                return;
            }

            if (subgroupGroup) subgroupGroup.style.display = 'block';
            if (categoryGroup) categoryGroup.style.display = 'none';
            if (categorySelect) categorySelect.innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';

            fetch('/api/categories?parent_id=' + groupId)
                .then(r => r.json())
                .then(categories => {
                    if (subgroupSelect) {
                        subgroupSelect.innerHTML = '<option value="">-- Выберите подгруппу --</option>';
                        categories.forEach(c => {
                            subgroupSelect.innerHTML += `<option value="${c.id}">${c.icon || '📂'} ${c.name}</option>`;
                        });
                    }
                })
                .catch(console.error);
        });
    }

    const subgroupSelect = document.getElementById('modalSubgroup');
    if (subgroupSelect) {
        const newSubgroup = subgroupSelect.cloneNode(true);
        subgroupSelect.parentNode.replaceChild(newSubgroup, subgroupSelect);
        newSubgroup.addEventListener('change', function() {
            const subgroupId = this.value;
            const categorySelect = document.getElementById('modalCategory');
            const categoryGroup = document.getElementById('modalCategoryGroup');

            if (!subgroupId) {
                if (categoryGroup) categoryGroup.style.display = 'none';
                if (categorySelect) categorySelect.innerHTML = '<option value="">-- Сначала выберите подгруппу --</option>';
                return;
            }

            if (categoryGroup) categoryGroup.style.display = 'block';

            fetch('/api/categories?parent_id=' + subgroupId)
                .then(r => r.json())
                .then(categories => {
                    if (categorySelect) {
                        categorySelect.innerHTML = '<option value="">-- Выберите категорию --</option>';
                        categories.forEach(c => {
                            categorySelect.innerHTML += `<option value="${c.id}">${c.icon || '📂'} ${c.name}</option>`;
                        });
                    }
                })
                .catch(console.error);
        });
    }

    const regionSelect = document.getElementById('modalRegion');
    if (regionSelect) {
        const newRegion = regionSelect.cloneNode(true);
        regionSelect.parentNode.replaceChild(newRegion, regionSelect);
        newRegion.addEventListener('change', function() {
            const regionId = this.value;
            const citySelect = document.getElementById('modalCity');
            const cityGroup = document.getElementById('modalCityGroup');

            if (!regionId) {
                if (cityGroup) cityGroup.style.display = 'none';
                if (citySelect) citySelect.innerHTML = '<option value="">-- Сначала выберите регион --</option>';
                return;
            }

            if (cityGroup) cityGroup.style.display = 'block';

            fetch('/api/cities?region_id=' + regionId + '&limit=500')
                .then(r => r.json())
                .then(cities => {
                    if (citySelect) {
                        citySelect.innerHTML = '<option value="">-- Выберите город --</option>';
                        cities.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
                        cities.forEach(c => {
                            citySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                        });
                    }
                })
                .catch(console.error);
        });
    }

    // ===== ИНИЦИАЛИЗАЦИЯ SELECT ДЛЯ КОЛИЧЕСТВА =====
    const limitSelect = document.getElementById('limitSelect');
    if (limitSelect) {
        limitSelect.value = currentLimit;
        limitSelect.addEventListener('change', function() {
            setLimit(this.value);
        });
    }
});

document.getElementById('categoryInfoBtn')?.addEventListener('click', function() {
    const desc = this.dataset.description || 'Описание отсутствует';
    const title = this.dataset.title || 'Категория';
    document.getElementById('descModalTitle').textContent = title;
    document.getElementById('descModalBody').innerHTML = desc;
    document.getElementById('categoryDescriptionModal').style.display = 'flex';
});

function closeCategoryDescription() {
    document.getElementById('categoryDescriptionModal').style.display = 'none';
}

document.getElementById('categoryDescriptionModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeCategoryDescription();
    }
});

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ИНИЦИАЛИЗАЦИИ КАПЧИ =====
window.initLoginCaptcha = function() {
    if (hcaptchaEnabled && hcaptchaSiteKey) {
        loginWidgetId = createCaptchaWidget('loginCaptchaContainer', true);
    }
};
window.initRegisterCaptcha = function() {
    if (hcaptchaEnabled && hcaptchaSiteKey) {
        registerWidgetId = createCaptchaWidget('registerCaptchaContainer', false);
    }
};