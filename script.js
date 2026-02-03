document.addEventListener('DOMContentLoaded', () => {
    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }

    document.addEventListener('click', function(e) {
        const ownerLink = e.target.closest('.ad-owner, .clickable-user');
        if (ownerLink && ownerLink.dataset.ownerId) {
            e.preventDefault(); 
            e.stopPropagation(); 
            window.location.href = `account.html?uid=${ownerLink.dataset.ownerId}`;
        }
    }, true);

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
    
    const avatarOptions = ["🧑‍🎓", "🧑‍⚕️", "🧑‍🏭", "🧑‍🔧", "🙍", "🫅", "👷", "🥷", "💂"];

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


    // --- UI & Notification Helpers ---
    let toastTimer;
    function showToast(message) {
      const toast = document.getElementById('toast-container');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.classList.add('hidden'); toast.classList.remove('show'); }, 5000);
      toast.addEventListener('click', () => { toast.classList.add('hidden'); toast.classList.remove('show'); clearTimeout(toastTimer); }, { once: true });
    }
    function playNotificationSound() {
      const sound = document.getElementById("msgSound");
      if (sound) sound.play().catch(e => console.log("Audio playback failed:", e));
    }

    // --- NEW SECURE DATA MODEL HELPERS ---

    async function createUserProfile(user, userType, firstName, lastName, selectedAvatar) {
        const uid = user.uid;
        const batch = db.batch();
        const username = `${firstName} ${lastName}`;

        // PRIVATE DATA
        const privateRef = db.doc(`users/${uid}/private/profile`);
        const privateData = {
            email: user.email,
            firstName: firstName,
            lastName: lastName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            bio: ""
        };

        // PUBLIC PROFILE
        const publicRef = db.doc(`users/${uid}/public/profile`);
        const publicData = {
            username: username,
            role: userType,
            avatar: selectedAvatar || '🧑‍💼',
            bio: "",
            rating: 0,
            ratingCount: 0,
            adsCount: 0,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        
        batch.set(privateRef, privateData);
        batch.set(publicRef, publicData);
        return batch.commit();
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
    
    async function getPrivateProfile(uid) {
        if (!uid) return null;
        try {
            const privateRef = db.doc(`users/${uid}/private/profile`);
            const doc = await privateRef.get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error(`Error fetching private profile for ${uid}:`, error);
            return null;
        }
    }
    
    // --- Unread Messages Badge Listener ---
    let unsubscribeBadgeListener = null;
    let isFirstMessageSnapshot = true; // Global flag for message notifications

    function listenForUnreadMessages(userId) {
        if (unsubscribeBadgeListener) {
            unsubscribeBadgeListener();
            unsubscribeBadgeListener = null;
        }
        isFirstMessageSnapshot = true;
        
        const headerBadge = document.querySelector('#profileAvatar .badge');
        const msgTabBadge = document.getElementById('msgBadge');

        if (!userId) {
            if(headerBadge) headerBadge.style.display = 'none';
            if(msgTabBadge) msgTabBadge.style.display = 'none';
            return;
        }
        
        const query = db.collection('users').doc(userId).collection('inbox').where('read', '==', false);
        
        unsubscribeBadgeListener = query.onSnapshot(snapshot => {
            const unreadCount = snapshot.size;
            
            // Update badges based on the query result
            const badges = [headerBadge, msgTabBadge];
            badges.forEach(badge => {
                if (!badge) return;
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.style.display = badge.id === 'msgBadge' ? 'inline-block' : 'flex';
                } else {
                    badge.style.display = 'none';
                }
            });

            // Handle toast notifications for new messages after the initial load
            if (!isFirstMessageSnapshot) {
                const messagesTabVisible = document.getElementById('messages')?.style.display === 'block';
                snapshot.docChanges().forEach(change => {
                    if (change.type === "added" && !messagesTabVisible) {
                        playNotificationSound();
                        showToast(change.doc.data().title || 'رسالة جديدة');
                    }
                });
            }
            
            // We've processed the initial data, any future snapshots are real-time changes
            isFirstMessageSnapshot = false; 

        }, error => {
            console.error("Error listening to unread messages:", error);
            if(headerBadge) headerBadge.style.display = 'none';
            if(msgTabBadge) msgTabBadge.style.display = 'none';
        });
    }

    // --- Firebase Auth State Management ---
    auth.onAuthStateChanged(async user => {
        if (user) {
            const authContainer = document.getElementById('auth-container');
            if (authContainer) {
                const publicProfile = await getPublicProfile(user.uid);
                const firstName = publicProfile ? (publicProfile.username || '').split(' ')[0] : 'مستخدم';
                let avatar = publicProfile ? publicProfile.avatar : '?';
                let avatarContent = avatar.startsWith('http') ? `<img src="${avatar}" alt="Profile Picture">` : avatar;

                authContainer.innerHTML = `
                    <div class="user-info">
                         <a href="account.html" id="avatar-link" class="profile-avatar-container">
                            <div id="profileAvatar" class="avatar">
                                <span class="badge" style="display:none;">0</span>
                                ${avatarContent}
                            </div>
                            <span class="avatar-username">${firstName}</span>
                        </a>
                    </div>
                    <button id="logout-btn" class="logout-btn">خروج</button>
                `;
                document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
            }
            
            listenForUnreadMessages(user.uid);
            const postAdCtaContainer = document.getElementById('post-ad-cta-container');
            if(postAdCtaContainer) postAdCtaContainer.innerHTML = `<a href="post-ad.html" class="post-ad-btn">أضف إعلانًا جديدًا</a>`;

            if (document.body.id === 'account-page-body') {
                const urlParams = new URLSearchParams(window.location.search);
                const profileUid = urlParams.get('uid') || user.uid;
                const isOwnProfile = user.uid === profileUid;
                
                let fullProfileData = null;
                const publicData = await getPublicProfile(profileUid);

                if (isOwnProfile) {
                    const privateData = await getPrivateProfile(profileUid);
                    fullProfileData = { ...publicData, ...privateData };
                } else {
                    fullProfileData = publicData;
                }
                populateAccountPage(profileUid, fullProfileData, isOwnProfile);
            }

            // Run setup for post-ad page only when user is confirmed
            if (window.location.pathname.endsWith('/post-ad.html')) {
                setupPostAdForm();
            }

        } else { // User is signed out
            const authContainer = document.getElementById('auth-container');
            if (authContainer) authContainer.innerHTML = '<a href="login.html" class="login-btn">تسجيل الدخول</a>';
            
            const postAdCtaContainer = document.getElementById('post-ad-cta-container');
            if(postAdCtaContainer) postAdCtaContainer.innerHTML = '';
            
            listenForUnreadMessages(null);

            const path = window.location.pathname;
            const params = window.location.search;
            if (path.endsWith('account.html')) {
                const profileUid = new URLSearchParams(params).get('uid');
                if (!profileUid) {
                     window.location.href = 'login.html';
                } else {
                    const publicData = await getPublicProfile(profileUid);
                    populateAccountPage(profileUid, publicData, false);
                }
            } else if (path.endsWith('post-ad.html') || path.endsWith('chat.html') || path.endsWith('payment.html')) {
                 window.location.href = `login.html?redirect=${path.substring(1)}${params}`;
            }
        }
    });

    // --- Ad Fetching and Rendering ---
    async function fetchAndRenderAds(userType, container) {
        if (!container) return;
        try {
            const adsQuery = db.collection('ads').where('userType', '==', userType);
            const snapshot = await adsQuery.get();

            if (snapshot.empty) {
                container.innerHTML = '<p>لا توجد إعلانات متاحة حاليًا.</p>';
                return;
            }
            container.innerHTML = '';

            for (const doc of snapshot.docs) {
                const ad = { id: doc.id, ...doc.data() };
                const ownerProfile = await getPublicProfile(ad.ownerUid);
                const adCard = createAdCard(ad, ownerProfile);
                container.appendChild(adCard);
            }
        } catch (error) {
            console.error(`Error fetching ${userType} ads: `, error);
            container.innerHTML = '<p>حدث خطأ أثناء تحميل الإعلانات.</p>';
        }
    }
    
    function createAdCard(ad, ownerProfile) {
        const card = document.createElement("div");
        card.className = "ad-card";
        
        const ownerName = ownerProfile ? ownerProfile.username : 'مستخدم';
        const ownerAvatar = ownerProfile ? ownerProfile.avatar : '🧑‍💼';
        const avatarDisplay = ownerAvatar.startsWith('http') ? `<img src="${ownerAvatar}" alt="${ownerName}">` : ownerAvatar;
    
        const adMetaHTML = `
            <div class="ad-meta">
                <span>💰 العمولة: ${ad.pricePerSale || 'غير محدد'} دج</span>
                <span>⏳ المدة: ${ad.goalDays || 'غير محدد'} يوم</span>
                <span>🎯 الهدف: ${ad.maxSales || 'غير محدد'} مبيعات</span>
            </div>
        `;

        card.innerHTML = `
            <div class="ad-header">
              <div class="ad-user clickable-user" data-owner-id="${ad.ownerUid}">
                <div class="ad-avatar">${avatarDisplay}</div>
                <span class="ad-name">${ownerName}</span>
              </div>
              <span class="ad-role">${ad.userType === 'trader' ? 'تاجر' : 'مسوق'}</span>
            </div>
            <h3 class="ad-title">${ad.title}</h3>
            <p class="ad-text">${ad.description || ''}</p>
            ${adMetaHTML}
            <div class="ad-price">${ad.price} دج</div>
            <button class="read-more-btn">اقرأ المزيد...</button>
          `;
    
        card.querySelector(".read-more-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            window.location.href = `ad-details.html?id=${ad.id}`;
        });
        card.addEventListener('click', () => window.location.href = `ad-details.html?id=${ad.id}`);
        return card;
    }

    async function handleDealRequest(adId, adOwnerUid, adTitle, adUserType, currentUser, currentUserProfile, buttonElement) {
        try {
            const currentUserUid = currentUser.uid;
            if (!adId || !currentUserUid) {
                alert("حدث خطأ، يرجى إعادة المحاولة.");
                return;
            }
    
            buttonElement.disabled = true;
            buttonElement.textContent = 'جاري الإرسال...';
    
            const requestRef = db
                .collection('ads')
                .doc(adId)
                .collection('requests')
                .doc(currentUserUid);
    
            const requestData = {
                fromUserId: currentUserUid,
                merchantId: currentUserUid,
                ownerUid: adOwnerUid,
                adId: adId,
                adTitle: adTitle,
                requesterName: currentUserProfile.username,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
    
            await requestRef.set(requestData);
    
            // --- DYNAMIC NOTIFICATION MESSAGE ---
            let notificationTitle;
            let notificationMessage;
            let notificationAction = {}; // To hold optional actionLabel and actionUrl
    
            const requesterRoleText = currentUserProfile.role === 'trader' ? 'التاجر' : 'المسوق';

            // Determine message content based on the ADVERTISER's role (adUserType)
            if (adUserType === 'trader') {
                // SCENARIO 2: A Marketer is applying to a Trader's ad.
                // Message goes to the Trader (adOwner). It should contain a payment link.
                notificationTitle = `طلب تعامل من ${requesterRoleText}: ${currentUserProfile.username}`;
                notificationMessage = `${requesterRoleText} ${currentUserProfile.username} مهتم بالعمل على إعلانك "${adTitle}". يمكنك قبول طلبه وبدء المعاملة مباشرة عبر الدفع.`;
                notificationAction = {
                    actionLabel: 'قبول وبدء المعاملة',
                    actionUrl: `payment.html?id=${adId}&requesterId=${currentUserUid}`
                };
            } else {
                // SCENARIO 1: A Trader is applying to a Marketer's ad.
                // Message goes to the Marketer (adOwner). Simple notification.
                notificationTitle = `طلب تعامل من ${requesterRoleText}: ${currentUserProfile.username}`;
                notificationMessage = `${requesterRoleText} ${currentUserProfile.username} مهتم بالتعامل معك بخصوص إعلان "${adTitle}".`;
            }
    
            // Send inbox notification to the ad owner
            const inboxRef = db.collection('users').doc(adOwnerUid).collection('inbox');
            await inboxRef.add({
                type: "deal_request",
                fromUserId: currentUserUid,
                toUserId: adOwnerUid,
                title: notificationTitle,
                message: notificationMessage,
                adId: adId,
                read: false,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                ...notificationAction // Add actionLabel and actionUrl if they exist
            });
    
            const contactDiv = buttonElement.parentElement;
            if (contactDiv) {
                contactDiv.innerHTML = `
                    <div class="deal-request-success">
                        ✅ لقد تم ارسال طلبكم
                    </div>
                `;
            }
    
        } catch (error) {
            console.error("Error sending deal request:", error);
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.textContent = 'تعامل مع المعلن';
            }
            alert("حدث خطأ أثناء إرسال الطلب. يرجى المحاولة لاحقًا.");
        }
    }

    async function populateAdDetailsPage() {
        const adDetailsContainer = document.getElementById('ad-details-container');
        if (!adDetailsContainer) return;
    
        const adId = new URLSearchParams(window.location.search).get('id');
        if (!adId) {
            adDetailsContainer.innerHTML = '<p class="error-message">لم يتم العثور على الإعلان.</p>';
            return;
        }
    
        try {
            const adDoc = await db.collection('ads').doc(adId).get();
            if (!adDoc.exists) {
                adDetailsContainer.innerHTML = '<p class="error-message">لم يتم العثور على هذا الإعلان.</p>';
                return;
            }
            
            const ad = adDoc.data();
            const creatorProfile = await getPublicProfile(ad.ownerUid);
            const currentUser = auth.currentUser;
            let currentUserProfile = null;
            
            if (currentUser && currentUser.uid) {
                currentUserProfile = await getPublicProfile(currentUser.uid);
            }
            
            const creatorName = creatorProfile ? creatorProfile.username : 'مستخدم غير معروف';
            let avatar = creatorProfile ? creatorProfile.avatar : '?';
            let avatarDisplay = avatar.startsWith('http') ? `<img src="${avatar}" alt="${creatorName}">` : avatar;
    
            document.title = `${ad.title} - DzBigbuy`;
            const roleText = ad.userType === 'trader' ? 'تاجر' : 'مسوق';
            
            let actionButtonsHTML = '';
            
            if (currentUser && currentUser.uid) {
                if (currentUser.uid === ad.ownerUid) {
                    actionButtonsHTML = `<a href="edit-ad.html?id=${adDoc.id}" class="edit-ad-btn">تعديل الإعلان</a>`;
                } else {
                    const requestRef = db.collection('ads').doc(adId).collection('requests').doc(currentUser.uid);
                    const requestSnap = await requestRef.get();
    
                    if (requestSnap.exists) {
                        actionButtonsHTML = `
                            <div class="deal-request-success">
                                ✅ لقد تم ارسال طلبكم
                            </div>
                        `;
                    } else {
                        actionButtonsHTML = `<button id="deal-request-btn" class="contact-btn">تعامل مع المعلن</button>`;
                    }
                }
            } else {
                const loginRedirect = `login.html?redirect=ad-details.html?id=${adId}`;
                actionButtonsHTML = `<a href="${loginRedirect}" class="contact-btn">تعامل مع المعلن</a>`;
            }

            adDetailsContainer.innerHTML = `
                <div class="ad-detail-card">
                  <div class="ad-detail-header">
                    <span class="ad-role">${roleText}</span>
                    <h2 class="ad-title">${ad.title}</h2>
                  </div>
                  <p class="ad-text">${ad.description}</p>
                  
                   <!-- CAMPAIGN GOALS SECTION -->
                  <div class="campaign-goals">
                    <h3 class="goals-header">تفاصيل وأهداف الحملة</h3>
                    <div class="goals-grid">
                        <div class="goal-item">
                            <span class="goal-label">العمولة لكل عملية بيع</span>
                            <span class="goal-value">${ad.pricePerSale || 'N/A'} دج</span>
                        </div>
                        <div class="goal-item">
                            <span class="goal-label">الحد الأقصى للمبيعات</span>
                            <span class="goal-value">${ad.maxSales || 'N/A'}</span>
                        </div>
                        <div class="goal-item">
                            <span class="goal-label">مدة الحملة بالأيام</span>
                            <span class="goal-value">${ad.goalDays || 'N/A'}</span>
                        </div>
                    </div>
                  </div>
                  <!-- END CAMPAIGN GOALS SECTION -->

                  <div class="ad-detail-footer">
                    <a href="account.html?uid=${ad.ownerUid}" class="ad-owner" data-owner-id="${ad.ownerUid}">
                      <span class="ad-avatar">${avatarDisplay}</span>
                      <span class="ad-name">${creatorName}</span>
                    </a>
                    <div class="ad-price">${ad.price} دج</div>
                  </div>
                  <div class="ad-contact">
                    ${actionButtonsHTML}
                  </div>
                </div>
            `;
            
            const dealRequestBtn = document.getElementById('deal-request-btn');
            if(dealRequestBtn) {
                dealRequestBtn.addEventListener('click', (e) => {
                     if (!currentUser || !currentUserProfile) {
                        window.location.href = `login.html?redirect=ad-details.html?id=${adId}`;
                        return;
                    }
                    // Pass ad.userType here
                    handleDealRequest(adId, ad.ownerUid, ad.title, ad.userType, currentUser, currentUserProfile, e.currentTarget);
                });
            }


            const ratingSection = document.createElement('div');
            ratingSection.id = 'ratingSection';
            ratingSection.style.display = 'none';
            ratingSection.innerHTML = `
                <h3>⭐ قيّم هذا التعامل</h3>
                <div class="form-group">
                  <label for="ratingStars">التقييم:</label>
                  <select id="ratingStars">
                    <option value="5">⭐⭐⭐⭐⭐</option>
                    <option value="4">⭐⭐⭐⭐</option>
                    <option value="3">⭐⭐⭐</option>
                    <option value="2">⭐⭐</option>
                    <option value="1">⭐</option>
                  </select>
                </div>
                <div class="form-group">
                    <label for="ratingComment">تعليق:</label>
                    <textarea id="ratingComment" placeholder="اكتب رأيك هنا..."></textarea>
                </div>
                <button id="submitRatingBtn" class="auth-button">إرسال التقييم</button>
            `;
            adDetailsContainer.appendChild(ratingSection);

            checkIfCanRate(adId, ad.ownerUid);

        } catch (error) {
            console.error("Error fetching ad details: ", error);
            adDetailsContainer.innerHTML = '<p class="error-message">حدث خطأ أثناء تحميل تفاصيل الإعلان.</p>';
        }
    }

    // --- Form Handlers ---
    if (document.getElementById('login-form')) {
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMessageDiv = document.getElementById('error-message');
            auth.signInWithEmailAndPassword(email, password)
                .then(() => {
                    const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
                    window.location.href = redirectUrl || 'account.html';
                })
                .catch(error => {
                    if(errorMessageDiv) errorMessageDiv.textContent = 'فشل تسجيل الدخول. يرجى التحقق من البيانات.';
                });
        });
    }

    if (document.getElementById('register-form')) {
        const registerForm = document.getElementById('register-form');
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorMessageDiv = document.getElementById('error-message');
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'جاري الإنشاء...';
            }
            if(errorMessageDiv) errorMessageDiv.textContent = '';

            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const userType = document.querySelector('input[name="userType"]:checked').value;
            const selectedAvatar = document.getElementById('selectedAvatar').value;

            if (!firstName || !lastName || !email || !password) {
                 if(errorMessageDiv) errorMessageDiv.textContent = 'يرجى ملء جميع الحقول الشخصية المطلوبة.';
                 if (submitBtn) {
                     submitBtn.disabled = false;
                     submitBtn.textContent = 'إنشاء الحساب';
                 }
                 return;
            }
            
            try {
                if (submitBtn) submitBtn.textContent = 'جاري إنشاء الحساب...';

                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const newUser = userCredential.user;
                
                await createUserProfile(newUser, userType, firstName, lastName, selectedAvatar);

                if (userType === 'trader') {
                    if (submitBtn) submitBtn.textContent = 'جاري رفع الصور...';

                    const productDescription = document.getElementById('productDescription').value;
                    const productImageFiles = document.getElementById('productImage').files;
                    const productColors = document.getElementById('productColors').value;
                    const productSizes = document.getElementById('productSizes').value;
                    const productQuantity = document.getElementById('productQuantity').value;
                    
                    if (productDescription || productImageFiles.length > 0) {
                        const uploadedImageUrls = [];
                        for (const file of productImageFiles) {
                            const imageUrl = await uploadToCloudinary(file, `products/${newUser.uid}`);
                            uploadedImageUrls.push(imageUrl);
                        }
                        
                        const firstProductData = {
                            name: productDescription.substring(0, 40), // Use first 40 chars as name
                            description: productDescription,
                            images: uploadedImageUrls,
                            colors: productColors,
                            sizes: productSizes,
                            quantity: parseInt(productQuantity, 10) || 0,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        };
                        
                        await db.collection('users').doc(newUser.uid).collection('products').add(firstProductData);
                    }
                }

                window.location.href = 'account.html';

            } catch(error) {
                 console.error("Registration Error:", error);
                 if(errorMessageDiv) errorMessageDiv.textContent = 'فشل إنشاء الحساب. ' + error.message;
                 if (submitBtn) {
                     submitBtn.disabled = false;
                     submitBtn.textContent = 'إنشاء الحساب';
                 }
            }
        });
        
        const userTypeRadios = document.querySelectorAll('input[name="userType"]');
        const traderFields = document.getElementById('trader-fields');

        function toggleTraderFields() {
            if (!traderFields) return;
            const selectedType = document.querySelector('input[name="userType"]:checked');
            if (selectedType && selectedType.value === 'trader') {
                traderFields.style.display = 'block';
            } else {
                traderFields.style.display = 'none';
            }
        }

        if (userTypeRadios.length > 0) {
            userTypeRadios.forEach(radio => radio.addEventListener('change', toggleTraderFields));
            toggleTraderFields(); // Initial check on page load
        }
    }


    const postAdForm = document.getElementById('post-ad-form');
    if (postAdForm) {
        postAdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            const errorMessageDiv = document.getElementById('error-message');
            const submitBtn = document.getElementById('post-ad-submit-btn');
    
            if (!user) {
                if (errorMessageDiv) errorMessageDiv.textContent = 'يجب عليك تسجيل الدخول أولاً.';
                return;
            }
    
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'جاري التحقق...';
            }
            if(errorMessageDiv) errorMessageDiv.textContent = '';
    
    
            const publicProfile = await getPublicProfile(user.uid);
            if (!publicProfile) {
                if (errorMessageDiv) errorMessageDiv.textContent = 'لا يمكن تحميل ملفك الشخصي. لا يمكنك نشر إعلان.';
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
    
            try {
                const title = document.getElementById('title').value;
                const description = document.getElementById('description').value;
                const pricePerSale = parseFloat(document.getElementById('pricePerSale').value);
                const maxSales = parseInt(document.getElementById('maxSales').value, 10);
                const goalDays = parseInt(document.getElementById('goalDays').value, 10);
                const price = parseFloat(document.getElementById('price').value);
    
                if (!title || !description || isNaN(pricePerSale) || isNaN(maxSales) || isNaN(goalDays)) {
                    throw new Error('يرجى ملء جميع حقول الإعلان الرئيسية بشكل صحيح.');
                }
    
                let adData;
    
                if (publicProfile.role === 'marketer') {
                    adData = {
                        title,
                        description,
                        category: 'مسوق',
                        price: Number(price),
                        pricePerSale,
                        maxSales,
                        goalDays,
                        ownerUid: user.uid,
                        userType: 'marketer',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    };
                } else { // Trader
                    // --- 1. Gather and Validate Product Data ---
                    const productName = document.getElementById('productName').value;
                    const productDescription = document.getElementById('productDescription').value;
                    const productImagesFiles = document.getElementById('productImages').files;
                    const productColors = document.getElementById('productColors').value;
                    const productSizes = document.getElementById('productSizes').value;
                    const productPrice = parseFloat(document.getElementById('productPrice').value);
    
                    if (!productName || !productDescription || isNaN(productPrice) || productImagesFiles.length === 0) {
                        throw new Error('يرجى ملء جميع حقول السلعة المطلوبة، بما في ذلك صورة واحدة على الأقل.');
                    }
                    
                    // --- 2. Upload Product Images ---
                    if (submitBtn) submitBtn.textContent = 'جاري رفع صور السلعة...';
                    const uploadedImageUrls = [];
                    for (const file of productImagesFiles) {
                        const imageUrl = await uploadToCloudinary(file, `products/${user.uid}`);
                        uploadedImageUrls.push(imageUrl);
                    }
                    
                    // --- 3. Create Product in Subcollection ---
                    if (submitBtn) submitBtn.textContent = 'جاري حفظ السلعة...';
                    const newProductData = {
                        name: productName,
                        description: productDescription,
                        price: Number(productPrice),
                        images: uploadedImageUrls,
                        colors: productColors,
                        sizes: productSizes,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    };
                    await db.collection('users').doc(user.uid).collection('products').add(newProductData);

                    // --- 4. Create Ad Data (without product info) ---
                    adData = {
                        title,
                        description, // Marketer Specs
                        category: 'تاجر',
                        price: Number(price),
                        pricePerSale,
                        maxSales,
                        goalDays,
                        ownerUid: user.uid,
                        userType: 'trader',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    };
                }
    
                if (submitBtn) submitBtn.textContent = 'جاري نشر الإعلان...';
                
                const docRef = await db.collection('ads').add(adData);
                window.location.href = `ad-details.html?id=${docRef.id}`;
    
            } catch (error) {
                console.error("Error adding ad: ", error);
                if (errorMessageDiv) errorMessageDiv.textContent = 'فشل إضافة الإعلان. ' + error.message;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'نشر الإعلان';
                }
            }
        });
    }


    // --- Ad Deletion ---
    async function deleteAd(adId, adTitle) {
        try {
            await db.collection('ads').doc(adId).delete();
            showToast('تم حذف الإعلان بنجاح.');
            const adRow = document.querySelector(`button[data-ad-id="${adId}"]`).closest('tr');
            if (adRow) adRow.remove();
        } catch (error) {
            console.error("Error deleting ad:", error);
            showToast('فشل حذف الإعلان. يرجى المحاولة مرة أخرى.');
        }
    }

     // --- Account Page Logic ---
     async function showRequestsLinkIfNeeded(userId) {
        const requestsTab = document.getElementById('requestsTab');
        if (!requestsTab) return;
    
        try {
            // Find just one ad owned by the user
            const adsSnap = await db.collection('ads').where('ownerUid', '==', userId).limit(1).get();
    
            if (adsSnap.empty) {
                requestsTab.style.display = 'none';
                return;
            }
    
            // If there's an ad, check if it has ever received any request
            const adDoc = adsSnap.docs[0];
            const requestsSnap = await db.collection('ads').doc(adDoc.id).collection('requests').limit(1).get();
    
            if (!requestsSnap.empty) {
                requestsTab.style.display = 'flex';
            } else {
                requestsTab.style.display = 'none';
            }
        } catch (error) {
            console.error("Error checking for deal requests:", error);
            requestsTab.style.display = 'none';
        }
    }

    async function populateUserAds(userId, viewingOwnProfile) {
        const adsTbody = document.getElementById('user-ads-tbody');
        const adsPlaceholder = document.getElementById('user-ads-placeholder');
        if (!adsTbody || !adsPlaceholder) return;

        const adsQuery = db.collection('ads').where('ownerUid', '==', userId);
        const adsSnapshot = await adsQuery.get();

        if (adsSnapshot.empty) {
            adsTbody.innerHTML = '';
            adsPlaceholder.innerHTML = `<p style="text-align: center; color: var(--muted-foreground); margin-top: 1rem;">${viewingOwnProfile ? 'لم تقم بنشر أي إعلانات بعد.' : 'لم يقم هذا المستخدم بنشر أي إعلانات.'}</p>`;
            adsPlaceholder.style.display = 'block';
        } else {
            adsPlaceholder.style.display = 'none';
            adsTbody.innerHTML = '';
            adsSnapshot.forEach(adDoc => {
                const ad = adDoc.data();
                const adId = adDoc.id;
                const adDate = ad.createdAt.toDate().toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
                
                let actionButtonsHTML = `<a href="ad-details.html?id=${adId}" class="table-action-btn">عرض</a>`;
                if (viewingOwnProfile) {
                    actionButtonsHTML += `<a href="edit-ad.html?id=${adId}" class="table-action-btn edit-btn-table">✏️</a>`;
                    actionButtonsHTML += `<button class="table-action-btn delete" data-ad-id="${adId}" data-ad-title="${ad.title}">🗑️</button>`;
                }

                const row = adsTbody.insertRow();
                row.innerHTML = `
                    <td><a href="ad-details.html?id=${adId}" class="table-link">${ad.title}</a></td>
                    <td class="text-nowrap">${ad.price} دج</td>
                    <td class="text-nowrap">${adDate}</td>
                    <td class="action-cell">
                        ${actionButtonsHTML}
                    </td>
                `;
            });
            adsTbody.querySelectorAll('.delete').forEach(button => {
                button.addEventListener('click', (e) => {
                   deleteAd(e.currentTarget.dataset.adId, e.currentTarget.dataset.adTitle)
                });
            });
        }
    }

    function populateUserMessages(userId) {
        const inboxContainer = document.getElementById('inbox-container');
        const messagesPlaceholder = document.getElementById('user-messages-placeholder');
        if (!inboxContainer || !messagesPlaceholder || !userId) return;
    
        const query = db.collection("users").doc(userId).collection("inbox").orderBy("createdAt", "desc");
        
        query.onSnapshot((snapshot) => {
            if (snapshot.empty) {
                inboxContainer.innerHTML = '';
                messagesPlaceholder.innerHTML = `<p style="text-align: center; color: var(--muted-foreground); margin-top: 1rem;">لا توجد رسائل.</p>`;
                messagesPlaceholder.style.display = 'block';
                return;
            }
            messagesPlaceholder.style.display = 'none';
            inboxContainer.innerHTML = ''; 

            const allDocs = snapshot.docs;

            // Count total admin messages to start numbering from the total
            let adminMessageCounter = allDocs.filter(doc => doc.data().type === 'admin_decision').length;

            // Render all messages
            allDocs.forEach(doc => {
                const msg = doc.data();
                const msgId = doc.id;
                
                const dateObj = msg.createdAt ? msg.createdAt.toDate() : new Date();
                const date = dateObj.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const time = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const messageDiv = document.createElement("div");
                messageDiv.classList.add("inbox-item");
                if (msg.read) {
                    messageDiv.classList.add("read");
                }
                
                let contentHTML = `<div class="inbox-message-content">${msg.message || ''}</div>`;
                if (msg.actionUrl && msg.actionLabel) {
                    contentHTML += `<a href="${msg.actionUrl}" class="chat-btn">${msg.actionLabel}</a>`;
                }

                const isAccepted = msg.status === 'accepted' || msg.status === 'approved';
                const statusBadge = msg.status ? `<span class="status-badge status-${isAccepted ? 'approved' : 'rejected'}">${isAccepted ? 'مقبول' : 'مرفوض'}</span>` : '';


                let transactionNumberHTML = '';
                // New logic: Only number admin messages
                if (msg.type === 'admin_decision') {
                    transactionNumberHTML = `<span class="inbox-item-number">المعاملة رقم(${adminMessageCounter})</span>`;
                    adminMessageCounter--; // Decrement for the next newest admin message
                }

                messageDiv.innerHTML = `
                    <div class="inbox-title-status">
                        ${transactionNumberHTML}
                        <span class="inbox-title">${msg.title || 'رسالة جديدة'}</span>
                        ${statusBadge}
                    </div>
                    ${contentHTML}
                    <div class="inbox-datetime"><span class="inbox-date">${date}</span><span class="inbox-time">${time}</span></div>
                `;
                messageDiv.addEventListener("click", async () => {
                    if (!msg.read) await db.collection("users").doc(userId).collection("inbox").doc(msgId).update({ read: true });
                });
                inboxContainer.appendChild(messageDiv);
            });
        }, (error) => {
             console.error("Error fetching messages:", error);
             if(messagesPlaceholder) messagesPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل جلب الرسائل.</p>`;
        });
    }
    
    async function updatePublicProfile(uid, data) {
        const publicRef = db.doc(`users/${uid}/public/profile`);
        await publicRef.update(data);
    }

    function setupAvatarUpload(userId) {
        const avatarInput = document.getElementById('avatarInput');
        if (!avatarInput) return;
    
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !userId) return;
    
            // --- 1. Instant Preview ---
            const reader = new FileReader();
            reader.onload = () => {
                const imageUrl = reader.result;
                const pageAvatar = document.getElementById('profileAvatarLarge');
                if (pageAvatar) {
                    pageAvatar.innerHTML = ''; 
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.alt = "Profile Picture";
                    pageAvatar.appendChild(img);
                }
                const headerAvatar = document.querySelector('#profileAvatar');
                if (headerAvatar) {
                    const badge = headerAvatar.querySelector('.badge');
                    headerAvatar.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.alt = "Profile Picture";
                    headerAvatar.appendChild(img);
                    if (badge) headerAvatar.prepend(badge);
                }
            };
            reader.readAsDataURL(file);
    
            // --- 2. Background Upload ---
            showToast('جاري رفع الصورة...');
            try {
                const url = await uploadToCloudinary(file, `avatars/${userId}`);
                await updatePublicProfile(userId, { avatar: url });
                showToast('تم تحديث الصورة بنجاح!');
            } catch (error) {
                console.error("Error uploading avatar:", error);
                showToast('فشل تحديث الصورة: ' + error.message);
                // Optional: You could revert the preview image to the old one here if needed
            }
        });
    }
    
    function setupAvatarSelection(userId, currentAvatar = '') {
        const avatarContainer = document.getElementById("avatarOptionsContainer");
        if (!avatarContainer) return;
        avatarContainer.innerHTML = ''; 
        avatarOptions.forEach(emoji => {
            const span = document.createElement("span");
            span.textContent = emoji;
            span.classList.add("avatar-choice");
            if (emoji === currentAvatar) span.classList.add("selected");
            span.addEventListener("click", async () => {
                try {
                    await updatePublicProfile(userId, { avatar: emoji });
                    showToast('تم تحديث الأفاتار!');
                    avatarContainer.querySelectorAll(".avatar-choice").forEach(el => el.classList.remove("selected"));
                    span.classList.add("selected");
                    
                    const headerAvatar = document.querySelector('#profileAvatar');
                    if (headerAvatar) {
                        const badge = headerAvatar.querySelector('.badge');
                        headerAvatar.innerHTML = emoji;
                        if (badge) headerAvatar.prepend(badge);
                    }
                    const pageAvatar = document.getElementById('profileAvatarLarge');
                    if(pageAvatar) pageAvatar.innerHTML = emoji;
                } catch (error) {
                    console.error("Error updating avatar emoji: ", error);
                    showToast('فشل تحديث الأفاتار.');
                }
            });
            avatarContainer.appendChild(span);
        });
    }

    function renderStarRating(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<span class="star ${i <= rating ? 'filled' : ''}">⭐</span>`;
        }
        return `<div class="star-rating">${stars}</div>`;
    }

    async function populateUserReviews(userId) {
        const reviewsContainer = document.getElementById('reviews-container');
        const reviewsPlaceholder = document.getElementById('reviews-placeholder');
        if (!reviewsContainer || !reviewsPlaceholder) return;

        try {
            reviewsPlaceholder.innerHTML = '<p style="text-align: center; color: var(--muted-foreground);">جاري تحميل التقييمات...</p>';
            reviewsPlaceholder.style.display = 'block';
            reviewsContainer.innerHTML = '';

            const ratingsQuery = db.collection('ratings').where('toUid', '==', userId);
            const snapshot = await ratingsQuery.get();

            if (snapshot.empty) {
                reviewsPlaceholder.innerHTML = '<p style="text-align: center; color: var(--muted-foreground);">لا توجد تقييمات لعرضها حاليًا.</p>';
                return;
            }

            reviewsPlaceholder.style.display = 'none';

            const sortedDocs = snapshot.docs.sort((a, b) => {
                const dateA = a.data().createdAt?.toDate() || 0;
                const dateB = b.data().createdAt?.toDate() || 0;
                return dateB - dateA;
            });

            for (const doc of sortedDocs) {
                const rating = doc.data();
                const reviewerProfile = await getPublicProfile(rating.fromUid);

                const reviewerName = reviewerProfile ? reviewerProfile.username : 'مستخدم محذوف';
                const reviewerAvatar = reviewerProfile ? reviewerProfile.avatar : '👤';
                const avatarDisplay = reviewerAvatar.startsWith('http') 
                    ? `<img src="${reviewerAvatar}" alt="${reviewerName}" class="avatar-img">`
                    : `<span class="avatar-emoji">${reviewerAvatar}</span>`;
                
                const date = rating.createdAt ? rating.createdAt.toDate().toLocaleDateString('ar-EG', { numberingSystem: 'latn' }) : '';

                const reviewCard = document.createElement('div');
                reviewCard.className = 'review-card';
                reviewCard.innerHTML = `
                    <div class="review-header">
                        <div class="reviewer-info clickable-user" data-owner-id="${rating.fromUid}">
                            <div class="avatar-wrapper">${avatarDisplay}</div>
                            <span class="reviewer-name">${reviewerName}</span>
                        </div>
                        ${renderStarRating(rating.stars)}
                    </div>
                    ${rating.comment ? `<p class="review-comment">"${rating.comment}"</p>` : ''}
                    <div class="review-footer">
                        <span class="review-date">${date}</span>
                    </div>
                `;
                reviewsContainer.appendChild(reviewCard);
            }

        } catch (error) {
            console.error("Error fetching user reviews:", error);
            reviewsPlaceholder.innerHTML = '<p class="error-message" style="text-align: center;">فشل تحميل التقييمات.</p>';
        }
    }


    async function populateAccountPage(userId, userProfile, isOwnProfile) {
        const messagesTab = document.getElementById('messagesTab');
        const inboxTab = document.getElementById('inboxTab');
        
        // Set tab visibility first, as it's independent of profile data
        if (isOwnProfile) {
            if(messagesTab) messagesTab.style.display = 'flex';
            if(inboxTab) inboxTab.style.display = 'none';
        } else {
            if(messagesTab) messagesTab.style.display = 'none';
            if(inboxTab) inboxTab.style.display = 'flex';
        }

        const profileContent = document.getElementById('profile');
        if (!profileContent || !userProfile) {
            if(profileContent) profileContent.innerHTML = '<p>لم يتم العثور على بيانات الملف الشخصي.</p>';
            document.getElementById('ads').style.display = 'none';
            document.getElementById('messages').style.display = 'none';
            return;
        }
        
        const username = userProfile.username || `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
        document.getElementById('profile-name-title').textContent = username;
        document.getElementById('profile-name').textContent = username;
        document.getElementById('profile-usertype').textContent = userProfile.role === 'trader' ? 'تاجر' : 'مسوق';
        document.getElementById('profile-rating').innerHTML = `⭐ ${userProfile.rating || 0} (${userProfile.ratingCount || 0} تقييم)`;
        
        const emailDd = document.getElementById('profile-email');
        if (isOwnProfile && userProfile.email) {
            emailDd.textContent = userProfile.email;
            emailDd.parentElement.style.display = 'block';
        } else {
             if (emailDd) emailDd.parentElement.style.display = 'none';
        }
        
        const regDateDd = document.getElementById('profile-since');
        const regDate = userProfile.joinedAt?.toDate() || (userProfile.createdAt?.toDate());
        if (regDate) {
            regDateDd.textContent = regDate.toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
        } else {
             if(regDateDd) regDateDd.parentElement.style.display = 'none';
        }

        const largeAvatarDiv = document.getElementById('profileAvatarLarge');
         if (largeAvatarDiv) {
            let avatar = userProfile.avatar || '?';
            largeAvatarDiv.innerHTML = avatar.startsWith('http') ? `<img src="${avatar}" alt="Profile Picture">` : avatar;
        }
        
        populateUserReviews(userId);
        populateUserAds(userId, isOwnProfile);

        const messagesContent = document.getElementById('messages');
        const inboxContent = document.getElementById('inbox');
        const avatarSelectionSection = document.getElementById('avatarSelection');
        const changeAvatarLabel = document.getElementById('change-avatar-label');
        const manageProductsTab = document.getElementById('manage-products-tab');
        
        if (isOwnProfile) {
            profileContent.classList.add('is-owner');
            if(inboxContent) inboxContent.style.display = 'none';
            
            if(avatarSelectionSection) avatarSelectionSection.style.display = 'block';
            if(changeAvatarLabel) changeAvatarLabel.style.display = 'block';

            populateUserMessages(userId);
            setupAvatarUpload(userId);
            setupAvatarSelection(userId, userProfile.avatar);
            showRequestsLinkIfNeeded(userId);

            // New logic for manage products tab
            if (userProfile.role === 'trader' && manageProductsTab) {
                manageProductsTab.style.display = 'flex';
                manageProductsTab.href = `my-product.html?merchantUid=${userId}`;
            } else if (manageProductsTab) {
                manageProductsTab.style.display = 'none';
            }

        } else {
            profileContent.classList.remove('is-owner');
            if(messagesContent) messagesContent.style.display = 'none';
            
            if(avatarSelectionSection) avatarSelectionSection.style.display = 'none';
            if(changeAvatarLabel) changeAvatarLabel.style.display = 'none';

            // Hide for non-owners too
            if (manageProductsTab) {
                manageProductsTab.style.display = 'none';
            }
        }

        const defaultText = isOwnProfile ? 'أضف قيمة...' : '— لم يتم التحديد —';
        document.getElementById('view-bio').textContent = userProfile.bio || defaultText;
        
        const detailsSectionTitle = document.getElementById('details-section-title');
        // Logic to hide the "Public Profile" title for traders
        if (userProfile.role === 'trader') {
            if (detailsSectionTitle) detailsSectionTitle.style.display = 'none';
        } else {
             if (detailsSectionTitle) {
                detailsSectionTitle.textContent = 'الملف الشخصي العام';
                detailsSectionTitle.style.display = 'block';
            }
        }
    }

    // --- Tab Switching Logic ---
    function initializeTabs() {
        const tabButtons = document.querySelectorAll(".tab-btn");
        const tabContents = document.querySelectorAll(".tab-content");
        if(tabButtons.length === 0) return;
        tabButtons.forEach(btn => {
          btn.addEventListener("click", () => {
            if (btn.style.display === 'none') return;
            if (btn.tagName === 'A') {
                return;
            }
            tabButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.style.display = "none");
            btn.classList.add("active");
            const activeTab = document.getElementById(btn.dataset.tab);
            if (activeTab) activeTab.style.display = "block";
            
            if (btn.dataset.tab === 'messages') {
                const user = auth.currentUser;
                if(user) {
                    // Hide badges immediately for instant feedback
                    const headerBadge = document.querySelector('#profileAvatar .badge');
                    if (headerBadge) headerBadge.style.display = 'none';
                    const msgTabBadge = document.getElementById('msgBadge');
                    if (msgTabBadge) msgTabBadge.style.display = 'none';

                    // Update Firestore in the background
                    db.collection('users').doc(user.uid).collection('inbox').where('read', '==', false).get().then(snapshot => {
                        if (snapshot.empty) return;
                        const batch = db.batch();
                        snapshot.docs.forEach(doc => batch.update(doc.ref, { read: true }));
                        batch.commit().catch(err => console.error("Error marking messages as read:", err));
                    });
                }
            }
          });
        });
    }

    function initializeAvatarSelectionForRegistration() {
        const avatarContainer = document.getElementById("avatarOptionsContainer");
        const selectedAvatarInput = document.getElementById("selectedAvatar");
        if (!avatarContainer || !selectedAvatarInput) return;
        
        // Select first avatar by default
        selectedAvatarInput.value = avatarOptions[0];
        
        avatarOptions.forEach((emoji, index) => {
            const span = document.createElement("span");
            span.textContent = emoji;
            span.classList.add("avatar-choice");
            if(index === 0) span.classList.add("selected");
            
            span.addEventListener("click", () => {
                avatarContainer.querySelector(".avatar-choice.selected")?.classList.remove("selected");
                span.classList.add("selected");
                selectedAvatarInput.value = emoji;
            });
            avatarContainer.appendChild(span);
        });
    }
    
    function initializeAccordions() {
        const accordions = document.querySelectorAll(".accordion-header");
        if (accordions.length === 0) return;

        accordions.forEach(accordion => {
            accordion.addEventListener("click", function() {
                this.classList.toggle("active");
                const content = this.nextElementSibling;
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    // Set a slight delay to ensure the 'active' class is applied for CSS transitions
                    setTimeout(() => {
                        content.style.maxHeight = content.scrollHeight + "px";
                    }, 10);
                }
            });
        });
    }

    async function setupPostAdForm() {
        const form = document.getElementById('post-ad-form');
        const loadingDiv = document.getElementById('post-ad-loading');
        
        if (!form || !loadingDiv) return;
    
        form.style.display = 'none';
        loadingDiv.style.display = 'block';
    
        const user = auth.currentUser;
        if (!user) {
            showToast('يجب عليك تسجيل الدخول أولاً.');
            window.location.href = `login.html?redirect=${window.location.pathname}`;
            return;
        }
    
        const publicProfile = await getPublicProfile(user.uid);
        if (!publicProfile) {
            showToast('لا يمكن تحميل ملفك الشخصي. لا يمكنك نشر إعلان.');
            window.location.href = 'account.html';
            return;
        }
        
        const subtitle = document.getElementById('post-ad-subtitle');
        const descriptionLabel = document.getElementById('description-label');
        const descriptionTextarea = document.getElementById('description');
        const categoryInput = document.getElementById('category');
        const priceInput = document.getElementById('price');
        const pricePerSaleInput = document.getElementById('pricePerSale');
        const maxSalesInput = document.getElementById('maxSales');
        const traderFields = document.getElementById('trader-fields');
        
        const calculateTotalPrice = () => {
            const pricePerSale = parseFloat(pricePerSaleInput.value) || 0;
            const maxSales = parseInt(maxSalesInput.value, 10) || 0;
            if(priceInput) priceInput.value = pricePerSale * maxSales;
        };
    
        if (pricePerSaleInput && maxSalesInput) {
            pricePerSaleInput.addEventListener('input', calculateTotalPrice);
            maxSalesInput.addEventListener('input', calculateTotalPrice);
        }
        
        if (publicProfile.role === 'marketer') {
            if (subtitle) subtitle.textContent = 'عرف بخدماتك كمسوق للحصول على فرص من التجار';
            if (traderFields) traderFields.style.display = 'none';
    
            if (descriptionLabel) descriptionLabel.textContent = 'وصف الخدمة (عرف بما يمكنك تقديمه كمسوق)';
            if (descriptionTextarea) descriptionTextarea.placeholder = 'اكتب وصفًا تفصيليًا حتى يعجب بإعلانك التاجر...';
    
            if (categoryInput) {
                categoryInput.value = 'مسوق';
                if (categoryInput.parentElement) categoryInput.parentElement.style.display = 'none';
            }
    
            if (priceInput) priceInput.readOnly = true;
    
            calculateTotalPrice();
        } else { // Trader
            if (subtitle) subtitle.textContent = 'املأ تفاصيل إعلانك وسلعتك';
            if (traderFields) traderFields.style.display = 'block';
    
            if (descriptionLabel) descriptionLabel.textContent = 'مواصفات المسوق المطلوب';
            if (descriptionTextarea) descriptionTextarea.placeholder = 'اشرح ماتريده بالتفصيل من المسوق .';
    
            if (categoryInput) {
                categoryInput.value = 'تاجر';
                if (categoryInput.parentElement) categoryInput.parentElement.style.display = 'none';
            }
            
            if (priceInput) priceInput.readOnly = true;
    
            document.getElementById('productName').required = true;
            document.getElementById('productDescription').required = true;
            document.getElementById('productPrice').required = true;
            document.getElementById('productImages').required = true;
    
            calculateTotalPrice();
        }
        
        loadingDiv.style.display = 'none';
        form.style.display = 'flex';
    }


    // --- Initial Page Load Logic ---
    function initializePage() {
        const traderAdsContainer = document.getElementById('trader-ads-container');
        if (traderAdsContainer) fetchAndRenderAds('trader', traderAdsContainer);

        const marketerAdsContainer = document.getElementById('marketer-ads-container');
        if (marketerAdsContainer) fetchAndRenderAds('marketer', marketerAdsContainer);
        
        if (document.body.id === 'ad-details-page-body') populateAdDetailsPage();
        
        initializeTabs();
        initializeAccordions();
        
        if (window.location.pathname.endsWith('/register.html') || window.location.pathname.endsWith('/register')) {
            initializeAvatarSelectionForRegistration();
        }
    }

    // --- RATING SYSTEM FUNCTIONS ---

    async function checkIfCanRate(adId, ownerUid) {
      const user = auth.currentUser;
      if (!user) return;
    
      try {
          const chatSnap = await db.collection("chats")
            .where("adId", "==", adId)
            .where("participants", "array-contains", user.uid)
            .where("deal.status", "==", "closed")
            .get();
        
          if (chatSnap.empty) return;
        
          const chatDoc = chatSnap.docs[0];
          const chatId = chatDoc.id;
        
          const ratingSnap = await db.collection("ratings")
            .where("chatId", "==", chatId)
            .where("fromUid", "==", user.uid)
            .get();
        
          if (!ratingSnap.empty) return;
        
          const ratingSection = document.getElementById("ratingSection");
          if(ratingSection) ratingSection.style.display = "block";
        
          bindRatingSubmit(adId, ownerUid, chatId);
      } catch(error) {
          console.error("Error checking if user can rate: ", error);
      }
    }
    
    function bindRatingSubmit(adId, ownerUid, chatId) {
      const btn = document.getElementById("submitRatingBtn");
      if (!btn) return;
    
      btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;
    
        const stars = parseInt(document.getElementById("ratingStars").value, 10);
        const comment = document.getElementById("ratingComment").value.trim();
    
        if (!stars || stars < 1 || stars > 5) {
          showToast("تقييم غير صالح");
          return;
        }

        btn.disabled = true;
        btn.textContent = 'جاري الإرسال...';
    
        try {
            await db.collection("ratings").add({
              fromUid: user.uid,
              toUid: ownerUid,
              adId,
              chatId,
              stars,
              comment,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
            await updateUserRating(ownerUid);
        
            showToast("تم إرسال التقييم بنجاح ⭐");
            const ratingSection = document.getElementById("ratingSection");
            if(ratingSection) ratingSection.style.display = "none";
        } catch (error) {
            console.error("Error submitting rating: ", error);
            showToast("فشل إرسال التقييم.");
            btn.disabled = false;
            btn.textContent = 'إرسال التقييم';
        }
      };
    }
    
    async function updateUserRating(uid) {
        try {
            const snap = await db.collection("ratings")
                .where("toUid", "==", uid)
                .get();
            
            let total = 0;
            snap.forEach(doc => total += doc.data().stars);
            
            const avg = snap.size ? (total / snap.size).toFixed(1) : 0;
            
            await db.doc(`users/${uid}/public/profile`).set({
                  rating: Number(avg),
                  ratingCount: snap.size
            }, { merge: true });

        } catch (error) {
            console.error("Error updating user rating for " + uid, error);
        }
    }

    initializePage();
});
