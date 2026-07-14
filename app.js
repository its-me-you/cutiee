// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, ref, push, onValue, update, remove, 
    query, limitToLast, orderByChild, endBefore, get, serverTimestamp, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBwxy_WOOOXJ-f8S7obpTMhOaow50vLgQg",
    authDomain: "our-personal-chat-3d13a.firebaseapp.com",
    projectId: "our-personal-chat-3d13a",
    storageBucket: "our-personal-chat-3d13a.firebasestorage.app",
    messagingSenderId: "738185967460",
    appId: "1:738185967460:web:a3126225a05616e464ac71",
    measurementId: "G-YZCNNRDSY8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// State Management
const STATE = {
    currentUser: null,
    messages: [],
    replyingTo: null,
    oldestMsgKey: null,
    typingTimeout: null
};

// Credentials
const USERS = {
    "Bro": "Prashad",
    "Raa": "tiara"
};

// --- DOM Elements ---
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const loadMoreBtn = document.getElementById('load-more-btn');
const contextMenu = document.getElementById('context-menu');
const fileInput = document.getElementById('file-input');

// --- Initialization & Login ---

document.getElementById('login-btn').addEventListener('click', handleLogin);

function handleLogin() {
    const userSelect = document.getElementById('user-select');
    const passwordInput = document.getElementById('password-input');
    const errorText = document.getElementById('login-error');

    const selectedUser = userSelect.value;
    const password = passwordInput.value;

    if (!selectedUser) {
        errorText.textContent = "Please select who you are!";
        return;
    }

    if (USERS[selectedUser] === password) {
        STATE.currentUser = selectedUser;
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        initApp();
    } else {
        errorText.textContent = "Wrong password, love!";
    }
}

function initApp() {
    setupPresence();
    setupListeners();
    loadMessages();
    setupHearts();
}

// --- Presence System (Online/Typing) ---

function setupPresence() {
    const userStatusRef = ref(db, `online/${STATE.currentUser}`);
    const connectedRef = ref(db, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            update(userStatusRef, { status: true });
            onDisconnect(userStatusRef).update({ status: false });
            onDisconnect(ref(db, `typing/${STATE.currentUser}`)).set(false);
        }
    });

    // Listen to other users' status
    ['Bro', 'Raa'].forEach(u => {
        onValue(ref(db, `online/${u}/status`), (snap) => {
            const isOnline = snap.val();
            const dot = document.getElementById(`status-${u.toLowerCase()}`);
            if(dot) dot.classList.toggle('online', isOnline);
        });

        // Listen for typing
        if (u !== STATE.currentUser) {
            onValue(ref(db, `typing/${u}`), (snap) => {
                const indicator = document.getElementById('typing-indicator');
                if (snap.val()) {
                    indicator.classList.remove('hidden');
                    indicator.innerText = `${u} is typing...`;
                } else {
                    indicator.classList.add('hidden');
                }
            });
        }
    });
}

// --- Message Logic ---

function loadMessages(loadMore = false) {
    let msgQuery;
    const msgRef = ref(db, 'messages');

    if (loadMore && STATE.oldestMsgKey) {
        msgQuery = query(msgRef, orderByChild('ts'), endBefore(STATE.oldestMsgKey), limitToLast(20));
    } else {
        msgQuery = query(msgRef, limitToLast(50));
    }

    // Using get() for pagination to avoid duplicated listeners, 
    // real-time updates are handled by a separate 'child_added' listener for new msgs
    if(loadMore) {
        get(msgQuery).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const sortedKeys = Object.keys(data).sort((a,b) => data[a].ts - data[b].ts);
                STATE.oldestMsgKey = data[sortedKeys[0]].ts; // Update anchor
                
                // Prepend to list
                const fragment = document.createDocumentFragment();
                sortedKeys.forEach(key => {
                    if(!document.getElementById(key)) {
                        fragment.appendChild(createMessageElement(data[key], key));
                    }
                });
                messageList.insertBefore(fragment, messageList.firstChild);
            } else {
                loadMoreBtn.classList.add('hidden');
            }
        });
    } else {
        // Initial Load & Realtime Listener
        loadMoreBtn.classList.remove('hidden');
        
        // Listen for additions
        const realtimeQuery = query(msgRef, limitToLast(50));
        
        onValue(realtimeQuery, (snapshot) => {
            if(!snapshot.exists()) return;
            const data = snapshot.val();
            // Clear list to prevent dupes on re-sync, or implement smart merging.
            // For simplicity in vanilla JS: clear and render.
            messageList.innerHTML = ''; 
            
            const sortedKeys = Object.keys(data).sort((a,b) => data[a].ts - data[b].ts);
            if(sortedKeys.length > 0) STATE.oldestMsgKey = data[sortedKeys[0]].ts;

            sortedKeys.forEach(key => {
                messageList.appendChild(createMessageElement(data[key], key));
            });
            scrollToBottom();
        });
    }
}

