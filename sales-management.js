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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const ADMIN_UID = "WEOFvjCGEwTQ52YJAuIcmOk3ZDB2";

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

    // Page elements
    const pageContent = document.getElementById('page-content');
    const loadingEl = document.getElementById('loading-placeholder');
    const errorEl = document.getElementById('error-placeholder');
    const formSection = document.getElementById('form-section');
    const addSaleForm = document.getElementById('add-sale-form');
    const errorMessageDiv = document.getElementById('error-message');
    const submitBtn = document.getElementById('submit-sale-btn');
    const salesTbody = document.getElementById('sales-tbody');
    const salesPlaceholder = document.getElementById('sales-placeholder');
    const backToTransactionLink = document.getElementById('back-to-transaction');

    let allSales = []; // To hold the current list of sales for client-side validation

    // Get transaction ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('id');

    function showError(message) {
        if(loadingEl) loadingEl.style.display = 'none';
        if(pageContent) pageContent.style.display = 'none';
        if(errorEl) {
            errorEl.style.display = 'block';
            const p = errorEl.querySelector('p');
            if(p) p.textContent = message;
        }
    }

    if (!transactionId) {
        showError("معرّف المعاملة غير موجود في الرابط.");
        return;
    }
    if (backToTransactionLink) {
        backToTransactionLink.href = `transaction.html?id=${transactionId}`;
    }

    async function getPublicProfile(uid) {
        if (!uid) return null;
        const publicRef = db.doc(`users/${uid}/public/profile`);
        const doc = await publicRef.get();
        return doc.exists ? doc.data() : null;
    }
    
    function renderSales(sales) {
        if (!salesTbody || !salesPlaceholder) return;
        
        if (sales.length === 0) {
            salesTbody.innerHTML = '';
            salesPlaceholder.style.display = 'block';
            salesPlaceholder.querySelector('p').textContent = 'لم يتم تسجيل أي مبيعات بعد.';
            return;
        }

        salesPlaceholder.style.display = 'none';
        salesTbody.innerHTML = '';

        sales.forEach(sale => {
            const statusText = 'مسجلة'; // Simplified status for now

            const trackingNumberContent = sale.trackingLink 
                ? `<a href="${sale.trackingLink}" target="_blank" class="table-link">${sale.trackingNumber}</a>`
                : sale.trackingNumber;

            const row = salesTbody.insertRow();
            row.innerHTML = `
                <td>${sale.saleNumber || 'N/A'}</td>
                <td><a href="${sale.imageUrl}" target="_blank"><img src="${sale.imageUrl}" alt="إثبات البيع" class="sales-table-image"></a></td>
                <td>${trackingNumberContent}</td>
                <td><span class="status-badge status-pending">${statusText}</span></td>
                <td>${sale.saleDate}</td>
            `;
        });
    }

    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = `login.html?redirect=sales-management.html?id=${transactionId}`;
            return;
        }

        try {
            const transactionRef = db.collection('transactions').doc(transactionId);
            const transactionSnap = await transactionRef.get();

            if (!transactionSnap.exists) {
                showError("المعاملة المطلوبة غير موجودة.");
                return;
            }
            const transactionData = transactionSnap.data();

            // Authorization check
            if (user.uid !== transactionData.adOwnerUid && user.uid !== transactionData.marketerUid && user.uid !== ADMIN_UID) {
                showError("ليس لديك صلاحية لعرض هذه الصفحة.");
                return;
            }

            const currentUserProfile = await getPublicProfile(user.uid);
            const isMarketer = currentUserProfile && currentUserProfile.role === 'marketer';

            if (!isMarketer) {
                // If user is not a marketer (trader or admin), hide the form and show notifications
                if (formSection) {
                    formSection.innerHTML = `
                        <p style="text-align: center; color: var(--muted-foreground);">فقط المسوق يمكنه تسجيل المبيعات في هذه الصفحة.</p>
                        <p style="text-align: center; color: white; font-weight: bold; margin-top: 1rem;">
                            حمل ملف بيانات 
                            <span style="color: yellow; text-decoration: underline;">الزبون</span>
                             و 
                            <span style="color: yellow; text-decoration: underline;">إطبعها</span>
                             و ضعها على سلعتك بعد أن غلفتها جيدا و بإحكام ثم خدها لـ
                            <span style="color: yellow; text-decoration: underline;">شركة التوصيل</span>
                        </p>
                    `;
                }

                const notifBox = document.getElementById("salesNotifications");
                if (notifBox) {
                    const q = db.collection("users").doc(user.uid).collection("sales_notifications").orderBy("createdAt", "desc");

                    q.onSnapshot(snapshot => {
                      notifBox.innerHTML = "";
                      snapshot.forEach(doc => {
                        const n = doc.data();
                        notifBox.innerHTML += `
                          <div class="notification ${!n.read ? "new" : ""}">
                            ${n.message}
                          </div>
                        `;
                      });
                    });
                }

            } else {
                // User is a marketer, enable the form
                if(addSaleForm) {
                    addSaleForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        if (errorMessageDiv) errorMessageDiv.textContent = '';
                        
                        const saleImageFile = document.getElementById('saleImage').files[0];
                        const saleDate = document.getElementById('saleDate').value;
                        const trackingNumber = document.getElementById('trackingNumber').value.trim();
                        const trackingLink = document.getElementById('trackingLink').value.trim();
                
                        if (!saleImageFile || !saleDate || !trackingNumber) {
                            if (errorMessageDiv) errorMessageDiv.textContent = 'يرجى ملء جميع الحقول المطلوبة (الصورة، التاريخ، رقم التتبع).';
                            return;
                        }

                        if (submitBtn) {
                            submitBtn.disabled = true;
                            submitBtn.textContent = 'جاري التحقق...';
                        }

                        try {
                            // Client-side check for duplicate tracking number
                            if (allSales.some(sale => sale.trackingNumber === trackingNumber)) {
                                throw new Error('رقم التتبع هذا مستخدم بالفعل في عملية بيع سابقة.');
                            }

                            // 1. Get trader's UID
                            const transactionDocForUid = await transactionRef.get();
                            if (!transactionDocForUid.exists) {
                                throw new Error("Transaction not found.");
                            }
                            const adOwnerUid = transactionDocForUid.data().adOwnerUid;
                
                            // 2. Upload image to Cloudinary
                            submitBtn.textContent = 'جاري رفع الصورة...';
                            const imageUrl = await uploadToCloudinary(saleImageFile, `sales_proof/${transactionId}`);
                
                            // 3. Add sale record and update transaction counter atomically
                            submitBtn.textContent = 'جاري حفظ البيانات...';
                            await db.runTransaction(async (t) => {
                                const transactionDoc = await t.get(transactionRef);
                                if (!transactionDoc.exists) {
                                    throw "Transaction document does not exist!";
                                }
                        
                                const currentTransactionData = transactionDoc.data();
                                const currentSales = currentTransactionData.currentSales || 0;
                                const newSaleNumber = currentSales + 1;
                        
                                // Create new sale document
                                const newSaleRef = transactionRef.collection('sales').doc();
                                t.set(newSaleRef, {
                                    saleNumber: newSaleNumber,
                                    imageUrl: imageUrl,
                                    saleDate: saleDate,
                                    trackingNumber: trackingNumber,
                                    trackingLink: trackingLink,
                                    recordedBy: user.uid,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                        
                                // Update the transaction document with the new sales count
                                t.update(transactionRef, {
                                    currentSales: newSaleNumber
                                });
                            });

                            // 4. Send notification to the trader
                            await db.collection("users").doc(adOwnerUid).collection("sales_notifications").add({
                                type: "new_sale",
                                message: "قام المسوق بتسجيل عملية بيع جديدة ، قم بطباعة بيانات الزبون و إلصاقها على طرد سلعتك و الاتجاه إلى أقرب شركة توصيل yalidine في منطقتك",
                                transactionId: transactionId,
                                read: false,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            
                            addSaleForm.reset();
                            if(errorMessageDiv) errorMessageDiv.textContent = '';

                        } catch (error) {
                            console.error("Error adding sale: ", error.message);
                            if (errorMessageDiv) {
                                if (error.message.includes('رقم التتبع هذا مستخدم بالفعل')) {
                                    errorMessageDiv.textContent = error.message;
                                }
                                // As per user request, other errors (like permissions) are not displayed
                                // because the main operation (saving the sale) is reported to be successful.
                            }
                        } finally {
                            if(submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.textContent = 'تسجيل البيع';
                            }
                        }
                    });
                }
            }
            
            // Listen for sales subcollection changes
            const salesQuery = transactionRef.collection('sales').orderBy('createdAt', 'desc');
            salesQuery.onSnapshot(querySnapshot => {
                const sales = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                allSales = sales; // Update the client-side list of all sales
                renderSales(sales);
            }, err => {
                console.error("Error fetching sales: ", err);
                if(salesPlaceholder && salesPlaceholder.querySelector('p')) salesPlaceholder.querySelector('p').textContent = 'خطأ في جلب المبيعات.';
            });


            // Show page content after all checks
            if(loadingEl) loadingEl.style.display = 'none';
            if(pageContent) pageContent.style.display = 'block';

        } catch (error) {
            console.error("Error loading page: ", error.message);
            showError("حدث خطأ أثناء تحميل الصفحة.");
        }
    });
});
