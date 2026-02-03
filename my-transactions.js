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

    const tbody = document.querySelector("#transactionsTable tbody");
    const placeholder = document.getElementById('transactions-placeholder');

    auth.onAuthStateChanged(async user => {
        if (!user) {
            // If user is not logged in, show a message instead of redirecting immediately.
            // This prevents the "flicker" if auth state is loading.
            if (tbody) tbody.innerHTML = '';
            if (placeholder) {
                placeholder.innerHTML = `<p style="text-align: center; color: var(--muted-foreground); margin-top: 1rem;">يرجى <a href="login.html?redirect=my-transactions.html" style="color: var(--primary);">تسجيل الدخول</a> لعرض معاملاتك.</p>`;
                placeholder.style.display = 'block';
            }
            return;
        }
        
        // Ensure DOM elements are ready
        if (!tbody || !placeholder) {
            console.error("Table body or placeholder not found.");
            return;
        }

        try {
            // Firestore queries to get transactions where the user is either owner or marketer
            const q1 = db.collection("transactions").where("adOwnerUid", "==", user.uid);
            const q2 = db.collection("transactions").where("marketerUid", "==", user.uid);

            const [snap1, snap2] = await Promise.all([
                q1.get(),
                q2.get()
            ]);

            // Use a Map to combine and deduplicate transactions
            const transactionsMap = new Map();
            snap1.docs.forEach(doc => transactionsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            snap2.docs.forEach(doc => transactionsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            
            const transactions = Array.from(transactionsMap.values());

            if (transactions.length === 0) {
                placeholder.innerHTML = '<p style="text-align: center; color: var(--muted-foreground); margin-top: 1rem;">لا توجد لديك معاملات حاليًا.</p>';
                tbody.innerHTML = '';
                placeholder.style.display = 'block'; // Make sure placeholder is visible
                return;
            }

            placeholder.style.display = 'none';
            tbody.innerHTML = '';

            // Sort transactions by start date, newest first
            transactions.sort((a, b) => (b.transactionNumber || 0) - (a.transactionNumber || 0));

            transactions.forEach((d) => {
                const tr = document.createElement("tr");
                tr.style.cursor = 'pointer';

                // Determine transaction status text
                let statusText;
                switch (d.status) {
                    case 'active':
                        statusText = 'نشطة';
                        break;
                    case 'completed':
                        statusText = 'مكتملة';
                        break;
                    default:
                        statusText = d.status || 'قيد التنفيذ';
                }
                
                // Determine user's role in the transaction
                const userRole = d.adOwnerUid === user.uid ? 'مالك الإعلان' : 'مسوق';
                const transNum = d.transactionNumber; 

                tr.innerHTML = `
                    <td>${transNum || '-'}</td>
                    <td>${d.adTitle || "معاملة بدون عنوان"}</td>
                    <td>${userRole}</td>
                    <td>${statusText}</td>
                    <td>${d.startAt?.toDate().toLocaleDateString('ar-EG') || "-"}</td>
                `;

                tr.onclick = () => {
                    window.location.href = `transaction.html?id=${d.id}&num=${transNum}`;
                };

                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error fetching transactions:", error);
            if (placeholder) {
                placeholder.innerHTML = `<p style="text-align: center; color: var(--error); margin-top: 1rem;">حدث خطأ أثناء جلب المعاملات. يرجى المحاولة مرة أخرى.</p>`;
                placeholder.style.display = 'block';
            }
        }
    });
});
