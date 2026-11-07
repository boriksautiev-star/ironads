// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg))
            .catch(err => console.log('SW registration failed:', err));
    });
}

let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');

// Определяем платформу
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/.test(navigator.userAgent);
const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
const isEdge = /Edg/.test(navigator.userAgent);

// Функция показа инструкции для iOS
function showIOSInstructions() {
    alert(
        '📱 Установка приложения на iPhone/iPad:\n\n' +
        '1. Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх) внизу экрана\n' +
        '2. Прокрутите вниз и выберите "На экран «Домой»"\n' +
        '3. Нажмите "Добавить"\n\n' +
        'После этого иконка IronAds появится на рабочем столе.'
    );
}

// Функция показа инструкции для Android (если автоматическая установка недоступна)
function showAndroidInstructions() {
    alert(
        '🤖 Установка приложения на Android:\n\n' +
        '1. Откройте меню Chrome (три точки в правом верхнем углу)\n' +
        '2. Выберите "Установить приложение" или "Добавить на главный экран"\n\n' +
        'Если этого пункта нет, используйте Chrome или Edge браузер.'
    );
}

// Обработчик beforeinstallprompt (только для Android Chrome/Edge)
if (!isIOS) {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('beforeinstallprompt готов');
    });
}

// Настройка кнопки
if (installBtn) {
    installBtn.style.display = 'inline-block'; // Кнопка всегда видна
    installBtn.onclick = async () => {
        if (!isIOS && deferredPrompt) {
            // Android с поддержкой автоматической установки
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('PWA установлено');
                installBtn.style.display = 'none';
            } else {
                console.log('Установка отклонена');
                showAndroidInstructions();
            }
            deferredPrompt = null;
        } else if (isIOS) {
            showIOSInstructions();
        } else {
            // Android, но beforeinstallprompt не сработал (браузер не поддерживает или ранее отказано)
            showAndroidInstructions();
        }
    };
}

// Если по какой-то причине кнопка не нашлась – выводим предупреждение в консоль
setTimeout(() => {
    if (!document.getElementById('installPwaBtn')) {
        console.warn('Кнопка установки PWA не найдена. Добавьте <button id="installPwaBtn"> в HTML.');
    }
}, 1000);