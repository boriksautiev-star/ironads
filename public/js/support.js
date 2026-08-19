// support.js – пользовательская поддержка (без параметра admin)
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        throw new Error('Не авторизован');
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        throw new Error('Сессия истекла');
    }
    return response;
}

async function loadTickets() {
    const container = document.getElementById('support-content');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
        const response = await fetchWithAuth('/api/support/tickets');
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка сервера');
        }
        const tickets = await response.json();
        renderTicketList(tickets);
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p style="color: #dc2626;">❌ Ошибка загрузки обращений: ${err.message}</p>`;
    }
}

function renderTicketList(tickets) {
    const container = document.getElementById('support-content');
    let html = `
        <div class="new-ticket-form">
            <h3>Новое обращение</h3>
            <input type="text" id="ticket-subject" placeholder="Тема" style="width:100%; margin-bottom:10px; padding:8px;">
            <textarea id="ticket-message" rows="4" placeholder="Опишите проблему..." style="width:100%; margin-bottom:10px; padding:8px;"></textarea>
            <select id="ticket-priority" style="margin-bottom:10px; padding:8px;">
                <option value="low">Низкий</option>
                <option value="medium" selected>Средний</option>
                <option value="high">Высокий</option>
            </select>
            <button id="create-ticket-btn" class="btn-primary">Отправить</button>
        </div>
        <div class="ticket-list"><h3>Мои обращения</h3>`;
    if (tickets.length === 0) {
        html += '<p>У вас пока нет обращений.</p>';
    } else {
        tickets.forEach(ticket => {
            const statusText = { open: 'Открыто', in_progress: 'В обработке', closed: 'Закрыто' }[ticket.status];
            const priorityText = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[ticket.priority];
            html += `
                <div class="ticket-item" data-id="${ticket.id}" data-chat="${ticket.chat_id || ''}">
                    <strong>${escapeHtml(ticket.subject)}</strong>
                    <span class="ticket-status status-${ticket.status}">${statusText}</span>
                    <span class="priority-badge priority-${ticket.priority}">${priorityText}</span>
                    <div style="font-size:12px; color:gray;">${new Date(ticket.created_at).toLocaleString()}</div>
                    <div>${escapeHtml(ticket.message.substring(0, 100))}...</div>
                    <div style="margin-top:8px;">
                        ${ticket.chat_id ? `<button class="open-chat-btn" data-chat="${ticket.chat_id}" style="background:#667eea; color:white; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">💬 Перейти в чат</button>` : ''}
                        <button class="details-btn" data-id="${ticket.id}" style="background:#6c757d; color:white; border:none; padding:4px 12px; border-radius:20px; cursor:pointer; margin-left:8px;">📋 Детали</button>
                    </div>
                </div>
            `;
        });
    }
    html += `</div>`;
    container.innerHTML = html;
    
    document.getElementById('create-ticket-btn').addEventListener('click', createTicket);
    
    document.querySelectorAll('.open-chat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chatId = btn.dataset.chat;
            if (chatId) window.location.href = `/chat.html?chatId=${chatId}`; // без admin
        });
    });
    
    document.querySelectorAll('.details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ticketId = btn.dataset.id;
            openTicket(ticketId);
        });
    });
}

async function createTicket() {
    const subject = document.getElementById('ticket-subject').value.trim();
    const message = document.getElementById('ticket-message').value.trim();
    const priority = document.getElementById('ticket-priority').value;
    if (!subject || !message) {
        alert('Заполните тему и сообщение');
        return;
    }
    const response = await fetchWithAuth('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, message, priority })
    });
    if (response.ok) {
        const data = await response.json();
        alert('Обращение создано!');
        document.getElementById('ticket-subject').value = '';
        document.getElementById('ticket-message').value = '';
        if (data.chatId) {
            window.location.href = `/chat.html?chatId=${data.chatId}`;
        } else {
            loadTickets();
        }
    } else {
        const err = await response.json();
        alert('Ошибка: ' + err.error);
    }
}

async function openTicket(ticketId) {
    try {
        const response = await fetchWithAuth(`/api/support/tickets/${ticketId}`);
        const data = await response.json();
        renderTicketView(data.ticket, data.messages);
    } catch (err) {
        console.error(err);
        alert('Ошибка загрузки обращения: ' + err.message);
    }
}

function renderTicketView(ticket, messages) {
    const container = document.getElementById('support-content');
    const statusText = { open: 'Открыто', in_progress: 'В обработке', closed: 'Закрыто' }[ticket.status];
    let html = `<button class="back-btn" id="back-to-list">← Назад к списку</button>
        <div class="ticket-view">
            <h2>${escapeHtml(ticket.subject)}</h2>
            <p>Статус: <span class="ticket-status status-${ticket.status}">${statusText}</span> | Приоритет: ${ticket.priority}</p>
            <p>Создано: ${new Date(ticket.created_at).toLocaleString()}</p>
            <hr><div class="message-list">`;
    messages.forEach(msg => {
        const senderName = msg.is_staff_reply ? 'Поддержка' : msg.username;
        html += `<div class="message ${msg.is_staff_reply ? 'message-staff' : 'message-user'}">
                    <strong>${escapeHtml(senderName)}</strong> <span style="font-size:12px;">${new Date(msg.created_at).toLocaleString()}</span>
                    <div>${escapeHtml(msg.message)}</div>
                </div>`;
    });
    html += `</div>`;
    if (ticket.status !== 'closed') {
        html += `<div class="reply-form"><textarea id="reply-message" rows="2" placeholder="Введите ответ..."></textarea><button id="send-reply-btn" class="btn-primary">Отправить</button></div>`;
    } else {
        html += `<p><em>Обращение закрыто. Новые сообщения недоступны.</em></p>`;
    }
    if (ticket.chat_id) {
        html += `<p><a href="/chat.html?chatId=${ticket.chat_id}" class="btn-primary" style="display:inline-block; margin-top:1rem;">💬 Перейти в чат с поддержкой</a></p>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    document.getElementById('back-to-list').addEventListener('click', () => loadTickets());
    if (ticket.status !== 'closed') {
        document.getElementById('send-reply-btn').addEventListener('click', () => sendReply(ticket.id));
        document.getElementById('reply-message').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') sendReply(ticket.id);
        });
    }
}

async function sendReply(ticketId) {
    const message = document.getElementById('reply-message').value.trim();
    if (!message) return;
    const response = await fetchWithAuth(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message })
    });
    if (response.ok) {
        document.getElementById('reply-message').value = '';
        openTicket(ticketId);
        loadTickets();
    } else {
        const err = await response.json();
        alert('Ошибка: ' + err.error);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        window.location.href = '/login.html';
    } else {
        loadTickets();
    }
});