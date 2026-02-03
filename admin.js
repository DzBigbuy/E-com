document.addEventListener('DOMContentLoaded', () => {
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

    const loginSection = document.getElementById('admin-login-section');
    const dashboardSection = document.getElementById('admin-dashboard-section');
    const loginForm = document.getElementById('admin-login-form');
    const errorMessageDiv = document.getElementById('admin-error-message');
    const logoutBtn = document.getElementById('admin-logout-btn');

    const usersListContainer = document.getElementById('users-list');
    const usersPlaceholder = document.getElementById('users-placeholder');
    const adsTbody = document.getElementById('ads-tbody');
    const adsPlaceholder = document.getElementById('ads-placeholder');
    const paymentsTbody = document.getElementById('payments-tbody');
    const paymentsPlaceholder = document.getElementById('payments-placeholder');
    const violationsContainer = document.getElementById('violationsContainer');
    const violationsPlaceholder = document.getElementById('violations-placeholder');


    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- Pagination State ---
    let allPayments = [];
    let currentPage = 1;
    const rowsPerPage = 10;
    const paginationControls = document.getElementById('pagination-controls');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');

    function showDashboard() {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
    }

    function showLogin() {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
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
    
     async function getAdDetails(adId) {
        if (!adId) return null;
        try {
            const adRef = db.collection('ads').doc(adId);
            const doc = await adRef.get();
            if (!doc.exists) {
                console.error(`Ad with ID ${adId} does not exist.`);
                return null;
            }
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error fetching ad details:", error);
            return null;
        }
    }

    async function fetchAndDisplayUsers() {
        if (!usersListContainer || !usersPlaceholder) return;
        try {
            usersListContainer.innerHTML = '';
            usersPlaceholder.innerHTML = '<p style="text-align: center;">جاري تحميل بيانات المستخدمين...</p>';
            usersPlaceholder.style.display = 'block';
    
            const usersSnapshot = await db.collection('users').get();
    
            if (usersSnapshot.empty) {
                usersPlaceholder.innerHTML = '<p style="text-align: center;">لا يوجد مستخدمون مسجلون حاليًا.</p>';
                return;
            }
            
            let usersFound = false;
            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
    
                const publicDoc = await db.doc(`users/${userId}/public/profile`).get();
                
                if (!publicDoc.exists) {
                    console.warn(`User ${userId} does not have a public profile, skipping.`);
                    continue;
                }
                
                const privateDoc = await db.doc(`users/${userId}/private/profile`).get();
    
                const publicData = publicDoc.data() || {};
                const privateData = privateDoc.exists ? privateDoc.data() : {};
                const user = { ...publicData, ...privateData };
                
                usersFound = true; 
    
                const registrationDate = user.joinedAt?.toDate() ? user.joinedAt.toDate().toLocaleDateString('ar-EG', { numberingSystem: 'latn' }) : 'غير متوفر';
                const avatarDisplay = user.avatar && user.avatar.startsWith('http') 
                    ? `<img src="${user.avatar}" alt="avatar" class="avatar-img">` 
                    : `<span class="avatar-emoji">${user.avatar || '👤'}</span>`;
                const rating = `${user.rating || 0}⭐ (${user.ratingCount || 0} تقييم)`;
                
                const card = document.createElement("div");
                card.className = "user-card-admin";
                card.innerHTML = `
                    <div class="user-card-admin-header">
                      <div class="avatar-wrapper">${avatarDisplay}</div>
                      <div class="user-info">
                        <strong>${user.username || "بدون اسم"}</strong>
                        <div class="role">${user.role === 'trader' ? 'تاجر' : 'مسوق'}</div>
                      </div>
                    </div>
                    <div class="user-card-admin-body">
                      <p><strong>البريد:</strong> ${user.email || 'غير متوفر'}</p>
                      <div class="rating"><strong>التقييم:</strong> ${rating}</div>
                      <small>تاريخ التسجيل: ${registrationDate}</small>
                    </div>
                `;
                usersListContainer.appendChild(card);
            }
    
            if (usersFound) {
                usersPlaceholder.style.display = 'none';
            } else {
                usersPlaceholder.innerHTML = '<p style="text-align: center;">لم يتم العثور على ملفات شخصية للمستخدمين.</p>';
            }
    
        } catch (error) {
            console.error("Error fetching users:", error.message);
            usersPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل جلب بيانات المستخدمين. الخطأ: ${error.message}</p>`;
            usersPlaceholder.style.display = 'block';
        }
    }

    async function fetchAndDisplayAds() {
        if (!adsTbody || !adsPlaceholder) return;
        try {
            const snapshot = await db.collection('ads').orderBy('createdAt', 'desc').get();

            if (snapshot.empty) {
                adsPlaceholder.innerHTML = '<p style="text-align: center;">لا توجد إعلانات منشورة حاليًا.</p>';
                return;
            }

            adsTbody.innerHTML = '';
            adsPlaceholder.style.display = 'none';

            for (const doc of snapshot.docs) {
                const ad = doc.data();
                const adId = doc.id;
                
                const userProfile = await getPublicProfile(ad.ownerUid);
                let creatorName = userProfile ? userProfile.username : 'غير معروف';

                const adDate = ad.createdAt && ad.createdAt.toDate ? ad.createdAt.toDate().toLocaleDateString('ar-EG', { numberingSystem: 'latn' }) : 'غير متوفر';
                const row = adsTbody.insertRow();
                row.innerHTML = `
                    <td><a href="ad-details.html?id=${adId}" class="table-link" target="_blank">${ad.title}</a></td>
                    <td>${creatorName}</td>
                    <td class="text-nowrap">${ad.price} دج</td>
                    <td class="text-nowrap">${adDate}</td>
                `;
            }

        } catch (error) {
            console.error("Error fetching ads:", error.message);
            adsPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل جلب الإعلانات. الخطأ: ${error.message}</p>`;
        }
    }
    
    function getStatusBadge(status) {
        switch (status) {
            case 'approved':
                return '<span class="status-badge status-approved">مقبول</span>';
            case 'rejected':
                return '<span class="status-badge status-rejected">مرفوض</span>';
            case 'pending':
            default:
                return '<span class="status-badge status-pending">قيد المراجعة</span>';
        }
    }
    
    function getActionButtons(payment) {
        const { status, id: paymentId, userId, adId, adSellerId, transactionId, transactionNumber } = payment;

        if (status === 'pending') {
            return `
                <button class="table-action-btn approve-btn" data-payment-id="${paymentId}" data-user-id="${userId}" data-ad-id="${adId}">قبول</button>
                <button class="table-action-btn reject-btn" data-payment-id="${paymentId}" data-user-id="${userId}" data-ad-id="${adId}">رفض</button>
            `;
        }
        if (status === 'approved' && transactionId) {
            const url = transactionNumber
              ? `transaction.html?id=${transactionId}&num=${transactionNumber}`
              : `transaction.html?id=${transactionId}`;
            return `<a href="${url}" target="_blank" class="table-action-btn chat-btn-admin">عرض المعاملة</a>`;
        }
        return 'لا يوجد إجراء';
    }
    
    function handleViewProof(proofUrl) {
        if (proofUrl) {
            window.open(proofUrl, '_blank');
        }
    }

    async function fetchAllPayments() {
        try {
            const snapshot = await db.collection('payments').orderBy('createdAt', 'desc').get();
            const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return paymentsData;
        } catch (error) {
            console.error("Error fetching payments:", error.message);
            paymentsPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل جلب سجلات الدفع. الخطأ: ${error.message}</p>`;
            return [];
        }
    }

    async function displayPaymentsPage(page) {
        paymentsTbody.innerHTML = '';
        currentPage = page;
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const paginatedItems = allPayments.slice(start, end);

        if (paginatedItems.length === 0 && page === 1) {
            paymentsPlaceholder.innerHTML = '<p style="text-align: center;">لا توجد سجلات دفع حاليًا.</p>';
            paymentsPlaceholder.style.display = 'block';
            paginationControls.style.display = 'none';
            return;
        }

        paymentsPlaceholder.style.display = 'none';

        for (const payment of paginatedItems) {
            const paymentId = payment.id;

            let userName = payment.userName || 'مستخدم غير معروف';
            let adTitle = payment.adTitle;
            let adSellerId = payment.adSellerId;
            let adPrice = payment.adPrice || "0";

            if (!payment.userName && payment.userId) {
                const userProfile = await getPublicProfile(payment.userId);
                userName = userProfile ? userProfile.username : 'مستخدم محذوف';
            }
            if (!adTitle && payment.adId) {
                const adDetails = await getAdDetails(payment.adId);
                if (adDetails) {
                    adTitle = adDetails.title;
                    adSellerId = adDetails.ownerUid;
                    payment.adSellerId = adDetails.ownerUid;
                    adPrice = adDetails.price || adPrice;
                } else {
                    adTitle = 'إعلان محذوف';
                }
            }
            
            const paymentDate = payment.createdAt ? payment.createdAt.toDate().toLocaleString('ar-EG', { numberingSystem: 'latn' }) : 'غير متوفر';
            const adLinkIcon = payment.adId ? `<a href="ad-details.html?id=${payment.adId}" target="_blank" title="فتح الإعلان في تبويب جديد" class="table-link-icon">📢</a>` : '—';
            
            const formattedUserName = userName.replace(' ', '<br>');

            const row = paymentsTbody.insertRow();
            row.id = `payment-${paymentId}`;
            row.innerHTML = `
                <td>${formattedUserName}</td>
                <td><a href="#" class="table-link view-proof-btn" data-proof-url="${payment.proofUrl || ''}">عرض</a></td>
                <td class="price-cell">${adPrice}</td>
                <td>${adLinkIcon}</td>
                <td class="text-nowrap">${paymentDate}</td>
                <td>${getStatusBadge(payment.status)}</td>
                <td class="action-cell">${getActionButtons(payment)}</td>
            `;
        }
        updatePaginationControls();
    }

    function updatePaginationControls() {
        const totalPages = Math.ceil(allPayments.length / rowsPerPage);
        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            return;
        }

        paginationControls.style.display = 'flex';
        pageInfo.textContent = `صفحة ${currentPage} من ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }


    async function initializePaymentsView() {
        if (!paymentsTbody || !paymentsPlaceholder) return;
        
        allPayments = await fetchAllPayments();

        if (allPayments.length === 0) {
            paymentsPlaceholder.innerHTML = '<p style="text-align: center;">لا توجد سجلات دفع حاليًا.</p>';
            paymentsPlaceholder.style.display = 'block';
            paymentsTbody.innerHTML = '';
            paginationControls.style.display = 'none';
        } else {
            paymentsPlaceholder.style.display = 'none';
            await displayPaymentsPage(1);
        }
    }
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                displayPaymentsPage(currentPage - 1);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(allPayments.length / rowsPerPage);
            if (currentPage < totalPages) {
                displayPaymentsPage(currentPage + 1);
            }
        });
    }

    async function notifyDealDecisionByAdmin({
        advertiserId,
        requesterId,
        decision,
        adTitle,
        transactionId, // Optional: for approved decisions
        transactionNumber // Optional: for approved decisions
    }) {
        const adminUser = auth.currentUser;
        if (!adminUser) return;
    
        // Fetch profiles to get names
        const advertiserProfile = await getPublicProfile(advertiserId);
        const requesterProfile = await getPublicProfile(requesterId);
    
        const advertiserName = advertiserProfile ? advertiserProfile.username : 'المعلن';
        const requesterName = requesterProfile ? requesterProfile.username : 'طالب التعامل';
    
        const decisionText =
            decision === 'approved'
                ? 'تم قبول المعاملة من طرف الإدارة ✅'
                : 'تم رفض المعاملة من طرف الإدارة ❌';
    
        // Dynamic messages
        const messageForAdvertiser = `قامت الإدارة بمراجعة إثبات الدفع وتم قبول المعاملة بينك وبين (${requesterName}). يمكنك الآن الدخول لصفحة المعاملة لمتابعة التقدم.`;
    
        const messageForRequester = `قامت الإدارة بمراجعة إثبات الدفع وتم قبول المعاملة بينك وبين (${advertiserName}). يمكنك الآن الدخول لصفحة المعاملة لمتابعة التقدم.`;
    
        const baseMessage = {
            type: 'admin_decision',
            category: 'requests',
            title: decisionText,
            // message will be set individually
            fromUserId: adminUser.uid, // المدير
            status: decision,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (decision === 'approved' && transactionId && transactionNumber) {
            baseMessage.actionLabel = 'الانتقال إلى صفحة المعاملة';
            baseMessage.actionUrl = `transaction.html?id=${transactionId}&num=${transactionNumber}`;
        }
    
        // 🔹 رسالة إلى المعلن
        await db
            .collection('users')
            .doc(advertiserId)
            .collection('inbox')
            .add({
                ...baseMessage,
                message: messageForAdvertiser,
                toUserId: advertiserId,
                extra: { adTitle }
            });
    
        // 🔹 رسالة إلى طالب التعامل
        await db
            .collection('users')
            .doc(requesterId)
            .collection('inbox')
            .add({
                ...baseMessage,
                message: messageForRequester,
                toUserId: requesterId,
                extra: { adTitle }
            });
    }

    async function handlePaymentAction(paymentId, newStatus, userId, adId) {
        const paymentRef = db.collection('payments').doc(paymentId);
    
        try {
            if (newStatus === 'approved') {
                const paymentSnap = await paymentRef.get();
                if (!paymentSnap.exists) throw new Error(`Payment document ${paymentId} not found.`);
                const paymentData = paymentSnap.data();

                const adRef = db.collection("ads").doc(adId);
                const adSnap = await adRef.get();
                if (!adSnap.exists) throw new Error(`Ad with ID ${adId} not found.`);
                const adData = adSnap.data();
                const adOwnerUid = adData.ownerUid;

                let otherPartyUid;
                if (userId === adOwnerUid) { // Payer is the ad owner (Case 2: Trader pays for Marketer's ad)
                    otherPartyUid = paymentData.requesterId; // The marketer who applied
                } else { // Payer is NOT the ad owner (Case 1: Trader applies to Marketer's ad and pays)
                    otherPartyUid = userId;
                }
                if (!otherPartyUid) throw new Error(`Could not resolve the other party for transaction on payment ${paymentId}`);

                // --- Get new Transaction Number ---
                const counterRef = db.doc('admin/transactions_counter');
                const newTransactionNumber = await db.runTransaction(async (t) => {
                    const counterDoc = await t.get(counterRef);
                    const newCount = (counterDoc.data()?.count || 0) + 1;
                    t.set(counterRef, { count: newCount }, { merge: true });
                    return newCount;
                });
                
                const goalDays = adData.goalDays || 30;
                const maxSales = adData.maxSales || 1;
                const pricePerSale = adData.pricePerSale || 0;
                const adTitle = adData.title || "إعلان بدون عنوان";
                const adPrice = adData.price || 0;
    
                const productDataForTransaction = {
                    name: adTitle,
                    description: adData.description || ""
                };
    
                const endAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + goalDays * 86400000));
                
                const newTransaction = {
                    transactionNumber: newTransactionNumber,
                    adId: adId,
                    adOwnerUid: adOwnerUid,
                    marketerUid: otherPartyUid,
                    participants: [adOwnerUid, otherPartyUid],
                    status: 'active',
                    startAt: firebase.firestore.FieldValue.serverTimestamp(),
                    endAt: endAt,
                    maxSales: Number(maxSales),
                    currentSales: 0,
                    pricePerSale: Number(pricePerSale),
                    goalDays: Number(goalDays),
                    adTitle: adTitle,
                    adPrice: adPrice,
                    product: productDataForTransaction
                };
    
                const transactionRef = await db.collection("transactions").add(newTransaction);
                
                await paymentRef.update({ 
                    status: 'approved',
                    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    transactionId: transactionRef.id,
                    transactionNumber: newTransactionNumber,
                });
                                
                await notifyDealDecisionByAdmin({
                    advertiserId: adOwnerUid,
                    requesterId: otherPartyUid,
                    decision: 'approved',
                    adTitle: adTitle,
                    transactionId: transactionRef.id,
                    transactionNumber: newTransactionNumber
                });
    
            } else if (newStatus === 'rejected') { 
                const paymentDoc = await paymentRef.get();
                 if (!paymentDoc.exists) {
                    console.error(`Payment ${paymentId} not found for rejection notification.`);
                    return;
                }
                const paymentData = paymentDoc.data();
                const adOwnerUid = paymentData.adSellerId;
                let otherPartyUid;

                if (paymentData.userId === adOwnerUid) {
                    otherPartyUid = paymentData.requesterId;
                } else {
                    otherPartyUid = paymentData.userId;
                }

                 await notifyDealDecisionByAdmin({
                    advertiserId: adOwnerUid,
                    requesterId: otherPartyUid,
                    decision: 'rejected',
                    adTitle: paymentData.adTitle
                 });
                 await paymentRef.update({ status: newStatus });
            }
    
            const paymentIndex = allPayments.findIndex(p => p.id === paymentId);
            if(paymentIndex > -1) {
                const updatedPaymentDoc = await paymentRef.get();
                allPayments[paymentIndex] = { id: paymentId, ...updatedPaymentDoc.data() };
            }
            await displayPaymentsPage(currentPage);
            
        } catch (error) {
            console.error(`Error updating payment status for ${paymentId}:`, error.message);
        }
    }

    if (paymentsTbody) {
        paymentsTbody.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.classList.contains('view-proof-btn')) {
                e.preventDefault();
                const proofUrl = target.dataset.proofUrl;
                handleViewProof(proofUrl);
                return;
            }
            
             if (target.classList.contains('table-link-icon')) {
                return;
            }

            if (target.classList.contains('approve-btn') || target.classList.contains('reject-btn')) {
                e.preventDefault();
                const btn = target;
                const { paymentId, userId, adId } = btn.dataset;

                if (target.classList.contains('approve-btn')) {
                    if(paymentId && userId && adId) handlePaymentAction(paymentId, 'approved', userId, adId);
                }
                if (target.classList.contains('reject-btn')) {
                     if(paymentId && userId && adId) handlePaymentAction(paymentId, 'rejected', userId, adId); 
                }
            }
        });
    }

    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = document.querySelector(tab.dataset.tabTarget);

                tabContents.forEach(content => {
                    content.classList.remove('active');
                });
                tabs.forEach(t => {
                    t.classList.remove('active');
                });

                tab.classList.add('active');
                target.classList.add('active');

                if (tab.dataset.tabTarget === '#payments-content') {
                     db.collection("admin").doc("notifications").set({ chatUnread: 0 }, { merge: true });
                }
                if (tab.dataset.tabTarget === '#violations-content') {
                    db.collection("admin").doc("notifications").set({ unreadViolations: 0 }, { merge: true });
                }
            });
        });
    }
    
    async function loadViolations() {
        if (!violationsContainer || !violationsPlaceholder) return;
        try {
            violationsContainer.innerHTML = '';
            violationsPlaceholder.innerHTML = '<p style="text-align: center;">جاري تحميل المخالفات...</p>';
            violationsPlaceholder.style.display = 'block';
    
            const violationsQuery = db.collection("violations").orderBy("createdAt", "desc");
            const snapshot = await violationsQuery.get();
    
            if (snapshot.empty) {
                violationsPlaceholder.innerHTML = '<p style="text-align: center;">لا توجد مخالفات مسجلة.</p>';
                return;
            }
    
            violationsPlaceholder.style.display = 'none';
    
            for (const doc of snapshot.docs) {
                renderViolation(doc.data());
            }
    
        } catch (error) {
            console.error("Error loading violations:", error.message);
            violationsPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل جلب المخالفات. الخطأ: ${error.message}</p>`;
        }
    }
    
    function renderViolation(v) {
        if (!violationsContainer) return;
        
        const card = document.createElement("div");
        card.className = "violation-card";
    
        const createdAt = v.createdAt ? v.createdAt.toDate().toLocaleString('ar-EG', { numberingSystem: 'latn' }) : 'غير متوفر';
    
        card.innerHTML = `
          <div class="info-row"><strong>👤 المستخدم:</strong> <span class="uid-row">${v.userUid}</span></div>
          <div class="info-row"><strong>💬 المحادثة:</strong> <a href="chat.html?id=${v.chatId}" target="_blank" class="table-link">${v.chatId}</a></div>
          <div class="info-row"><strong>⚠️ النوع:</strong> ${v.type || 'غير محدد'}</div>
          <div class="info-row"><strong>📅 التاريخ:</strong> ${createdAt}</div>
          <div class="info-row"><strong>📄 المحتوى:</strong></div>
          <div class="content">${v.content}</div>
        `;
    
        violationsContainer.appendChild(card);
    }

    function listenForAdminNotifications() {
        const notifRef = db.collection("admin").doc("notifications");
        const chatBadge = document.getElementById("chat-badge");
        const violationBadge = document.getElementById("violation-badge");

        if (!notifRef) return;

        notifRef.onSnapshot(doc => {
            const data = doc.data() || {};

            // Chat notifications
            if (chatBadge) {
                const chatCount = data.chatUnread || 0;
                if (chatCount > 0) {
                    chatBadge.textContent = chatCount;
                    chatBadge.style.display = "inline-block";
                } else {
                    chatBadge.style.display = "none";
                }
            }

            // Violation notifications
            if (violationBadge) {
                const violationCount = data.unreadViolations || 0;
                 if (violationCount > 0) {
                    violationBadge.textContent = violationCount;
                    violationBadge.style.display = "inline-block";
                } else {
                    violationBadge.style.display = "none";
                }
            }

        }, err => {
            console.error("Error listening to admin notifications:", err);
            if (chatBadge) chatBadge.style.display = "none";
            if (violationBadge) violationBadge.style.display = "none";
        });
    }


    auth.onAuthStateChanged(user => {
        if (user && user.uid === ADMIN_UID) {
            showDashboard();
            user.getIdToken(true).then(() => {
                fetchAndDisplayUsers();
                fetchAndDisplayAds();
                initializePaymentsView();
                loadViolations();
                listenForAdminNotifications();
            });
        } else {
            showLogin();
            if (user) {
                auth.signOut();
            }
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = loginForm['admin-email'].value;
            const password = loginForm['admin-password'].value;

            auth.signInWithEmailAndPassword(email, password)
                .catch(error => {
                    console.error("Admin Login Error:", error.message);
                    errorMessageDiv.textContent = 'فشل تسجيل الدخول. يرجى التحقق من البيانات.';
                });
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }
});
