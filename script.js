// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-cTw11-XvqUnSCePu9RqdT1Ob_jnSaGQ",
    authDomain: "group-chat-c36b5.firebaseapp.com",
    databaseURL: "https://group-chat-c36b5-default-rtdb.firebaseio.com",
    projectId: "group-chat-c36b5",
    storageBucket: "group-chat-c36b5.firebasestorage.app",
    messagingSenderId: "453401126384",
    appId: "1:453401126384:web:486c2b0523e02ab116e935"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();
const currentUser = localStorage.getItem('chat_user');

// Global variables
let selectedFile = null;
let isProcessing = false; // Ikki marta yuborishni oldini olish uchun

// ========== AUTH ==========
async function handleAuth() {
    const userInput = document.getElementById('username');
    const passInput = document.getElementById('password');
    
    if (!userInput || !passInput) {
        alert("Xatolik: Formani topolmadim!");
        return;
    }
    
    const user = userInput.value.trim().toLowerCase();
    const pass = passInput.value.trim();
    
    if (user.length < 3) {
        alert("Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak!");
        return;
    }
    
    if (!pass || pass.length < 4) {
        alert("Parol kamida 4 ta belgidan iborat bo'lishi kerak!");
        return;
    }

    try {
        // Ban tekshiruvi
        const banSnap = await db.ref('banned/' + user).once('value');
        if (banSnap.exists()) {
            alert("❌ Siz banlangansiz!");
            return;
        }

        const userRef = db.ref('users/' + user);
        const snap = await userRef.once('value');

        if (snap.exists()) {
            // Mavjud foydalanuvchi - parolni tekshirish
            if (snap.val().password !== pass) {
                alert("❌ Parol xato!");
                return;
            }
        } else {
            // Yangi foydalanuvchi - ro'yxatdan o'tkazish
            await userRef.set({ 
                password: pass, 
                joined: Date.now() 
            });
        }

        localStorage.setItem('chat_user', user);
        location.reload();
    } catch (error) {
        console.error("Auth xatolik:", error);
        alert("Xatolik yuz berdi! Iltimos qaytadan urinib ko'ring.");
    }
}

// ========== INITIALIZATION ==========
if (currentUser) {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('chat-page').style.display = 'flex';
    document.getElementById('display-name').innerText = currentUser;
    document.getElementById('avatar-text').innerText = currentUser[0].toUpperCase();
    
    initApp();
}

function initApp() {
    loadMessages();
    trackOnline();
    syncPin();
    checkRank();
    
    // FAQAT Enter event listener
    const input = document.getElementById('message-input');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

// ========== FAYL TANLASH ==========
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Fayl hajmini tekshirish (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert("❌ Fayl hajmi 10MB dan kichik bo'lishi kerak!");
        event.target.value = '';
        return;
    }
    
    selectedFile = file;
    
    // Preview ko'rsatish
    const preview = document.getElementById('file-preview');
    const fileName = document.getElementById('file-name');
    
    fileName.textContent = `📄 ${file.name} (${formatFileSize(file.size)})`;
    preview.style.display = 'block';
}

function cancelFile() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').style.display = 'none';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ========== XABAR YUBORISH ==========
async function sendMessage() {
    // Agar allaqachon yuborilayotgan bo'lsa, to'xta
    if (isProcessing) {
        console.log("Xabar yuborilmoqda, kutib turing...");
        return;
    }
    
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const text = input.value.trim();
    
    // Agar matn ham, fayl ham bo'lmasa
    if (!text && !selectedFile) return;

    // Processing boshlandi
    isProcessing = true;
    
    try {
        // Admin komandalarini tekshirish
        if (text.startsWith("/") && !selectedFile) {
            await handleAdminCommand(text);
            input.value = "";
            isProcessing = false;
            return;
        }

        let fileData = null;
        
        // Agar fayl tanlangan bo'lsa
        if (selectedFile) {
            const sendBtn = document.querySelector('.send-btn');
            sendBtn.classList.add('uploading');
            sendBtn.textContent = '⏳';
            
            fileData = await uploadFile(selectedFile);
            
            sendBtn.classList.remove('uploading');
            sendBtn.textContent = '➤';
        }

        // Xabar obyektini yaratish
        const messageData = {
            user: currentUser,
            time: getTime(),
            timestamp: Date.now()
        };
        
        if (text) {
            messageData.text = text;
        }
        
        if (fileData) {
            messageData.file = fileData;
        }

        // Xabarni yuborish
        await db.ref('messages').push(messageData);
        
        // Inputni tozalash
        input.value = "";
        cancelFile();
        
        // Scroll qilish
        const chatBox = document.getElementById('chat-messages');
        setTimeout(() => {
            chatBox.scrollTop = chatBox.scrollHeight;
        }, 100);
        
    } catch (error) {
        console.error("Xabar yuborishda xatolik:", error);
        alert("Xabar yuborilmadi! Qaytadan urinib ko'ring.");
    } finally {
        // Processing tugadi
        isProcessing = false;
    }
}

