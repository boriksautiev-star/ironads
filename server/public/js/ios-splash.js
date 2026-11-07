// ios-splash.js – автоматическая генерация splash-экранов для iOS
// Использует пакет ios-pwa-splash-screen с CDN

import { generateIosPwaSplash } from 'https://unpkg.com/ios-pwa-splash-screen@1.0.5/dist/index.js';

// Проверяем, что это iOS и мы не в standalone режиме (уже установлено)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
if (isIOS) {
    // Если приложение уже установлено (открыто в standalone), splash-экран не нужен
    if (window.navigator.standalone) {
        console.log('✅ IronAds уже установлен как PWA, splash-экран не нужен');
    } else {
        // Генерируем splash-экраны
        generateIosPwaSplash({
            icon: {
                url: '/icons/icon-512.png',        // путь к вашей иконке
                backgroundColor: '#667eea',         // цвет фона (светлая тема)
                margin: 20,                         // отступ иконки от краёв
            },
            iconDark: {
                url: '/icons/icon-512.png',
                backgroundColor: '#0f172a',         // цвет фона для тёмной темы
                margin: 20,
            },
        });
        console.log('🍏 Splash-экраны для iOS сгенерированы');
    }
} else {
    console.log('ℹ️ Не iOS, splash-экраны не нужны');
}