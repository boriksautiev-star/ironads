// ============================================================
// common.js – ПОЛНАЯ ВЕРСИЯ С ОТКЛЮЧЁННОЙ ДИНАМИЧЕСКОЙ РЕГУЛИРОВКОЙ ОТСТУПА
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Подключаем header.css, если его нет
    if (!document.querySelector('link[href="/css/header.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/header.css';
        document.head.appendChild(link);
    }

    // ===== ИНИЦИАЛИЗАЦИЯ ТЁМНОЙ ТЕМЫ =====
    (function initTheme() {
        const savedTheme = localStorage.getItem('ironads_theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (savedTheme === 'light') {
            document.body.classList.remove('dark-theme');
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
            localStorage.setItem('ironads_theme', 'dark');
        } else {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('ironads_theme', 'light');
        }
    })();

    // ===== БАННЕР ДЛЯ IOS =====
    function showInstallPrompt() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (!isIOS) return;
        if (window.navigator.standalone) return;
        if (localStorage.getItem('ios_install_prompt_dismissed')) return;

        const banner = document.createElement('div');
        banner.id = 'ios-install-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            padding: 16px 20px;
            border-top: 3px solid #667eea;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
            z-index: 9999;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: 'Inter', sans-serif;
            animation: slideUp 0.4s ease;
            backdrop-filter: blur(8px);
        `;
        banner.innerHTML = `
            <div style="flex:1;">
                <strong style="font-size:16px;">📲 Добавьте IronAds на экран «Домой»</strong>
                <p style="margin:4px 0 0; font-size:14px; color:#666;">Нажмите «Поделиться» → «На экран «Домой»»</p>
            </div>
            <button id="ios-install-close" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 30px; font-weight: 600; font-size:15px; cursor: pointer; min-height:44px;">OK</button>
        `;
        document.body.appendChild(banner);
        document.getElementById('ios-install-close').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('ios_install_prompt_dismissed', 'true');
        });
    }
    if (!document.querySelector('#ios-anim-style')) {
        const style = document.createElement('style');
        style.id = 'ios-anim-style';
        style.textContent = `
            @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    // ===== ДОБАВЛЕНИЕ КНОПКИ VK В МОДАЛКУ ВХОДА =====
    function addVkButtonToLoginModal() {
        const loginModal = document.getElementById('loginModal');
        if (!loginModal) return;
        const yandexContainer = loginModal.querySelector('div[style*="text-align: center; margin-top: 1rem;"]');
        if (yandexContainer) {
            if (yandexContainer.querySelector('.vk-login-btn-modal')) return;
            const vkLink = document.createElement('a');
            vkLink.href = '/auth/vk';
            vkLink.className = 'vk-login-btn-modal';
            vkLink.style.cssText = 'display: inline-block; background: #4a76a8; color: white; padding: 8px 16px; border-radius: 8px; text-decoration: none; margin-left: 8px; font-size:0.85rem;';
            vkLink.textContent = 'Войти через VK';
            yandexContainer.appendChild(vkLink);
        }
    }

    // ===== ОТСТУП ПОД ШАПКУ – ДИНАМИЧЕСКАЯ РЕГУЛИРОВКА ОТКЛЮЧЕНА (используется фиксированный CSS) =====
    // Функция оставлена для совместимости, но ничего не делает
    function adjustHeaderOffset() {
        // Отступ теперь задаётся через CSS: body { padding-top: 150px !important; }
        // Динамическая регулировка отключена, чтобы не перебивать фиксированное значение.
        return;
    }

    // ===== ШАПКА =====
    const headerContainer = document.getElementById('main-header');
    if (!headerContainer) return;

    const token = localStorage.getItem('token');
    let userRole = 'user';
    let userName = '';

    if (token) {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const user = await res.json();
                userRole = user.role;
                userName = user.username;
            } else {
                localStorage.removeItem('token');
                window.location.reload();
                return;
            }
        } catch(e) { console.warn(e); }
    }

    const isLoggedIn = !!token;

    window.applyCurrentViewToContainers = function() {
        const view = window.listingViewMode || 'grid-large';
        const isMobile = window.innerWidth <= 768;
        const containers = document.querySelectorAll(
            '#listings, #myListings, #favoritesList, #favoritesInProfile, #archivedListings, ' +
            '#historyContainer, #listingsList, .listings-grid, .listings-list, .profile-listings'
        );
        containers.forEach(container => {
            container.classList.remove('grid-view-large', 'grid-view-compact', 'list-view');
            container.style.display = '';
            container.style.gridTemplateColumns = '';
            container.style.gap = '';
            container.style.flexDirection = '';
            container.style.alignItems = '';
            if (view === 'grid-large') {
                container.classList.add('grid-view-large');
                container.style.display = 'grid';
                if (isMobile) container.style.gridTemplateColumns = '1fr';
                else container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
                container.style.gap = '1.5rem';
            } else if (view === 'grid-small') {
                container.classList.add('grid-view-compact');
                container.style.display = 'grid';
                if (isMobile) {
                    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
                    container.style.gap = '0.75rem';
                } else {
                    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
                    container.style.gap = '1rem';
                }
            } else if (view === 'list') {
                container.classList.add('list-view');
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '1rem';
                container.style.alignItems = 'stretch';
            }
        });
        if (view === 'list') {
            document.querySelectorAll('.listing-row').forEach(row => {
                row.style.flexDirection = isMobile ? 'column' : 'row';
                row.style.gap = isMobile ? '0.75rem' : '1.25rem';
            });
        } else {
            document.querySelectorAll('.listing-row').forEach(row => {
                row.style.flexDirection = '';
                row.style.gap = '';
            });
        }
    };

    let savedView = localStorage.getItem('listingView');
    if (!savedView) {
        savedView = window.innerWidth <= 768 ? 'grid-small' : 'grid-large';
        localStorage.setItem('listingView', savedView);
    }
    window.listingViewMode = savedView;

    window.setListingView = function(view) {
        window.listingViewMode = view;
        localStorage.setItem('listingView', view);
        window.applyCurrentViewToContainers();
        document.querySelectorAll('.view-toggle[data-view]').forEach(btn => {
            if (btn.dataset.view === view) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        if (typeof window.refreshCurrentListings === 'function') {
            window.refreshCurrentListings();
        } else {
            if (typeof window.loadListings === 'function') window.loadListings();
            if (typeof window.loadMyListings === 'function') window.loadMyListings();
            if (typeof window.loadArchivedListings === 'function') window.loadArchivedListings();
            if (typeof window.loadFavoritesList === 'function') window.loadFavoritesList();
            if (typeof window.loadHistory === 'function') window.loadHistory();
            if (typeof window.loadUserListings === 'function') window.loadUserListings();
        }
    };

    // Убираем динамическую регулировку отступа при ресайзе (отключено)
    // window.addEventListener('resize', adjustHeaderOffset);
    // window.addEventListener('orientationchange', () => {
    //     setTimeout(adjustHeaderOffset, 300);
    // });

    function updateUnreadBadgeOnButton(count) {
        const chatBtn = document.querySelector('[data-action="chats"]');
        if (!chatBtn) return;
        const oldBadge = chatBtn.querySelector('.unread-badge-on-btn');
        if (oldBadge) oldBadge.remove();
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge-on-btn';
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.cssText = `background-color:#ef4444; color:white; border-radius:9999px; padding:0.125rem 0.5rem; font-size:0.7rem; font-weight:600; margin-left:0.5rem; display:inline-block; line-height:1.2;`;
            chatBtn.appendChild(badge);
        }
    }

    async function updateUnreadCount() {
        if (!token) return;
        try {
            const resp = await fetch('/api/chats/unread/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                const count = data.count || 0;
                updateUnreadBadgeOnButton(count);
                const hiddenBadge = document.getElementById('unreadBadge');
                if (hiddenBadge) {
                    if (count > 0) { hiddenBadge.textContent = count > 99 ? '99+' : count; hiddenBadge.classList.remove('hidden'); }
                    else hiddenBadge.classList.add('hidden');
                }
            } else {
                updateUnreadBadgeOnButton(0);
                const hiddenBadge = document.getElementById('unreadBadge');
                if (hiddenBadge) hiddenBadge.classList.add('hidden');
            }
        } catch(e) { console.warn(e); }
    }

    window.updateUnreadCount = updateUnreadCount;

    function renderHeader() {
        const html = `
            <div class="main-header">
                <div class="header-container">
                    <div class="logo-area">
                        <div class="logo"><a href="/">🛒 IronAds</a></div>
                        ${isLoggedIn && userName ? `<span class="user-name">👋 ${escapeHtml(userName)}</span>` : ''}
                    </div>
                    <button class="burger" id="burgerBtn">☰</button>
                    <div class="nav-links" id="navLinks">
                        <a href="/">Главная</a>
                        ${isLoggedIn ? `
                            <button class="nav-btn" data-action="create">➕ Создать</button>
                            <button class="nav-btn" data-action="chats">💬 Чаты</button>
                            <button class="nav-btn" data-action="favorites">⭐ Избранное</button>
                            <button class="nav-btn" data-action="history">🕒 История</button>
                            <a href="/contact.html" class="nav-btn">📞 Поддержка</a>
                            ${userRole === 'moderator' || userRole === 'admin' ? '<button class="nav-btn" data-action="moderation">🛡️ Модерация</button>' : ''}
                            ${userRole === 'admin' || userRole === 'moderator' ? '<button class="nav-btn" data-action="admin">⚙️ Админ-панель</button>' : ''}
                            <button class="nav-btn" data-action="profile">👤 Кабинет</button>
                        ` : '<a href="/contact.html" class="nav-btn">📞 Поддержка</a>'}
                        <div class="font-controls">
                            <button class="font-btn" id="fontMinus">A-</button>
                            <button class="font-btn reset" id="fontReset">A</button>
                            <button class="font-btn" id="fontPlus">A+</button>
                        </div>
                        <button class="theme-toggle" id="themeToggle">${localStorage.getItem('ironads_theme') === 'dark' ? '☀️' : '🌙'}</button>
                        ${isLoggedIn ? `
                            <button id="installPwaBtn" class="install-btn">📲 Установить</button>
                            <button id="logoutBtn" class="logout-btn">🚪 Выйти</button>
                        ` : `
                            <button class="login-btn" id="loginBtn">Войти</button>
                            <button class="register-btn" id="registerBtn">Регистрация</button>
                        `}
                        <div class="view-toggle-group">
                            <button class="view-toggle" data-view="grid-large" id="viewGridLarge">🔲 Крупная</button>
                            <button class="view-toggle" data-view="grid-small" id="viewGridSmall">⊞ Мелкая</button>
                            <button class="view-toggle" data-view="list" id="viewList">📄 Список</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        headerContainer.innerHTML = html;

        // Динамическая корректировка отступа отключена – CSS управляет отступом
        // adjustHeaderOffset();

        if (isLoggedIn) {
            document.querySelector('[data-action="create"]')?.addEventListener('click', () => { if (typeof window.showCreateModal === 'function') window.showCreateModal(); else window.location.href = '/create-listing.html'; });
            document.querySelector('[data-action="chats"]')?.addEventListener('click', () => window.location.href = '/chats.html');
            document.querySelector('[data-action="favorites"]')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/?tab=favorites'; });
            document.querySelector('[data-action="history"]')?.addEventListener('click', () => window.location.href = '/history.html');
            document.querySelector('[data-action="moderation"]')?.addEventListener('click', () => window.location.href = '/moderation.html');
            document.querySelector('[data-action="admin"]')?.addEventListener('click', () => window.location.href = '/admin.html');
            document.querySelector('[data-action="profile"]')?.addEventListener('click', () => {
                window.location.href = '/profile.html';
            });
            document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.removeItem('token'); window.location.href = '/'; });
        } else {
            const loginBtn = document.getElementById('loginBtn');
            const registerBtn = document.getElementById('registerBtn');
            if (loginBtn) loginBtn.addEventListener('click', () => { if (typeof window.showLoginModal === 'function') window.showLoginModal(); else window.location.href = '/?modal=login'; });
            if (registerBtn) registerBtn.addEventListener('click', () => { if (typeof window.showRegisterModal === 'function') window.showRegisterModal(); else window.location.href = '/?modal=register'; });
        }

        const burger = document.getElementById('burgerBtn');
        const navLinks = document.getElementById('navLinks');
        if (burger && navLinks) burger.addEventListener('click', () => navLinks.classList.toggle('open'));

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isDark = document.body.classList.contains('dark-theme');
                const newTheme = isDark ? 'light' : 'dark';
                if (newTheme === 'dark') document.body.classList.add('dark-theme');
                else document.body.classList.remove('dark-theme');
                localStorage.setItem('ironads_theme', newTheme);
                themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
            });
        }

        const applyFontSize = (delta) => {
            let current = parseFloat(localStorage.getItem('fontSize')) || 16;
            let newSize = current + delta;
            if (newSize < 12) newSize = 12;
            if (newSize > 24) newSize = 24;
            document.documentElement.style.fontSize = `${newSize}px`;
            localStorage.setItem('fontSize', newSize);
        };
        document.getElementById('fontPlus')?.addEventListener('click', () => applyFontSize(1));
        document.getElementById('fontMinus')?.addEventListener('click', () => applyFontSize(-1));
        document.getElementById('fontReset')?.addEventListener('click', () => { document.documentElement.style.fontSize = ''; localStorage.removeItem('fontSize'); });
        const savedSize = localStorage.getItem('fontSize');
        if (savedSize) document.documentElement.style.fontSize = `${savedSize}px`;

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });
        const installBtn = document.getElementById('installPwaBtn');
        if (installBtn) {
            installBtn.addEventListener('click', () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(() => deferredPrompt = null);
                } else {
                    alert('Установка недоступна.');
                }
            });
        }

        document.getElementById('viewGridLarge')?.addEventListener('click', () => window.setListingView('grid-large'));
        document.getElementById('viewGridSmall')?.addEventListener('click', () => window.setListingView('grid-small'));
        document.getElementById('viewList')?.addEventListener('click', () => window.setListingView('list'));

        if (isLoggedIn) {
            updateUnreadCount();
            setInterval(updateUnreadCount, 15000);
            window.addEventListener('focus', updateUnreadCount);
        }

        setTimeout(() => { window.setListingView(window.listingViewMode); }, 100);
    }

    renderHeader();

    // ===== ПОКАЗ БАННЕРА ДЛЯ IOS ПОСЛЕ ЗАГРУЗКИ =====
    showInstallPrompt();

    // ===== ДОБАВЛЯЕМ КНОПКУ VK В МОДАЛКУ ВХОДА =====
    addVkButtonToLoginModal();

    // ===== ФУТЕР =====
    function addFooter() {
        const noFooterPaths = [
            '/chat.html',
            '/chats.html',
            '/admin.html',
            '/moderation.html',
            '/support.html',
            '/contact.html',
            '/forgot-password.html'
        ];
        const currentPath = window.location.pathname;
        if (noFooterPaths.some(path => currentPath.includes(path))) {
            return;
        }
        if (document.getElementById('main-footer')) return;
        const footer = document.createElement('footer');
        footer.id = 'main-footer';
        footer.style.cssText = `text-align: center; padding: 1rem; background: rgba(0,0,0,0.05); margin-top: 2rem; font-size: 0.8rem; border-top: 1px solid rgba(0,0,0,0.1);`;
        footer.innerHTML = `<div class="footer-links" style="margin-bottom: 0.3rem;">
            <a href="/terms.html" target="_blank" style="color: #667eea; text-decoration: none;">📜 Пользовательское соглашение</a> |
            <a href="/privacy.html" target="_blank" style="color: #667eea; text-decoration: none;">🔒 Политика конфиденциальности</a> |
            <a href="/offer.html" target="_blank" style="color: #667eea; text-decoration: none;">📄 Публичная оферта</a> |
            <a href="/user-guide.html" style="color: #667eea; text-decoration: none;">📘 Руководство пользователя</a> |
            <a href="/contact.html" style="color: #667eea; text-decoration: none;">📞 Связаться с поддержкой</a> |
            <a href="/blog.html" style="color: #667eea; text-decoration: none;">📝 Блог</a>
        </div><div class="copyright">© ${new Date().getFullYear()} IronAds</div>`;
        document.body.appendChild(footer);
        const style = document.createElement('style');
        style.textContent = `body.dark-theme #main-footer { background: rgba(255,255,255,0.05); border-top-color: rgba(255,255,255,0.1); color: #cbd5e1; } body.dark-theme #main-footer a { color: #60a5fa; }`;
        document.head.appendChild(style);
    }
    addFooter();

    // ============================================================
    // ===== IOS SPLASH SCREEN (автоматическая генерация) =====
    // ============================================================
    (function initIOSSplash() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (!isIOS) return;
        if (window.navigator.standalone) return;

        import('https://unpkg.com/ios-pwa-splash-screen@1.0.5/dist/index.js')
            .then(module => {
                module.generateIosPwaSplash({
                    icon: {
                        url: '/icons/icon-512.png',
                        backgroundColor: '#667eea',
                        margin: 20,
                    },
                    iconDark: {
                        url: '/icons/icon-512.png',
                        backgroundColor: '#0f172a',
                        margin: 20,
                    },
                });
                console.log('🍏 iOS splash-экраны успешно сгенерированы');
            })
            .catch(err => {
                console.warn('⚠️ Не удалось загрузить ios-pwa-splash-screen:', err);
                import('https://unpkg.com/ios-pwa-splash-screen@1.0.5/dist/index.js')
                    .then(module => {
                        module.generateIosPwaSplash({
                            icon: {
                                url: '/icons/icon-192.png',
                                backgroundColor: '#667eea',
                                margin: 30,
                            },
                            iconDark: {
                                url: '/icons/icon-192.png',
                                backgroundColor: '#0f172a',
                                margin: 30,
                            },
                        });
                        console.log('🍏 iOS splash (через icon-192.png) сгенерированы');
                    })
                    .catch(e => console.warn('⚠️ Ошибка повторной загрузки:', e));
            });
    })();

});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function safeCompressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    if (isIOS()) {
        console.log('📱 iOS detected – skipping client compression');
        return file;
    }
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Compression timeout')), 5000)
    );
    try {
        const compressed = await Promise.race([
            compressImage(file, maxWidth, maxHeight, quality),
            timeout
        ]);
        return compressed;
    } catch (err) {
        console.warn('⚠️ Client compression failed, using original file:', err.message);
        return file;
    }
}

