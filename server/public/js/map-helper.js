// map-helper.js – исправленная версия initMapForModal
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
                            // Используем mousedown, чтобы не терять фокус
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