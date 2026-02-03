document.addEventListener('DOMContentLoaded', () => {
    // Basic Firebase setup
    const firebaseConfig = {
        apiKey: "AIzaSyBR4q9dem2cVUY-r7bSwzsLQV4M2LNi4zQ",
        authDomain: "studio-7316459997-f5ae3.firebaseapp.com",
        projectId: "studio-7316459997-f5ae3",
        storageBucket: "studio-7316459997-f5ae3.appspot.com",
        messagingSenderId: "647609073070",
        appId: "1:647609073070:web:d17c6eee6a15eb42a45c3f"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();
    const auth = firebase.auth();
    const ADMIN_UID = "WEOFvjCGEwTQ52YJAuIcmOk3ZDB2";
    
    // DOM Elements
    const chatMessagesContainer = document.getElementById('chat-messages');
    const messageInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-btn');
    const attachButton = document.getElementById('attach-button');
    const fileInput = document.getElementById('file-input');
    
    // Image Preview Elements
    const imagePreviewBox = document.getElementById('imagePreviewBox');
    const previewImage = document.getElementById('previewImage');
    const confirmImageBtn = document.getElementById('confirmImage');
    const cancelImageBtn = document.getElementById('cancelImage');
    let selectedImageFile = null;

    // Image Modal Elements
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');

    // Menu Elements
    const chatMenuBtn = document.getElementById('chatMenuBtn');
    const chatMenu = document.getElementById('chatMenu');
    const openProfileBtn = document.getElementById('openProfile');
    const menuAvatar = document.getElementById('menuAvatar');
    const menuUsername = document.getElementById('menuUsername');
    const searchMessagesBtn = document.getElementById('searchMessages');
    const searchImagesBtn = document.getElementById('searchImages');


    // Get chat ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('id');

    if (!chatId) {
        if(chatMessagesContainer) chatMessagesContainer.innerHTML = '<p style="text-align:center; color: var(--error);">لم يتم العثور على معرف المحادثة.</p>';
        if(messageInput) messageInput.disabled = true;
        if(sendButton) sendButton.disabled = true;
        return;
    }

    // --- Cloudinary Upload Helper ---
    async function uploadToCloudinary(file, folder = 'uploads') {
        const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dsuwpbgin/image/upload";
        const UPLOAD_PRESET = "Tarekbuy";

        if (!file) throw new Error("No file provided for upload.");
        if (file.size > 5 * 1024 * 1024) throw new Error("File size exceeds the 5MB limit.");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("folder", folder);

        try {
            const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
            const data = await res.json();
            if (!data.secure_url) {
                console.error("Cloudinary upload failed:", data);
                throw new Error("Failed to upload image to Cloudinary.");
            }
            return data.secure_url;
        } catch (err) {
            console.error("Cloudinary connection error:", err);
            throw new Error("Could not connect to the image upload service.");
        }
    }
    
    // NEW: Simple filter function
    function isMessageForbidden(text) {
        if (!text) return { forbidden: false };
        const textLower = text.toLowerCase();
        
        const forbiddenKeywords = ["@", "gmail", "yahoo", "hotmail", "telegram", "instagram", "facebook", "wa.me", "t.me"];
        for (const keyword of forbiddenKeywords) {
            if (textLower.includes(keyword)) {
                return { forbidden: true, reason: `الكلمة الممنوعة: ${keyword}` };
            }
        }
        
        const phoneRegex = /[\d\s-]{8,}/;
        if (phoneRegex.test(text)) {
            return { forbidden: true, reason: "تم اكتشاف رقم هاتف." };
        }

        return { forbidden: false };
    }

    async function logViolation(userUid, chatId, content, type) {
        try {
            await db.collection("violations").add({
                userUid,
                chatId,
                content,
                type,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            // Increment admin notification counter
            const notifRef = db.collection("admin").doc("notifications");
            notifRef.set({
                unreadViolations: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });

        } catch (error) {
            console.error("Error logging violation:", error);
        }
    }
    
    async function addSystemMessage(text) {
        if (!chatId) return;
        try {
            await db.collection("chats").doc(chatId).collection("messages").add({
                type: "system",
                text: text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch(error) {
            console.error("Error adding system message:", error);
        }
    }
    
    // --- UI Helpers ---
    let toastTimer;
    function showToast(message) {
      const toast = document.getElementById('toast-container');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.classList.add('hidden'); toast.classList.remove('show'); }, 3000);
    }

    function scrollToBottom() {
      if(chatMessagesContainer) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
    }
    
    async function getPublicProfile(uid) {
        if (!uid) return null;
        try {
            const publicRef = db.doc(`users/${uid}/public/profile`);
            const doc = await publicRef.get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error(`Error fetching public profile for ${uid}:`, error);
            return null;
        }
    }

    if(messageInput && sendButton) {
        messageInput.addEventListener('input', () => {
            sendButton.disabled = !messageInput.value.trim();
        });

        messageInput.addEventListener("keypress", e => {
          if (e.key === "Enter" && !sendButton.disabled) {
            sendButton.click();
          }
        });
    }
    
    // --- Deal Summary ---
    function renderDealSummary(chat) {
      const dealSummaryContainer = document.getElementById('dealSummary');
      if (!chat.deal || !dealSummaryContainer) return;
    
      const deal = chat.deal;
      dealSummaryContainer.classList.remove('hidden');
    
      document.getElementById('dealAdTitle').innerText = deal.adTitle;
      document.getElementById('dealPrice').innerText = deal.price + ' دج';
      
      let statusText = 'جارية';
      if (deal.status === 'closed') statusText = 'مغلقة';
      if (deal.status === 'cancelled') statusText = 'ملغاة';
      document.getElementById('dealStatus').innerText = statusText;

      document.getElementById('dealStart').innerText = deal.startedAt.toDate().toLocaleDateString('ar-DZ');
    
      if (deal.status === 'closed' && deal.closedAt) {
        document.getElementById('dealCloseRow').style.display = 'flex';
        document.getElementById('dealClose').innerText = deal.closedAt.toDate().toLocaleDateString('ar-DZ');
      }
    
      const closeDealBtn = document.getElementById('closeDealBtn');
      if (deal.status === 'open') {
        closeDealBtn.classList.remove('hidden');
        closeDealBtn.onclick = async () => {
            if (!confirm('هل أنت متأكد من إغلاق الصفقة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
            try {
                await db.collection('chats').doc(chatId).update({
                    'deal.status': 'closed',
                    'deal.closedAt': firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('تم إغلاق الصفقة، يمكنك الآن تقييم هذا التعامل من صفحة الإعلان ⭐');
                closeDealBtn.classList.add('hidden');
            } catch (error) {
                console.error("Error closing deal:", error);
                showToast('فشل إغلاق الصفقة. يرجى المحاولة مرة أخرى.');
            }
        };
      }
    }

    // --- Chat Menu Logic ---
    if (chatMenuBtn && chatMenu) {
        chatMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!chatMenu.contains(e.target) && !chatMenuBtn.contains(e.target)) {
                chatMenu.classList.add('hidden');
            }
        });
    }

    // --- Message Rendering ---
    function renderMessage(msg, currentUserId, previousMsg) {
        const wrapper = document.createElement("div");
        wrapper.dataset.type = msg.type;
        
        if (msg.type === 'system') {
            wrapper.classList.add("message-wrapper", "system");
            wrapper.innerHTML = `<div class="message-bubble system">${msg.text}</div>`;
            return wrapper;
        }

        const isMine = msg.senderUid === currentUserId;
        wrapper.classList.add("message-wrapper", isMine ? "me" : "other");

        const showSenderInfo = !isMine && (!previousMsg || previousMsg.senderUid !== msg.senderUid || previousMsg.type === 'system');

        const time = msg.createdAt?.toDate ?
            msg.createdAt.toDate().toLocaleString("ar-DZ", {
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: "2-digit", minute: "2-digit"
            }) : "";

        const readIcon = isMine ? (msg.readBy?.length > 1 ? "✔✔" : "✔") : "";
        const readClass = isMine && msg.readBy?.length > 1 ? "read" : "";

        let messageContent = '';
        if (msg.type === 'image' && msg.imageUrl) {
            messageContent = `<img src="${msg.imageUrl}" alt="Image message" class="chat-image">`;
        } else {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = msg.text;
            messageContent = tempDiv.innerHTML;
        }
        
        let senderInfoHtml = '';
        if (showSenderInfo) {
            const senderName = msg.senderSnapshot?.username || 'مستخدم';
            senderInfoHtml = `<div class="username">${senderName}</div>`;
        }

        wrapper.innerHTML = `
            ${senderInfoHtml}
            <div class="message-bubble ${isMine ? "me" : "other"}">
                ${messageContent}
            </div>
            <div class="message-time ${readClass}">
                ${time} ${isMine ? readIcon : ""}
            </div>
        `;

        return wrapper;
    }


    // --- Chat Header Logic ---
    async function loadChatAdLink(chatId) {
        const adLinkBtn = document.getElementById('chat-ad-link');
        if (!chatId || !adLinkBtn) return;
    
        try {
            const chatRef = db.collection('chats').doc(chatId);
            const chatSnap = await chatRef.get();
    
            if (chatSnap.exists()) {
                const chatData = chatSnap.data();
                if (chatData.adId) {
                    adLinkBtn.href = `ad-details.html?id=${chatData.adId}`;
                    adLinkBtn.style.display = 'inline-block';
                }
            }
        } catch (error) {
            console.error("Failed to load chat ad link:", error);
            adLinkBtn.style.display = 'none';
        }
    }

    // --- Image Handling ---
    async function sendImageMessage(imageUrl, senderProfile) {
        const user = auth.currentUser;
        if (!user || !chatId || !senderProfile) return;

        try {
            await db.collection('chats').doc(chatId).collection('messages').add({
                senderUid: user.uid,
                senderSnapshot: {
                    username: senderProfile.username,
                    avatar: senderProfile.avatar,
                    role: senderProfile.role
                },
                type: 'image',
                text: '',
                imageUrl: imageUrl,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                readBy: [user.uid]
            });

            if (user.uid !== ADMIN_UID) {
                const notifRef = db.collection("admin").doc("notifications");
                notifRef.set({
                    chatUnread: firebase.firestore.FieldValue.increment(1)
                }, { merge: true });
            }

        } catch (error) {
            console.error("Error sending image message:", error);
            alert("فشل إرسال رسالة الصورة.");
        }
    }

    async function uploadAndSendImage(file, senderProfile) {
        const user = auth.currentUser;
        if (!user || !file) return;

        confirmImageBtn.textContent = 'جاري الرفع...';
        
        try {
            const imageUrl = await uploadToCloudinary(file, 'chat-media');
            await sendImageMessage(imageUrl, senderProfile);

        } catch (error) {
            console.error("Error uploading image:", error);
            alert("فشل في رفع الصورة: " + error.message);
        } finally {
            confirmImageBtn.disabled = false;
            confirmImageBtn.textContent = '✔ إرسال';
            selectedImageFile = null;
            fileInput.value = "";
            if (imagePreviewBox) imagePreviewBox.classList.add("hidden");
        }
    }
    
    if(attachButton && fileInput) {
        attachButton.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                if (previewImage) previewImage.src = reader.result;
                if (imagePreviewBox) imagePreviewBox.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
        });
    }

    if(cancelImageBtn) {
        cancelImageBtn.addEventListener('click', () => {
            selectedImageFile = null;
            fileInput.value = "";
            if (imagePreviewBox) imagePreviewBox.classList.add("hidden");
        });
    }

    // --- Image Modal Logic ---
    if (chatMessagesContainer) {
        chatMessagesContainer.addEventListener("click", (e) => {
            if (e.target.classList.contains("chat-image")) {
                if(modalImage) modalImage.src = e.target.src;
                if(imageModal) imageModal.classList.remove("hidden");
            }
        });
    }


    if(imageModal) {
        imageModal.addEventListener('click', () => imageModal.classList.add("hidden"));
    }
    
    // --- Main Auth and Chat Logic ---
    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const currentUser = user;
        const isAdmin = currentUser.uid === ADMIN_UID;
        
        // Check permissions before proceeding
        const chatRef = db.collection('chats').doc(chatId);
        const chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            if(chatMessagesContainer) chatMessagesContainer.innerHTML = '<p style="text-align:center; color: var(--error);">لم يتم العثور على هذه المحادثة.</p>';
            return;
        }
        const chatData = chatSnap.data();

        if (!isAdmin && !chatData.participants.includes(currentUser.uid)) {
            if(chatMessagesContainer) chatMessagesContainer.innerHTML = '<p style="text-align:center; color: var(--error);">ليس لديك صلاحية لعرض هذه المحادثة.</p>';
            if(messageInput) messageInput.disabled = true;
            if(sendButton) sendButton.disabled = true;
            return;
        }

        // Render Deal Summary
        renderDealSummary(chatData);

        // Define senderProfile for sending messages
        let senderProfile;
        if (isAdmin) {
            senderProfile = { username: 'الإدارة', avatar: '🛡️', role: 'admin' };
        } else {
            senderProfile = await getPublicProfile(currentUser.uid);
        }

        if (!senderProfile) {
             if(chatMessagesContainer) chatMessagesContainer.innerHTML = '<p style="text-align:center; color: var(--error);">تعذر تحميل ملفك الشخصي. لا يمكن إرسال الرسائل.</p>';
             if(messageInput) messageInput.disabled = true;
             if(sendButton) sendButton.disabled = true;
             return;
        }
        
        // --- Menu Logic ---
        const otherParticipantUid = chatData.participants.find(p => p !== currentUser.uid && p !== ADMIN_UID) || chatData.participants.find(p => p !== ADMIN_UID);
        if (otherParticipantUid && openProfileBtn) {
            const otherUserProfile = await getPublicProfile(otherParticipantUid);
            if (otherUserProfile) {
                if(menuAvatar) {
                    const avatarContent = otherUserProfile.avatar;
                    if(avatarContent.startsWith('http')) {
                        menuAvatar.innerHTML = `<img src="${avatarContent}" alt="${otherUserProfile.username}" />`;
                    } else {
                        menuAvatar.textContent = avatarContent;
                    }
                }
                if(menuUsername) menuUsername.textContent = otherUserProfile.username;
                openProfileBtn.addEventListener('click', () => {
                    window.location.href = `account.html?uid=${otherParticipantUid}`;
                });
            }
        } else {
            if(openProfileBtn) openProfileBtn.style.display = 'none';
        }
        
        if (searchMessagesBtn) {
            searchMessagesBtn.addEventListener('click', () => {
                chatMenu.classList.add('hidden');
                const keyword = prompt("اكتب كلمة للبحث في المحادثة (اتركها فارغة لإظهار الكل):");
                if (keyword === null) return;
                const lowerKeyword = keyword.toLowerCase().trim();
                let found = 0;
                document.querySelectorAll(".message-wrapper").forEach(wrapper => {
                    const bubble = wrapper.querySelector('.message-bubble');
                    if (!lowerKeyword || (bubble && bubble.textContent.toLowerCase().includes(lowerKeyword))) {
                        wrapper.style.display = "flex";
                        if(lowerKeyword) found++;
                    } else {
                        wrapper.style.display = "none";
                    }
                });
                if (found === 0 && lowerKeyword) showToast('لم يتم العثور على نتائج.');
            });
        }
        
        if (searchImagesBtn) {
            searchImagesBtn.addEventListener('click', () => {
                chatMenu.classList.add('hidden');
                let found = 0;
                document.querySelectorAll(".message-wrapper").forEach(wrapper => {
                    if (wrapper.dataset.type === 'image') {
                        wrapper.style.display = 'flex';
                        found++;
                    } else {
                        wrapper.style.display = 'none';
                    }
                });
                if (found === 0) {
                    showToast('لا توجد صور في هذه المحادثة.');
                    document.querySelectorAll(".message-wrapper").forEach(wrapper => wrapper.style.display = 'flex');
                }
            });
        }

        // Load the ad link in the header
        const adLinkBtn = document.getElementById('chat-ad-link');
        if (adLinkBtn && chatData.adId) {
            adLinkBtn.href = `ad-details.html?id=${chatData.adId}`;
            adLinkBtn.style.display = 'inline-block';
        }

        if (confirmImageBtn) {
            confirmImageBtn.addEventListener('click', async () => {
                if (!selectedImageFile) return;

                confirmImageBtn.disabled = true;
                await uploadAndSendImage(selectedImageFile, senderProfile);
            });
        }
        
        const messagesQuery = db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc');
        
        const unsubscribe = messagesQuery.onSnapshot(snapshot => {
            if (snapshot.empty) {
                 if(chatMessagesContainer) chatMessagesContainer.innerHTML = '<p style="text-align:center; color: var(--muted-foreground); margin: auto;">لا توجد رسائل بعد. ابدأ المحادثة!</p>';
                 return;
            }
            
            if(chatMessagesContainer) chatMessagesContainer.innerHTML = '';
            
            let previousMsg = null;
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));

            messages.forEach(message => {
                if (!message.readBy?.includes(currentUser.uid) && message.senderUid !== currentUser.uid) {
                    message.ref.update({
                        readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
                    });
                }
                
                if(chatMessagesContainer) chatMessagesContainer.appendChild(renderMessage(message, currentUser.uid, previousMsg));
                previousMsg = message;
            });
            
            scrollToBottom();

        }, error => {
            console.error("Error fetching messages:", error);
            if(chatMessagesContainer) chatMessagesContainer.innerHTML = `<p style="text-align:center; color: var(--error);">فشل في تحميل الرسائل.</p>`;
        });

        // Handle text message sending
        if (sendButton) {
            sendButton.addEventListener('click', async () => {
                const text = messageInput.value.trim();
                messageInput.value = ''; // Clear input immediately
                sendButton.disabled = true;

                if (!text) return;
                
                // Simple Moderation for text
                const filterResult = isMessageForbidden(text);
                if (filterResult.forbidden) {
                    await logViolation(currentUser.uid, chatId, text, 'text-filter-violation');
                    await addSystemMessage("⚠️ تم منع رسالة لمحاولة مشاركة وسيلة تواصل أو الخروج من المنصة.");
                    return; // Stop the message from being sent
                }
                
                navigator.vibrate?.(20);

                try {
                    await db.collection('chats').doc(chatId).collection('messages').add({
                        senderUid: currentUser.uid,
                        senderSnapshot: {
                            username: senderProfile.username,
                            avatar: senderProfile.avatar,
                            role: senderProfile.role
                        },
                        type: 'text',
                        text: text,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        readBy: [currentUser.uid]
                    });

                    if (currentUser.uid !== ADMIN_UID) {
                        const notifRef = db.collection("admin").doc("notifications");
                        notifRef.set({
                            chatUnread: firebase.firestore.FieldValue.increment(1)
                        }, { merge: true });
                    }

                } catch (error) {
                    console.error("Error sending message:", error);
                    showToast("فشل إرسال الرسالة.");
                }
            });
        }
        
        window.addEventListener('beforeunload', () => {
            if (unsubscribe) {
                unsubscribe();
            }
        });
    });
});
