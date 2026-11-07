// Модуль для управления плавающими чатами
const FloatingChats = (function() {
    let activeChats = [];
    const MAX_CHATS = 5;
    let isResizing = false;
    let currentResizeChat = null;
    
    function loadSavedChats() {
        const saved = localStorage.getItem('floatingChats');
        if (saved) {
            try {
                const chats = JSON.parse(saved);
                chats.forEach(chat => {
                    if (chat.chatId && chat.chatId !== 'null' && chat.chatId !== 'undefined') {
                        createChatWindow(chat.chatId, chat.minimized || false, chat.width || 350, chat.height || 500);
                    }
                });
            } catch(e) { console.error(e); }
        }
    }
    
    function saveChats() {
        const toSave = activeChats.map(chat => ({
            chatId: chat.chatId,
            minimized: chat.minimized,
            otherUserId: chat.otherUserId,
            otherUserName: chat.otherUserName,
            width: chat.element.offsetWidth,
            height: chat.element.offsetHeight
        }));
        localStorage.setItem('floatingChats', JSON.stringify(toSave));
    }
    
    async function getChatInfo(chatId) {
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`${window.location.origin}/api/chats/${chatId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                const currentUserId = JSON.parse(atob(token.split('.')[1])).userId;
                const otherUserId = data.buyer_id === currentUserId ? data.seller_id : data.buyer_id;
                const otherUserName = data.buyer_id === currentUserId ? data.seller_name : data.buyer_name;
                return { otherUserId, otherUserName };
            }
        } catch(e) {
            console.error(e);
        }
        return null;
    }
    
    function createChatWindow(chatId, minimized = false, startWidth = 350, startHeight = 500) {
        if (activeChats.some(chat => chat.chatId == chatId)) {
            const existing = activeChats.find(chat => chat.chatId == chatId);
            if (existing.minimized) {
                toggleMinimize(existing.chatId);
            }
            return;
        }
        
        if (activeChats.length >= MAX_CHATS) {
            alert(`Можно открыть не более ${MAX_CHATS} чатов одновременно. Закройте один из чатов, чтобы открыть новый.`);
            return;
        }
        
        const chatWindow = document.createElement('div');
        chatWindow.className = `floating-chat ${minimized ? 'minimized' : ''}`;
        chatWindow.setAttribute('data-chat-id', chatId);
        chatWindow.style.width = `${startWidth}px`;
        chatWindow.style.height = minimized ? '48px' : `${startHeight}px`;
        chatWindow.innerHTML = `
            <div class="floating-chat-header">
                <div class="floating-chat-title" id="floating-chat-title-${chatId}">Загрузка...</div>
                <div class="floating-chat-controls">
                    <button class="floating-chat-resize" title="Изменить размер">⤡</button>
                    <button class="floating-chat-minimize" title="Свернуть">─</button>
                    <button class="floating-chat-close" title="Закрыть">✕</button>
                </div>
            </div>
            <div class="floating-chat-body">
                <iframe src="/chat.html?chatId=${chatId}&embedded=true" frameborder="0"></iframe>
            </div>
        `;
        
        document.body.appendChild(chatWindow);
        
        // Получаем информацию о собеседнике
        getChatInfo(chatId).then(info => {
            if (info) {
                const titleDiv = document.getElementById(`floating-chat-title-${chatId}`);
                if (titleDiv) {
                    titleDiv.innerHTML = `💬 <span class="chat-user-name" data-user-id="${info.otherUserId}" style="cursor: pointer; text-decoration: none;">${escapeHtml(info.otherUserName)}</span>`;
                    titleDiv.style.cursor = 'pointer';
                    
                    const userNameSpan = titleDiv.querySelector('.chat-user-name');
                    if (userNameSpan) {
                        userNameSpan.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const userId = userNameSpan.getAttribute('data-user-id');
                            window.open(`/profile.html?id=${userId}`, '_blank');
                        });
                    }
                    
                    activeChats = activeChats.map(chat => {
                        if (chat.chatId == chatId) {
                            return { ...chat, otherUserId: info.otherUserId, otherUserName: info.otherUserName };
                        }
                        return chat;
                    });
                    saveChats();
                }
            } else {
                const titleDiv = document.getElementById(`floating-chat-title-${chatId}`);
                if (titleDiv) titleDiv.innerHTML = `💬 Чат`;
            }
        });
        
        const minimizeBtn = chatWindow.querySelector('.floating-chat-minimize');
        const closeBtn = chatWindow.querySelector('.floating-chat-close');
        const resizeBtn = chatWindow.querySelector('.floating-chat-resize');
        const header = chatWindow.querySelector('.floating-chat-header');
        
        minimizeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleMinimize(chatId);
        };
        
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeChat(chatId);
        };
        
        resizeBtn.onclick = (e) => {
            e.stopPropagation();
            startResize(chatWindow);
        };
        
        makeDraggable(chatWindow, header);
        
        activeChats.push({
            chatId: chatId,
            minimized: minimized,
            element: chatWindow,
            otherUserId: null,
            otherUserName: null
        });
        
        positionChatWindow(chatWindow);
        saveChats();
    }
    
    function startResize(element) {
        isResizing = true;
        currentResizeChat = element;
        const startX = 0, startY = 0;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;
        
        function onMouseMove(e) {
            if (!isResizing) return;
            e.preventDefault();
            let newWidth = startWidth + (e.clientX - startX);
            let newHeight = startHeight + (e.clientY - startY);
            
            newWidth = Math.min(Math.max(250, newWidth), 800);
            newHeight = Math.min(Math.max(300, newHeight), 700);
            
            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;
        }
        
        function onMouseUp() {
            isResizing = false;
            currentResizeChat = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            const chatId = element.getAttribute('data-chat-id');
            const chat = activeChats.find(c => c.chatId == chatId);
            if (chat && !chat.minimized) {
                saveChats();
            }
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    function toggleMinimize(chatId) {
        const chat = activeChats.find(c => c.chatId == chatId);
        if (!chat) return;
        
        chat.minimized = !chat.minimized;
        const element = chat.element;
        
        if (chat.minimized) {
            const currentHeight = element.offsetHeight;
            element.setAttribute('data-full-height', currentHeight);
            element.style.height = '48px';
            element.classList.add('minimized');
        } else {
            const fullHeight = element.getAttribute('data-full-height') || '500';
            element.style.height = `${fullHeight}px`;
            element.classList.remove('minimized');
            // Обновляем iframe при разворачивании
            const iframe = element.querySelector('iframe');
            if (iframe) {
                iframe.src = iframe.src;
            }
        }
        
        saveChats();
    }
    
    function closeChat(chatId) {
        const index = activeChats.findIndex(c => c.chatId == chatId);
        if (index !== -1) {
            activeChats[index].element.remove();
            activeChats.splice(index, 1);
            saveChats();
            repositionAllChats();
        }
    }
    
    function positionChatWindow(element) {
        const index = activeChats.length - 1;
        const right = 20 + (index * 20);
        const bottom = 20 + (index * 20);
        element.style.right = `${right}px`;
        element.style.bottom = `${bottom}px`;
        element.style.left = 'auto';
        element.style.top = 'auto';
    }
    
    function repositionAllChats() {
        activeChats.forEach((chat, index) => {
            const right = 20 + (index * 20);
            const bottom = 20 + (index * 20);
            chat.element.style.right = `${right}px`;
            chat.element.style.bottom = `${bottom}px`;
            chat.element.style.left = 'auto';
            chat.element.style.top = 'auto';
        });
    }
    
    function makeDraggable(element, handle) {
        let startX = 0, startY = 0, initialX = 0, initialY = 0;
        let isDragging = false;
        
        function onMouseDown(e) {
            if (isResizing) return;
            if (e.target.classList && (e.target.classList.contains('chat-user-name') || e.target.classList.contains('floating-chat-resize') || e.target.classList.contains('floating-chat-minimize') || e.target.classList.contains('floating-chat-close'))) {
                return;
            }
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            initialX = element.offsetLeft;
            initialY = element.offsetTop;
            isDragging = true;
            
            document.onmousemove = onMouseMove;
            document.onmouseup = onMouseUp;
        }
        
        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            let dx = e.clientX - startX;
            let dy = e.clientY - startY;
            
            let newLeft = initialX + dx;
            let newTop = initialY + dy;
            
            newLeft = Math.min(Math.max(0, newLeft), window.innerWidth - element.offsetWidth);
            newTop = Math.min(Math.max(0, newTop), window.innerHeight - element.offsetHeight);
            
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }
        
        function onMouseUp() {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        }
        
        handle.onmousedown = onMouseDown;
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function openChat(chatId) {
        createChatWindow(chatId);
    }
    
    function init() {
        const style = document.createElement('style');
        style.textContent = `
            .floating-chat {
                position: fixed;
                width: 350px;
                height: 500px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                display: flex;
                flex-direction: column;
                z-index: 10000;
                transition: height 0.2s ease;
                overflow: hidden;
                resize: both;
            }
            .floating-chat.minimized {
                height: 48px !important;
                width: 280px;
            }
            .floating-chat-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
                flex-shrink: 0;
            }
            .floating-chat-title {
                font-size: 14px;
                font-weight: 500;
                flex: 1;
                cursor: pointer;
            }
            .floating-chat-title .chat-user-name {
                cursor: pointer;
            }
            .floating-chat-title .chat-user-name:hover {
                text-decoration: underline;
            }
            .floating-chat-controls {
                display: flex;
                gap: 8px;
            }
            .floating-chat-controls button {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                cursor: pointer;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                font-size: 14px;
                transition: all 0.2s;
            }
            .floating-chat-controls button:hover {
                background: rgba(255,255,255,0.3);
            }
            .floating-chat-body {
                flex: 1;
                overflow: hidden;
            }
            .floating-chat-body iframe {
                width: 100%;
                height: 100%;
                border: none;
            }
            .floating-chat.minimized .floating-chat-body {
                display: none;
            }
        `;
        document.head.appendChild(style);
        
        loadSavedChats();
    }
    
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'closeChat') {
            const chatId = event.data.chatId;
            closeChat(chatId);
        }
    });
    
    return {
        init: init,
        openChat: openChat,
        closeChat: closeChat
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    FloatingChats.init();
});