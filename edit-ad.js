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
    
    // --- Profile Helper ---
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
    
    // --- DOM Elements ---
    const loadingDiv = document.getElementById('edit-ad-loading');
    const form = document.getElementById('edit-ad-form');
    const errorMessageDiv = document.getElementById('error-message');
    const submitBtn = document.getElementById('submit-btn');

    // Ad fields
    const titleInput = document.getElementById('title');
    const descriptionInput = document.getElementById('description');
    const descriptionLabel = document.getElementById('description-label');
    const pricePerSaleInput = document.getElementById('pricePerSale');
    const maxSalesInput = document.getElementById('maxSales');
    const priceInput = document.getElementById('price');
    const goalDaysInput = document.getElementById('goalDays');
    
    // Trader fields
    const traderFields = document.getElementById('trader-fields');
    const productNameInput = document.getElementById('productName');
    const productDescriptionInput = document.getElementById('productDescription');
    const productPriceInput = document.getElementById('productPrice');
    const imagesEditContainer = document.getElementById('product-images-edit');
    const productImagesInput = document.getElementById('productImages');
    const productColorsInput = document.getElementById('productColors');
    const productSizesInput = document.getElementById('productSizes');

    // --- Page Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    const adId = urlParams.get('id');

    if (!adId) {
        if(loadingDiv) loadingDiv.style.display = 'none';
        if(errorMessageDiv) errorMessageDiv.textContent = "معرّف الإعلان غير موجود.";
        if(form) form.style.display = 'none';
        return;
    }

    const adRef = db.collection("ads").doc(adId);

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = `login.html?redirect=edit-ad.html?id=${adId}`;
            return;
        }

        try {
            const [adSnap, publicProfile] = await Promise.all([
                adRef.get(),
                getPublicProfile(user.uid)
            ]);

            if (!adSnap.exists) {
                throw new Error("هذا الإعلان لم يعد موجودًا.");
            }
            if (!publicProfile) {
                throw new Error("لم يتم العثور على ملفك الشخصي.");
            }

            const adData = adSnap.data();
            
            if (adData.ownerUid !== user.uid) {
                throw new Error("ليس لديك صلاحية لتعديل هذا الإعلان.");
            }
            
            // Populate form
            titleInput.value = adData.title || '';
            descriptionInput.value = adData.description || '';
            pricePerSaleInput.value = adData.pricePerSale || '';
            maxSalesInput.value = adData.maxSales || '';
            priceInput.value = adData.price || '';
            goalDaysInput.value = adData.goalDays || '';
            
            priceInput.readOnly = true;
            const calculateTotalPrice = () => {
                const pricePerSale = parseFloat(pricePerSaleInput.value) || 0;
                const maxSales = parseInt(maxSalesInput.value, 10) || 0;
                if(priceInput) priceInput.value = pricePerSale * maxSales;
            };
            pricePerSaleInput.addEventListener('input', calculateTotalPrice);
            maxSalesInput.addEventListener('input', calculateTotalPrice);

            if (publicProfile.role === 'trader') {
                traderFields.style.display = 'block';
                descriptionLabel.textContent = 'مواصفات المسوق المطلوب';
                descriptionInput.placeholder = 'اشرح ماتريده بالتفصيل من المسوق .';

                productNameInput.value = adData.productName || '';
                productDescriptionInput.value = adData.productDescription || '';
                productPriceInput.value = adData.productPrice || '';
                productColorsInput.value = adData.productColors || '';
                productSizesInput.value = adData.productSizes || '';

                imagesEditContainer.innerHTML = '';
                (adData.productImages || []).forEach(url => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-edit-wrapper';
                    wrapper.innerHTML = `
                        <img src="${url}" class="product-image-item">
                        <button type="button" class="delete-image-btn" data-url="${url}">✕</button>
                    `;
                    imagesEditContainer.appendChild(wrapper);
                });
            } else { // Marketer
                traderFields.style.display = 'none';
                descriptionLabel.textContent = 'وصف الخدمة (عرف بما يمكنك تقديمه كمسوق)';
                descriptionInput.placeholder = 'اكتب وصفًا تفصيليًا حتى يعجب بإعلانك التاجر...';
            }

            loadingDiv.style.display = 'none';
            form.style.display = 'flex';

        } catch (error) {
            console.error("Error fetching ad for edit:", error);
            if(loadingDiv) loadingDiv.style.display = 'none';
            if(errorMessageDiv) errorMessageDiv.textContent = error.message;
            if(form) form.style.display = 'none';
        }
    });

    imagesEditContainer.addEventListener('click', e => {
        if (e.target.classList.contains('delete-image-btn')) {
            e.target.closest('.image-edit-wrapper').remove();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageDiv.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الحفظ...';

        try {
            const user = auth.currentUser;
            const publicProfile = await getPublicProfile(user.uid);
            if (!publicProfile) throw new Error("Could not verify user profile.");
            
            const adUpdateData = {
                title: titleInput.value,
                description: descriptionInput.value,
                pricePerSale: parseFloat(pricePerSaleInput.value) || 0,
                maxSales: parseInt(maxSalesInput.value, 10) || 0,
                price: parseFloat(priceInput.value) || 0,
                goalDays: parseInt(goalDaysInput.value, 10) || 0,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (publicProfile.role === 'trader') {
                submitBtn.textContent = 'جاري معالجة الصور...';
                const existingImages = Array.from(imagesEditContainer.querySelectorAll('.delete-image-btn')).map(btn => btn.dataset.url);
                const newFiles = productImagesInput.files;
                const uploadedUrls = [];
                for (const file of newFiles) {
                    const imageUrl = await uploadToCloudinary(file, `products/${user.uid}`);
                    uploadedUrls.push(imageUrl);
                }
                const finalImages = [...existingImages, ...uploadedUrls];

                // Add product details to the ad document
                adUpdateData.productName = productNameInput.value;
                adUpdateData.productDescription = productDescriptionInput.value;
                adUpdateData.productPrice = parseFloat(productPriceInput.value) || 0;
                adUpdateData.productImages = finalImages;
                adUpdateData.productColors = productColorsInput.value;
                adUpdateData.productSizes = productSizesInput.value;
            }
            
            submitBtn.textContent = 'جاري حفظ التعديلات...';
            await adRef.update(adUpdateData);

            alert('تم حفظ التعديلات بنجاح!');
            window.location.href = `ad-details.html?id=${adId}`;

        } catch (error) {
            console.error("Error updating ad:", error);
            errorMessageDiv.textContent = "فشل تحديث الإعلان. " + error.message;
            submitBtn.disabled = false;
            submitBtn.textContent = 'حفظ التعديلات';
        }
    });
});