// ========== FAYL YUKLASH ==========
async function uploadFile(file) {
    const timestamp = Date.now();
    const fileName = `${currentUser}_${timestamp}_${file.name}`;
    const storageRef = storage.ref('files/' + fileName);
    
    try {
        // Faylni yuklash
        const snapshot = await storageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        return {
            name: file.name,
            url: downloadURL,
            type: file.type,
            size: file.size
        };
    } catch (error) {
        console.error("Fayl yuklashda xatolik:", error);
        throw error;
    }
}

// ========== ADMIN KOMANDALAR ==========
async function handleAdminCommand(text) {
    const parts = text.split(" ");
    const cmd = parts[0].toLowerCase();
    const target = parts[1] ? parts[1].toLowerCase() : null;
    const value = parts.slice(2).join(" ");

    const isMainAdmin = (currentUser === "vuroxen");

    if (!isMainAdmin) {
        alert("❌ Sizda admin huquqlari yo'q!");
        return;
    }

    try {
        switch(cmd) {
            case "/parol":
                if (target && value) {
                    await db.ref('users/' + target).update({ password: value });
                    alert(`✅ ${target} ning paroli o'zgartirildi!`);
                }
                break;
                
            case "/deluser":
                if (target) {
                    await db.ref('users/' + target).remove();
                    alert(`✅ ${target} o'chirildi!`);
                }
                break;
                
            case "/ban":
                if (target) {
                    await db.ref('banned/' + target).set(true);
                    alert(`✅ ${target} banlandi!`);
                }
                break;
                
            case "/unban":
                if (target) {
                    await db.ref('banned/' + target).remove();
                    alert(`✅ ${target} banidan chiqarildi!`);
                }
                break;
                
            case "/alert":
                const alertMsg = text.replace("/alert ", "");
                if (alertMsg) {
                    await db.ref('messages').push({ 
                        user: "TIZIM", 
                        text: "📢 " + alertMsg, 
                        type: 'system', 
                        time: getTime(),
                        timestamp: Date.now()
                    });
                }
                break;
                
            case "/clear":
                if (confirm("Barcha xabarlarni o'chirmoqchimisiz?")) {
                    await db.ref('messages').remove();
                    alert("✅ Barcha xabarlar o'chirildi!");
                }
                break;
                
            case "/pin":
                const pinMsg = text.replace("/pin ", "");
                if (pinMsg) {
                    await db.ref('settings/pin').set(pinMsg);
                    alert("✅ Xabar PIN qilindi!");
                } else {
                    await db.ref('settings/pin').remove();
                    alert("✅ PIN xabar o'chirildi!");
                }
                break;
                
            default:
                alert("❌ Noma'lum komanda!");
        }
    } catch (error) {
        console.error("Komanda bajarilmadi:", error);
        alert("Xatolik yuz berdi!");
    }
}

// ========== XABARLARNI YUKLASH ==========
let messagesLoaded = new Set(); // Takrorlanishni oldini olish