function createMessageElement(msg, id) {
    const div = document.createElement('div');
    div.className = `message-row ${msg.sender === STATE.currentUser ? 'sent' : 'received'}`;
    div.id = id;
    div.dataset.raw = JSON.stringify(msg);

    // Update Seen Status if I am receiver
    if (msg.sender !== STATE.currentUser && msg.status !== 'seen') {
        update(ref(db, `messages/${id}`), { status: 'seen' });
    }

    const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusIcon = msg.sender === STATE.currentUser ? 
        (msg.status === 'seen' ? '✓✓' : (msg.status === 'delivered' ? '✓' : '•')) : '';

    // Content
    let contentHtml = '';
    
    // Reply Reference
    if (msg.replyTo) {
        contentHtml += `<div class="reply-ref">Replying to: ${msg.replyTo.text || 'Image'}</div>`;
    }

    // Image
    if (msg.image) {
        contentHtml += `<img src="${msg.image}" class="msg-img" onclick="window.open(this.src)">`;
    }

    // Text (handle deletion)
    if (msg.deleted) {
        contentHtml += `<div class="deleted-msg">🚫 Message Deleted</div>`;
    } else {
        contentHtml += `<div>${msg.text || ''} ${msg.edited ? '<small>(edited)</small>' : ''}</div>`;
    }

    // Reactions
    let reactionsHtml = '';
    if (msg.reactions) {
        reactionsHtml = `<div class="msg-reactions">${Object.values(msg.reactions).join('')}</div>`;
    }

    div.innerHTML = `
        <div class="message-bubble">
            ${contentHtml}
            <div class="msg-meta">
                <span>${time}</span>
                <span>${statusIcon}</span>
            </div>
            ${reactionsHtml}
        </div>
    `;

    // Context Menu Trigger
    div.querySelector('.message-bubble').addEventListener('contextmenu', (e) => showContextMenu(e, id, msg));

    return div;
}

// --- Sending Messages ---

async function sendMessage() {
    const text = messageInput.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) return;

    let imageBase64 = null;
    if (file) {
        imageBase64 = await toBase64(file);
    }

    const payload = {
        sender: STATE.currentUser,
        text: text,
        image: imageBase64,
        ts: serverTimestamp(),
        status: 'delivered',
        deleted: false,
        edited: false,
        replyTo: STATE.replyingTo ? { id: STATE.replyingTo.id, text: STATE.replyingTo.text } : null
    };

    push(ref(db, 'messages'), payload);

    // Reset UI
    messageInput.value = '';
    fileInput.value = '';
    cancelReply();
    scrollToBottom();
}

// --- Event Listeners ---

function setupListeners() {
    // Send Button
    sendBtn.addEventListener('click', sendMessage);
    
    // Enter Key
    messageInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') sendMessage();
    });

    // Typing Indicator
    messageInput.addEventListener('input', () => {
        update(ref(db, `typing/${STATE.currentUser}`), true);
        clearTimeout(STATE.typingTimeout);
        STATE.typingTimeout = setTimeout(() => {
            update(ref(db, `typing/${STATE.currentUser}`), false);
        }, 1500);
    });

    // File Attachment
    document.getElementById('attach-btn').addEventListener('click', () => fileInput.click());

    // Paste Image
    window.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                const base64 = await toBase64(blob);
                // Auto send or put in preview? Let's send immediately for simplicity
                const conf = confirm("Send pasted image?");
                if(conf) {
                    push(ref(db, 'messages'), {
                        sender: STATE.currentUser,
                        text: '',
                        image: base64,
                        ts: serverTimestamp(),
                        status: 'delivered'
                    });
                }
            }
        }
    });

    // Load More
    loadMoreBtn.addEventListener('click', () => loadMessages(true));

    // Cancel Context Menu
    document.addEventListener('click', (e) => {
        if(!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    });
    
    // Cancel Reply
    document.getElementById('cancel-reply').addEventListener('click', cancelReply);
}

