document.addEventListener('DOMContentLoaded', () => {
    // Firebase Config
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

    // DOM Elements
    const paymentProofInput = document.getElementById('paymentProof');
    const paymentSubmitBtn = document.getElementById('payment-submit-btn');
    const paymentErrorMessage = document.getElementById('payment-error-message');
    const paymentAmountEl = document.getElementById('payment-amount');
    const paymentAdTitleEl = document.getElementById('payment-ad-title');

    // Get ad ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const adId = urlParams.get('id');
    const requesterId = urlParams.get('requesterId');

    let currentUserId = null;
    let adData = null; // Store ad data
    let currentUserPublicProfile = null; // Store current user's public profile

    // Helper to get a user's public profile
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

    // Auth state change listener
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUserId = user.uid;
            // Fetch both ad data and the current user's public profile
            try {
                const [ad, profile] = await Promise.all([
                    loadAdData(adId),
                    getPublicProfile(currentUserId)
                ]);

                if (!ad || !profile) {
                    throw new Error('تعذر جلب بيانات الإعلان أو المستخدم. يرجى التأكد من أن لديك ملف شخصي.');
                }
                
                adData = ad;
                currentUserPublicProfile = profile;
                
            } catch (error) {
                 console.error(error);
                 if (paymentErrorMessage) paymentErrorMessage.textContent = error.message;
                 if (paymentSubmitBtn) paymentSubmitBtn.disabled = true;
            }

        } else {
            // Redirect to login if not authenticated
            window.location.href = `login.html?redirect=payment.html?id=${adId}`;
        }
    });

    // Load ad data from Firestore
    async function loadAdData(id) {
        if (!id) {
            if (paymentErrorMessage) paymentErrorMessage.textContent = 'معرّف الإعلان غير موجود.';
            return null;
        }
        try {
            const adDoc = await db.collection('ads').doc(id).get();
            if (adDoc.exists) {
                const data = adDoc.data();
                if (paymentAdTitleEl) paymentAdTitleEl.textContent = data.title || 'إعلان';
                if (paymentAmountEl) paymentAmountEl.textContent = data.price ? `${data.price} دج` : 'غير محدد';
                return data; // Return the full ad data
            } else {
                if (paymentErrorMessage) paymentErrorMessage.textContent = 'الإعلان المطلوب غير موجود.';
                return null;
            }
        } catch (error) {
            console.error('Error fetching ad data:', error);
            if (paymentErrorMessage) paymentErrorMessage.textContent = 'خطأ في جلب بيانات الإعلان.';
            return null;
        }
    }

    // Handle payment submission
    if (paymentSubmitBtn) {
        paymentSubmitBtn.addEventListener('click', async () => {
            if (paymentErrorMessage) paymentErrorMessage.textContent = '';
            const file = paymentProofInput.files[0];

            if (!file) {
                if (paymentErrorMessage) paymentErrorMessage.textContent = 'الرجاء اختيار ملف إثبات الدفع.';
                return;
            }

            if (!adData || !currentUserPublicProfile) {
                if (paymentErrorMessage) paymentErrorMessage.textContent = 'لم يتم تحميل بيانات الإعلان أو المستخدم بشكل كامل. يرجى تحديث الصفحة والمحاولة مرة أخرى.';
                return;
            }

            // Disable button during upload
            paymentSubmitBtn.textContent = 'جاري الرفع...';
            paymentSubmitBtn.disabled = true;

            try {
                // 1. Upload file to Cloudinary
                const proofUrl = await uploadToCloudinary(file, 'payments');

                // 2. Create payment record in Firestore with denormalized data
                const paymentDocData = {
                    userId: currentUserId, // Buyer's UID
                    adId: adId,
                    proofUrl: proofUrl,
                    status: 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    // Denormalized data for admin panel efficiency
                    userName: currentUserPublicProfile.username, // Buyer's username
                    adTitle: adData.title,
                    adPrice: adData.price,
                    adSellerId: adData.ownerUid // Seller's UID from the ad document
                };

                if (requesterId) {
                    paymentDocData.requesterId = requesterId;
                }

                await db.collection('payments').add(paymentDocData);

                alert('تم إرسال إثبات الدفع بنجاح، سيتم مراجعة طلبك من قبل الإدارة.');
                window.location.href = "account.html";

            } catch (error) {
                console.error('Error during payment submission:', error);
                if (paymentErrorMessage) paymentErrorMessage.textContent = 'حدث خطأ أثناء إرسال الطلب. ' + error.message;
            } finally {
                // Re-enable button
                paymentSubmitBtn.textContent = 'تأكيد عملية الدفع';
                paymentSubmitBtn.disabled = false;
            }
        });
    }
});