function loadMessages() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    
    db.ref('messages').limitToLast(100).on('child_added', snap => {
        // Agar bu xabar allaqachon yuklangan bo'lsa, o'tkazib yuborish
        if (messagesLoaded.has(snap.key)) return;
        messagesLoaded.add(snap.key);
        
        const data = snap.val();
        const isMe = data.user === currentUser;
        const isAdmin = data.user === "vuroxen";
        const isSystem = data.type === 'system';
        
        const div = document.createElement('div');
        div.className = `msg-box ${isMe ? 'sent' : 'received'} ${isSystem ? 'system-msg' : ''}`;
        div.setAttribute('data-msg-id', snap.key);
        
        let headerHTML = '';
        if (!isSystem) {
            headerHTML = `
                <div style="font-size: 0.65rem; opacity: 0.7; margin-bottom: 4px;">
                    ${data.user} ${isAdmin ? '<span class="admin-tag">ADMIN</span>' : ''} • ${data.time}
                </div>
            `;
        }
        
        let contentHTML = '';
        if (data.text) {
            contentHTML += `<div>${escapeHtml(data.text)}</div>`;
        }
        
        // Fayl qo'shish
        if (data.file) {
            contentHTML += renderFile(data.file);
        }
        
        div.innerHTML = headerHTML + contentHTML;
        
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    });

    db.ref('messages').on('value', snapshot => { 
        if (!snapshot.exists()) {
            box.innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:20px;">Hozircha xabarlar yo\'q</div>';
            messagesLoaded.clear();
        }
    });
}

// ========== FAYL RENDER QILISH ==========
function renderFile(file) {
    if (!file || !file.url) return '';
    
    // Rasm
    if (file.type && file.type.startsWith('image/')) {
        return `<img src="${file.url}" class="msg-image" alt="${file.name}" onclick="window.open('${file.url}', '_blank')">`;
    }
    
    // Audio
    if (file.type && file.type.startsWith('audio/')) {
        return `<audio controls class="msg-audio"><source src="${file.url}" type="${file.type}"></audio>`;
    }
    
    // Video
    if (file.type && file.type.startsWith('video/')) {
        return `<video controls class="msg-image" style="max-height: 250px;"><source src="${file.url}" type="${file.type}"></video>`;
    }
    
    // Boshqa fayllar
    return `<a href="${file.url}" target="_blank" class="msg-file">📎 ${file.name}</a>`;
}

// ========== ONLINE FOYDALANUVCHILAR ==========
function trackOnline() {
    if (!currentUser) return;
    
    const ref = db.ref('online/' + currentUser);
    ref.set(true);
    ref.onDisconnect().remove();
    
    db.ref('online').on('value', snapshot => {
        const count = snapshot.numChildren();
        const elements = document.querySelectorAll('.online-count');
        elements.forEach(el => {
            el.innerText = count;
        });
    });
}

// ========== PIN XABAR ==========
function syncPin() {
    db.ref('settings/pin').on('value', snapshot => {
        const pinBar = document.getElementById('pin-bar');
        const pinText = document.getElementById('pin-text');
        
        if (snapshot.exists() && snapshot.val()) {
            pinBar.style.display = "block";
            pinText.innerText = snapshot.val();
        } else {
            pinBar.style.display = "none";
        }
    });
}

// ========== FOYDALANUVCHI DARAJASI ==========
async function checkRank() {
    const rankEl = document.getElementById('user-rank');
    if (!rankEl) return;
    
    if (currentUser === "vuroxen") {
        rankEl.innerText = "Asoschi / Admin";
    } else {
        rankEl.innerText = "Foydalanuvchi";
    }
}

// ========== YORDAMCHI FUNKSIYALAR ==========
function getTime() { 
    return new Date().toLocaleTimeString('uz-UZ', { 
        hour: '2-digit', 
        minute: '2-digit' 
    }); 
}

function logout() { 
    if (confirm("Chiqishni xohlaysizmi?")) {
        localStorage.removeItem('chat_user');
        
        if (currentUser) {
            db.ref('online/' + currentUser).remove();
        }
        
        location.reload();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== FON ANIMATSIYASI ==========
function createHearts() {
    const container = document.getElementById('hearts-container');
    if (!container) return;
    
    setInterval(() => {
        const heart = document.createElement('div');
        heart.innerHTML = '💜';
        heart.style.position = 'fixed';
        heart.style.left = Math.random() * 100 + '%';
        heart.style.bottom = '-50px';
        heart.style.fontSize = Math.random() * 20 + 10 + 'px';
        heart.style.opacity = '0.3';
        heart.style.animation = 'floatUp 6s linear';
        heart.style.pointerEvents = 'none';
        
        container.appendChild(heart);
        
        setTimeout(() => heart.remove(), 6000);
    }, 2000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes floatUp {
        to {
            transform: translateY(-100vh) rotate(360deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

createHearts();

console.log("✅ Vuroxen Chat yuklandi!");
