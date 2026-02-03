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
    const requestsContainer = document.getElementById('requests-container');

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

    async function loadRequests() {
        if (!requestsContainer) return;
        const currentUser = auth.currentUser;

        if (!currentUser) {
            requestsContainer.innerHTML = '<p style="text-align: center;">يرجى تسجيل الدخول لرؤية الطلبات.</p>';
            return;
        }

        try {
            requestsContainer.innerHTML = ''; 
            const adsSnapshot = await db.collection('ads').where('ownerUid', '==', currentUser.uid).get();

            if (adsSnapshot.empty) {
                requestsContainer.innerHTML = '<p style="text-align: center; color: var(--muted-foreground);">لا توجد لديك إعلانات حالياً.</p>';
                return;
            }

            let allRequests = [];
            for (const adDoc of adsSnapshot.docs) {
                const requestsSnap = await adDoc.ref.collection('requests').orderBy('createdAt', 'desc').get();
                requestsSnap.forEach(requestDoc => {
                    allRequests.push({ 
                        adId: adDoc.id, 
                        requestId: requestDoc.id, 
                        ...requestDoc.data() 
                    });
                });
            }

            if (allRequests.length === 0) {
                requestsContainer.innerHTML = '<p style="text-align: center; color: var(--muted-foreground);">لا توجد طلبات تعامل على إعلاناتك حالياً.</p>';
                return;
            }

            allRequests.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

            allRequests.forEach(requestData => {
                const requestElement = renderRequestCard(requestData.adId, requestData.requestId, requestData);
                requestsContainer.appendChild(requestElement);
            });

        } catch (error) {
            console.error("Error loading requests:", error);
            requestsContainer.innerHTML = '<p style="text-align: center; color: var(--error);">حدث خطأ أثناء تحميل الطلبات.</p>';
        }
    }

    function renderRequestCard(adId, requestId, requestData) {
        const requestElement = document.createElement('div');
        requestElement.classList.add('request-card');
        
        let statusText = '⏳ قيد المراجعة';
        if (requestData.status === 'accepted') statusText = '✅ مقبول';
        if (requestData.status === 'rejected') statusText = '❌ مرفوض';
        
        const buttonsHTML = requestData.status === 'pending' ? `
            <div class="actions">
                <button class="accept-btn" data-ad-id="${adId}" data-request-id="${requestId}">أقبل</button>
                <button class="reject-btn" data-ad-id="${adId}" data-request-id="${requestId}">أرفض</button>
            </div>
        ` : '';

        requestElement.innerHTML = `
            <h3>${requestData.adTitle}</h3>
            <p>المستخدم: <strong>${requestData.requesterName}</strong></p>
            <p>الحالة: ${statusText}</p>
            ${buttonsHTML}
        `;
        return requestElement;
    }

    async function handleRequestDecision(adId, requestId, decision) {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert('يجب عليك تسجيل الدخول أولاً.');
            return;
        }
    
        try {
            // 🔹 Get request data to find the requester's ID
            const requestRef = db.collection('ads').doc(adId).collection('requests').doc(requestId);
            const requestSnap = await requestRef.get();
            if (!requestSnap.exists) throw new Error("Request not found");
            const requestData = requestSnap.data();
            const merchantId = requestData.merchantId; // The ID of the user who made the request
    
            // 🔹 Update the request status
            await requestRef.update({
                status: decision,
                decisionAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    
            // 🔹 Get ad and owner info for the notification message
            const adSnap = await db.collection('ads').doc(adId).get();
            if (!adSnap.exists) throw new Error("Ad not found during decision handling.");
            const adData = adSnap.data();
            const ownerProfile = await getPublicProfile(currentUser.uid); // This is the advertiser
            const ownerName = ownerProfile ? ownerProfile.username : 'المعلن';
    
            // 🔹 Send a customized message to the requester's inbox
            if (decision === 'accepted') {
    
                // Check the advertiser's role to determine the scenario
                if (ownerProfile && ownerProfile.role === 'trader') {
                    // SCENARIO 2: Trader (advertiser) accepts Marketer's (requester) request.
                    // The notification to the Marketer should NOT have a payment link.
                    await db.collection('users').doc(merchantId).collection('inbox').add({
                        type: 'deal_response',
                        category: 'requests',
                        title: `تم قبول طلبك من قبل التاجر ${ownerName} ✅`,
                        message: `تهانينا، وافق التاجر ${ownerName} على طلبك للتعامل على إعلان "${adData.title}". سيقوم التاجر الآن بتأكيد الصفقة عبر الدفع.`,
                        fromUserId: currentUser.uid,
                        toUserId: merchantId,
                        adId: adId,
                        read: false,
                        status: 'accepted',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
    
                } else {
                    // SCENARIO 1: Marketer (advertiser) accepts Trader's (requester) request.
                    // The notification to the Trader should HAVE the payment link.
                    await db.collection('users').doc(merchantId).collection('inbox').add({
                        type: 'deal_response',
                        category: 'requests',
                        title: `تم قبول طلبك من قبل ${ownerName} ✅`,
                        message: `تهانينا، وافق ${ownerName} على طلبك للتعامل على إعلان "${adData.title}". الخطوة التالية هي تأكيد الصفقة عبر الدفع.`,
                        actionLabel: 'الانتقال إلى صفحة الدفع',
                        actionUrl: `payment.html?id=${adId}`, // Payment link is here for scenario 1
                        fromUserId: currentUser.uid,
                        toUserId: merchantId,
                        adId: adId,
                        read: false,
                        status: 'accepted',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
    
            } else { // decision === 'rejected'
                await db.collection('users').doc(merchantId).collection('inbox').add({
                    type: 'deal_response',
                    category: 'requests',
                    title: `تم رفض طلبك للتعامل على إعلان: "${adData.title}" ❌`,
                    message: 'نأسف، تم رفض طلبك للتعامل على هذا الإعلان حاليًا.',
                    fromUserId: currentUser.uid,
                    toUserId: merchantId,
                    adId: adId,
                    read: false,
                    status: 'rejected',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
    
            // 🔹 Reload the requests on the UI
            loadRequests();
    
            alert(`تم ${decision === 'accepted' ? 'قبول' : 'رفض'} الطلب بنجاح وتم إرسال رسالة إلى الطالب.`);
    
        } catch (error) {
            console.error("Error updating request:", error);
            alert('حدث خطأ أثناء تحديث الطلب.');
        }
    }


    if (requestsContainer) {
        requestsContainer.addEventListener('click', (e) => {
            const target = e.target;
            const isAccept = target.classList.contains('accept-btn');
            const isReject = target.classList.contains('reject-btn');

            if (isAccept || isReject) {
                e.preventDefault();
                const { adId, requestId } = target.dataset;
                const decision = isAccept ? 'accepted' : 'rejected';
                
                target.closest('.actions').innerHTML = `<p style="font-size:0.9rem; color: var(--muted-foreground);">جاري المعالجة...</p>`;
                handleRequestDecision(adId, requestId, decision);
            }
        });
    }


    auth.onAuthStateChanged(user => {
        if (user) {
            loadRequests();
        } else {
             if(requestsContainer) requestsContainer.innerHTML = '<p style="text-align: center;">يرجى تسجيل الدخول لرؤية الطلبات.</p>';
             setTimeout(() => window.location.href = 'login.html?redirect=requests.html', 2000);
        }
    });
});