// --- Context Menu Logic ---

let contextTargetId = null;
let contextMsgData = null;

function showContextMenu(e, id, msg) {
    e.preventDefault();
    contextTargetId = id;
    contextMsgData = msg;
    
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.classList.remove('hidden');

    // Show/Hide Delete based on ownership
    const delBtn = contextMenu.querySelector('[data-action="delete"]');
    const editBtn = contextMenu.querySelector('[data-action="edit"]');
    
    if(msg.sender === STATE.currentUser && !msg.deleted) {
        delBtn.style.display = 'block';
        editBtn.style.display = 'block';
    } else {
        delBtn.style.display = 'none';
        editBtn.style.display = 'none';
    }
}

contextMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if(!action) return;

    if (action === 'reply') {
        STATE.replyingTo = { id: contextTargetId, text: contextMsgData.text || 'Image' };
        document.getElementById('reply-preview').classList.remove('hidden');
        document.querySelector('.reply-text').innerText = contextMsgData.text || 'Image';
        messageInput.focus();
    } else if (action === 'delete') {
        const modal = document.getElementById('confirm-modal');
        modal.classList.remove('hidden');
        
        document.getElementById('confirm-yes').onclick = () => {
            update(ref(db, `messages/${contextTargetId}`), { deleted: true, text: '', image: null });
            modal.classList.add('hidden');
        };
        document.getElementById('confirm-no').onclick = () => modal.classList.add('hidden');
    } else if (action === 'react') {
        const emoji = prompt("Enter emoji (❤️, 😂, 😮):", "❤️");
        if(emoji) {
            update(ref(db, `messages/${contextTargetId}/reactions`), { [STATE.currentUser]: emoji });
        }
    } else if (action === 'edit') {
        const newText = prompt("Edit message:", contextMsgData.text);
        if(newText !== null) {
            update(ref(db, `messages/${contextTargetId}`), { text: newText, edited: true });
        }
    }
    contextMenu.classList.add('hidden');
});

function cancelReply() {
    STATE.replyingTo = null;
    document.getElementById('reply-preview').classList.add('hidden');
}

// --- Hearts Animation ---

function setupHearts() {
    const btn = document.getElementById('send-love-btn');
    const heartsRef = ref(db, 'hearts');

    btn.addEventListener('click', () => {
        push(heartsRef, { ts: serverTimestamp(), sender: STATE.currentUser });
    });

    onValue(query(heartsRef, limitToLast(1)), (snap) => {
        if(!snap.exists()) return;
        const val = Object.values(snap.val())[0];
        // Simple check to ensure we don't animate old events on load
        if (Date.now() - val.ts < 5000) { 
            spawnFloatingHearts();
        }
    });
}

function spawnFloatingHearts() {
    const container = document.getElementById('hearts-container');
    const colors = ['#ff6fa3', '#8a2be2', '#ff9ff3', '#feca57'];
    
    for (let i = 0; i < 15; i++) {
        const heart = document.createElement('div');
        heart.innerHTML = '❤️';
        heart.className = 'heart';
        heart.style.left = Math.random() * 100 + '%';
        heart.style.animationDuration = (Math.random() * 2 + 3) + 's';
        heart.style.color = colors[Math.floor(Math.random() * colors.length)];
        
        container.appendChild(heart);
        setTimeout(() => heart.remove(), 5000);
    }
}

// --- Utils ---

function scrollToBottom() {
    const chatArea = document.getElementById('chat-area');
    setTimeout(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    }, 100);
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
