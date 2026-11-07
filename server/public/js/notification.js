// notification.js - система уведомлений
const NotificationSystem = (function() {
    let audio = null;
    let permissionGranted = false;
    
    function init() {
        // Создаём аудио объект
        audio = new Audio('/sounds/notification.mp3');
        
        // Запрашиваем разрешение на уведомления (если браузер поддерживает)
        if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                permissionGranted = permission === 'granted';
            });
        }
    }
    
    function playSound() {
        if (audio) {
            audio.play().catch(e => console.log('Звук не воспроизведён:', e));
        }
    }
    
    function show(title, body, onClick) {
        playSound();
        
        if (permissionGranted && !document.hasFocus()) {
            const notification = new Notification(title, {
                body: body,
                icon: '/favicon.ico',
                silent: false
            });
            
            if (onClick) {
                notification.onclick = onClick;
            }
            
            setTimeout(() => notification.close(), 5000);
        }
    }
    
    return {
        init: init,
        show: show,
        playSound: playSound
    };
})();