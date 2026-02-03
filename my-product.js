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

    // --- DOM Elements ---
    const loadingEl = document.getElementById('product-loading');
    const pageContainer = document.getElementById('product-page-container');
    
    // View containers
    const listView = document.getElementById('product-list-view');
    const detailView = document.getElementById('product-detail-view');
    const formView = document.getElementById('product-form-view');
    
    // List view elements
    const productsGrid = document.getElementById('products-grid');
    const productsListPlaceholder = document.getElementById('products-list-placeholder');
    const addNewProductBtn = document.getElementById('add-new-product-btn');

    // Detail view elements
    const nameView = document.getElementById('product-name-view');
    const detailsView = document.getElementById('product-details-view');
    const mainImageView = document.getElementById('main-image-container');
    const thumbnailContainer = document.getElementById('thumbnail-container');
    const customFieldsView = document.getElementById('product-custom-fields-view');
    const colorsView = document.getElementById('product-colors-view');
    const sizesView = document.getElementById('product-sizes-view');
    const quantityView = document.getElementById('product-quantity-view');
    const editProductBtn = document.getElementById('edit-product-btn');
    const backToListBtnDetail = document.getElementById('back-to-list-btn-detail');

    // Form view elements
    const productForm = document.getElementById('product-edit-form');
    const productFormTitle = document.getElementById('product-form-title');
    const nameInput = document.getElementById('productName');
    const detailsInput = document.getElementById('productDetails');
    const imagesInput = document.getElementById('productImages');
    const imagesEditContainer = document.getElementById('product-images-edit');
    const colorsInput = document.getElementById('productColors');
    const sizesInput = document.getElementById('productSizes');
    const quantityInput = document.getElementById('productQuantity');
    const customFieldsEditContainer = document.getElementById('custom-fields-edit-container');
    const addCustomFieldBtn = document.getElementById('add-custom-field-btn');
    const saveBtn = document.getElementById('save-product-btn');
    const errorEl = document.getElementById('product-error-message');
    const backToListBtnForm = document.getElementById('back-to-list-btn-form');
    let currentEditingProductId = null;

    // Image viewer elements
    const imageViewerModal = document.getElementById('image-viewer-modal');
    const modalImageContent = document.getElementById('modal-image-content');
    const modalDownloadBtn = document.getElementById('modal-download-btn');
    const closeImageViewerBtn = document.querySelector('.image-viewer-close');
    const prevBtn = document.querySelector('.image-viewer-nav.prev');
    const nextBtn = document.querySelector('.image-viewer-nav.next');
    let detailViewImages = [];
    let currentImageIndex = 0;


    // --- State and Auth ---
    const urlParams = new URLSearchParams(window.location.search);
    const merchantUid = urlParams.get('merchantUid');

    if (!merchantUid) {
        loadingEl.innerHTML = '<p class="error-message" style="text-align: center;">معرّف التاجر غير موجود.</p>';
        return;
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            const isOwner = user.uid === merchantUid;
            initializePage(isOwner);
        } else {
            // Not logged in, but we can still show the products in read-only mode.
            initializePage(false);
        }
    });
    
    function initializePage(isOwner) {
        showListView(isOwner);

        if (isOwner) {
            addNewProductBtn.style.display = 'block';
            addNewProductBtn.addEventListener('click', () => showFormView(null));
        }

        backToListBtnDetail.addEventListener('click', () => showListView(isOwner));
        backToListBtnForm.addEventListener('click', () => showListView(isOwner));
        productForm.addEventListener('submit', (e) => handleFormSubmit(e, isOwner));
        
        addCustomFieldBtn.addEventListener('click', () => renderCustomFieldInput());
        customFieldsEditContainer.addEventListener('click', e => {
            if (e.target.classList.contains('remove-custom-field-btn')) {
                e.target.closest('.custom-field-edit-item').remove();
            }
        });
    }

    // --- View Management ---
    function showView(viewToShow) {
        loadingEl.style.display = 'none';
        [listView, detailView, formView].forEach(view => {
            view.style.display = view === viewToShow ? 'block' : 'none';
        });
    }

    async function showListView(isOwner) {
        showView(listView);
        productsListPlaceholder.style.display = 'block';
        productsListPlaceholder.innerHTML = '<p style="text-align: center; color: var(--muted-foreground);">جاري تحميل السلع...</p>';
        productsGrid.innerHTML = '';
        
        try {
            const productsRef = db.collection('users').doc(merchantUid).collection('products').orderBy('createdAt', 'desc');
            const snapshot = await productsRef.get();

            if (snapshot.empty) {
                productsListPlaceholder.innerHTML = `<p style="text-align: center; color: var(--muted-foreground); margin-top: 2rem;">${isOwner ? 'لم تقم بإضافة أي سلع بعد. اضغط على "إضافة سلعة جديدة" للبدء.' : 'لم يقم هذا التاجر بإضافة أي سلع بعد.'}</p>`;
                return;
            }

            productsListPlaceholder.style.display = 'none';
            snapshot.docs.forEach((doc) => {
                const product = { id: doc.id, ...doc.data() };
                const card = document.createElement('div');
                card.className = 'product-card-store';
                
                const firstImage = product.images && product.images.length > 0 ? product.images[0] : 'https://picsum.photos/seed/product/400/400';

                card.innerHTML = `
                    <div class="product-card-image-container">
                        <img src="${firstImage}" alt="${product.name}" class="product-card-image">
                    </div>
                    <div class="product-card-body">
                        <h3 class="product-card-name">${product.name || 'سلعة بدون اسم'}</h3>
                        <p class="product-card-stock">الكمية: ${product.quantity || 0}</p>
                    </div>
                    <div class="product-card-footer" id="product-actions-${product.id}">
                        <button class="product-action-btn details-btn" data-id="${product.id}">التفاصيل</button>
                    </div>
                `;

                if (isOwner) {
                    const actionsContainer = card.querySelector(`#product-actions-${product.id}`);
                    actionsContainer.innerHTML += `
                        <button class="product-action-btn edit-btn" data-id="${product.id}">تعديل</button>
                        <button class="product-action-btn delete-btn" data-id="${product.id}">حذف</button>
                    `;
                }
                productsGrid.appendChild(card);
            });

            // Add event listeners after rendering all cards
            productsGrid.querySelectorAll('.details-btn').forEach(btn => btn.addEventListener('click', (e) => showDetailView(e.target.dataset.id, isOwner)));
            if (isOwner) {
                productsGrid.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (e) => showFormView(e.target.dataset.id)));
                productsGrid.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteProduct(e.target.dataset.id, isOwner)));
            }

        } catch (error) {
            console.error("Error loading products:", error);
            productsListPlaceholder.innerHTML = `<p class="error-message" style="text-align: center;">فشل تحميل قائمة السلع.</p>`;
        }
    }
    
    async function showDetailView(productId, isOwner) {
        showView(detailView);
        
        try {
            const productRef = db.doc(`users/${merchantUid}/products/${productId}`);
            const doc = await productRef.get();

            if (!doc.exists) throw new Error("Product not found.");

            const product = doc.data();
            nameView.textContent = product.name || 'سلعة غير مسماة';
            detailsView.textContent = product.description || 'لا توجد تفاصيل متاحة.';
            colorsView.textContent = product.colors || '-';
            sizesView.textContent = product.sizes || '-';
            quantityView.textContent = product.quantity?.toString() || '0';

            mainImageView.innerHTML = '';
            thumbnailContainer.innerHTML = '';
            detailViewImages = product.images || [];

            if (detailViewImages.length > 0) {
                const mainImg = document.createElement('img');
                mainImg.src = detailViewImages[0];
                mainImg.alt = product.name;
                mainImg.className = 'main-product-image';
                mainImg.addEventListener('click', () => openImageViewer(0));
                mainImageView.appendChild(mainImg);

                detailViewImages.forEach((url, index) => {
                    const thumb = document.createElement('img');
                    thumb.src = url;
                    thumb.alt = `Thumbnail ${index + 1}`;
                    thumb.className = 'thumbnail-image';
                    thumb.dataset.index = index;
                    if (index === 0) thumb.classList.add('active');
                    
                    thumb.addEventListener('click', () => {
                        mainImg.src = url;
                        mainImg.onclick = () => openImageViewer(index);
                        thumbnailContainer.querySelectorAll('.thumbnail-image').forEach(t => t.classList.remove('active'));
                        thumb.classList.add('active');
                    });
                    thumbnailContainer.appendChild(thumb);
                });
            } else {
                 mainImageView.innerHTML = `<img src="https://picsum.photos/seed/product-detail/600/600" alt="Placeholder" class="main-product-image">`;
            }
            
            customFieldsView.innerHTML = '';
            if (product.customFields && product.customFields.length > 0) {
                 const title = document.createElement('h2');
                 title.className = 'info-section-title';
                 title.textContent = 'تفاصيل إضافية';
                 customFieldsView.appendChild(title);

                product.customFields.forEach(field => {
                    if (field.title && field.value) { // Ensure both title and value exist
                        const fieldEl = document.createElement('div');
                        fieldEl.className = 'custom-field-item';
                        fieldEl.innerHTML = `
                            <span class="title">${field.title}</span>
                            <strong class="value">${field.value}</strong>
                        `;
                        customFieldsView.appendChild(fieldEl);
                    }
                });
            }


            if (isOwner) {
                editProductBtn.style.display = 'block';
                editProductBtn.onclick = () => showFormView(productId);
            } else {
                editProductBtn.style.display = 'none';
            }

        } catch (error) {
            console.error("Error fetching product details:", error);
            showView(listView);
            alert("فشل في جلب تفاصيل السلعة.");
        }
    }
    
    function renderCustomFieldInput(field = { title: '', value: '' }) {
        const container = document.getElementById('custom-fields-edit-container');
        if (!container) return; // safety check
        const newField = document.createElement('div');
        newField.className = 'custom-field-edit-item';
        newField.innerHTML = `
            <div class="custom-field-inputs">
                <input type="text" class="custom-field-title" placeholder="العنوان (مثال: المادة)" value="${field.title || ''}">
                <input type="text" class="custom-field-value" placeholder="القيمة (مثال: قطن)" value="${field.value || ''}">
            </div>
            <button type="button" class="remove-custom-field-btn" title="حذف التفصيل">×</button>
        `;
        container.appendChild(newField);
    }

    async function showFormView(productId) {
        const user = auth.currentUser;
        if (!user || user.uid !== merchantUid) {
            alert("ليس لديك الصلاحية لإجراء هذا التعديل.");
            return;
        }

        currentEditingProductId = productId;
        productForm.reset();
        imagesEditContainer.innerHTML = '';
        customFieldsEditContainer.innerHTML = '';
        errorEl.textContent = '';
        showView(formView);

        if (productId) { // Edit mode
            productFormTitle.textContent = 'تعديل السلعة';
            saveBtn.textContent = 'حفظ التعديلات';
            
            try {
                const productRef = db.doc(`users/${merchantUid}/products/${productId}`);
                const doc = await productRef.get();
                if (!doc.exists) throw new Error("Product not found to edit.");
                
                const product = doc.data();
                nameInput.value = product.name || '';
                detailsInput.value = product.description || '';
                colorsInput.value = product.colors || '';
                sizesInput.value = product.sizes || '';
                quantityInput.value = product.quantity || '';

                (product.images || []).forEach(url => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-edit-wrapper';
                    wrapper.innerHTML = `
                        <img src="${url}" class="product-image-item">
                        <button type="button" class="delete-image-btn" data-url="${url}">✕</button>
                    `;
                    imagesEditContainer.appendChild(wrapper);
                });
                
                (product.customFields || []).forEach(field => renderCustomFieldInput(field));

            } catch (error) {
                console.error("Error populating form for edit:", error);
                showListView(true);
                alert("فشل في تحميل بيانات السلعة للتعديل.");
            }

        } else { // Add mode
            productFormTitle.textContent = 'إضافة سلعة جديدة';
            saveBtn.textContent = 'إضافة السلعة';
        }
    }
    
    // --- Data Handling ---
    async function handleFormSubmit(e, isOwner) {
        e.preventDefault();
        if (!isOwner) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';
        errorEl.textContent = '';

        try {
            const existingImages = Array.from(imagesEditContainer.querySelectorAll('.delete-image-btn')).map(btn => btn.dataset.url);
            
            const newFiles = imagesInput.files;
            const uploadedUrls = [];
            saveBtn.textContent = 'جاري رفع الصور...';
            for (const file of newFiles) {
                const imageUrl = await uploadToCloudinary(file, `products/${merchantUid}`);
                uploadedUrls.push(imageUrl);
            }
            const finalImages = [...existingImages, ...uploadedUrls];
            
            const customFieldsNodes = document.querySelectorAll('#custom-fields-edit-container .custom-field-edit-item');
            const customFields = Array.from(customFieldsNodes).map(node => {
                const titleInput = node.querySelector('.custom-field-title');
                const valueInput = node.querySelector('.custom-field-value');
                const title = titleInput ? titleInput.value.trim() : '';
                const value = valueInput ? valueInput.value.trim() : '';
                return { title, value };
            }).filter(field => field.title && field.value);
            
            const productData = {
                name: nameInput.value,
                description: detailsInput.value,
                colors: colorsInput.value,
                sizes: sizesInput.value,
                quantity: Number(quantityInput.value) || 0,
                images: finalImages,
                customFields: customFields,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (currentEditingProductId) { // Update
                const productRef = db.doc(`users/${merchantUid}/products/${currentEditingProductId}`);
                await productRef.update(productData);
            } else { // Create
                productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const productsRef = db.collection('users').doc(merchantUid).collection('products');
                await productsRef.add(productData);
            }
            
            showListView(isOwner);

        } catch (error) {
            console.error("Error saving product:", error);
            errorEl.textContent = 'فشل حفظ البيانات. ' + error.message;
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'حفظ';
        }
    }
    
    async function deleteProduct(productId, isOwner) {
        if (!isOwner || !confirm('هل أنت متأكد من حذف هذه السلعة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        
        try {
            // TODO: Delete images from Cloudinary if needed (requires backend function)
            await db.doc(`users/${merchantUid}/products/${productId}`).delete();
            alert('تم حذف السلعة بنجاح.');
            showListView(isOwner);
        } catch (error) {
            console.error("Error deleting product:", error);
            alert('فشل حذف السلعة.');
        }
    }

    // --- Event Listeners ---
    imagesEditContainer.addEventListener('click', e => {
        if (e.target.classList.contains('delete-image-btn')) {
            e.target.closest('.image-edit-wrapper').remove();
        }
    });

    mainImageView.addEventListener('click', (e) => {
        if (e.target.classList.contains('main-product-image')) {
            const activeThumbnail = document.querySelector('.thumbnail-image.active');
            const clickedIndex = activeThumbnail ? parseInt(activeThumbnail.dataset.index, 10) : 0;
            if (!isNaN(clickedIndex)) openImageViewer(clickedIndex);
        }
    });
    
    // --- Image Viewer Logic ---
    let touchStartX = 0; // For swipe

    function openImageViewer(index) {
        if (!detailViewImages || index < 0 || index >= detailViewImages.length) return;

        const isAlreadyOpen = !imageViewerModal.classList.contains('hidden');

        const updateImage = () => {
            currentImageIndex = index;
            const imageUrl = detailViewImages[currentImageIndex];
            modalImageContent.src = imageUrl;
            modalDownloadBtn.href = imageUrl;
            prevBtn.style.display = currentImageIndex > 0 ? 'block' : 'none';
            nextBtn.style.display = currentImageIndex < detailViewImages.length - 1 ? 'block' : 'none';
            modalImageContent.style.opacity = '1';
        };

        if (isAlreadyOpen) {
            modalImageContent.style.opacity = '0';
            setTimeout(updateImage, 200); // Duration should match CSS transition
        } else {
            updateImage();
            imageViewerModal.classList.remove('hidden');
        }
    }

    function closeImageViewer() { imageViewerModal.classList.add('hidden'); }
    function showNextImage() { openImageViewer(currentImageIndex + 1); }
    function showPrevImage() { openImageViewer(currentImageIndex - 1); }
    
    function handleSwipeGesture(touchEndX) {
        const swipeThreshold = 50; // Minimum distance for a swipe
        if (touchStartX - touchEndX > swipeThreshold) { // Swipe left
            showNextImage();
        } else if (touchEndX - touchStartX > swipeThreshold) { // Swipe right
            showPrevImage();
        }
    }

    closeImageViewerBtn.addEventListener('click', closeImageViewer);
    nextBtn.addEventListener('click', showNextImage);
    prevBtn.addEventListener('click', showPrevImage);
    imageViewerModal.addEventListener('click', (e) => { if (e.target === imageViewerModal) closeImageViewer(); });
    document.addEventListener('keydown', (e) => {
        if (!imageViewerModal.classList.contains('hidden')) {
            if (e.key === 'ArrowRight') showNextImage();
            else if (e.key === 'ArrowLeft') showPrevImage();
            else if (e.key === 'Escape') closeImageViewer();
        }
    });

    // Add swipe listeners
    imageViewerModal.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    imageViewerModal.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        handleSwipeGesture(touchEndX);
    });
});