window.compressImage = compressImage;
window.safeCompressImage = safeCompressImage;
window.isIOS = isIOS;

// ========== ДИНАМИЧЕСКОЕ ОБНОВЛЕНИЕ META ==========
function updatePageMeta(title, description) {
    if (title) {
        document.title = title + ' | IronAds';
    }
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && description) {
        metaDesc.content = description;
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && title) {
        ogTitle.content = title + ' | IronAds';
    }
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && description) {
        ogDesc.content = description;
    }
}

// ========== РОУТИНГ ДЛЯ СТРАНИЦ ГОРОДОВ ==========
function handleCityRouting() {
    const path = window.location.pathname;
    const match = path.match(/^\/city\/([a-z0-9-]+)$/);
    if (match) {
        const citySlug = match[1];
        const cityMap = {
            'vladikavkaz': 'Владикавказ',
            'moskva': 'Москва',
            'spb': 'Санкт-Петербург',
            'novosibirsk': 'Новосибирск',
            'ekaterinburg': 'Екатеринбург',
            'kazan': 'Казань',
            'nizhny-novgorod': 'Нижний Новгород',
            'krasnoyarsk': 'Красноярск',
            'chelyabinsk': 'Челябинск',
            'ufa': 'Уфа',
            'samara': 'Самара'
        };
        const cityName = cityMap[citySlug];
        if (cityName) {
            updatePageMeta('Объявления в ' + cityName, 'Доска объявлений в ' + cityName + ' — подать объявление бесплатно.');
            const h1 = document.querySelector('h1');
            if (h1) h1.textContent = 'Бесплатные объявления в ' + cityName;
            window.history.pushState({ city: citySlug }, '', path);
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    handleCityRouting();
});