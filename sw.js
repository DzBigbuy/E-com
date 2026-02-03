// Service Worker for DzBigbuy PWA

const CACHE_NAME = 'dzbigbuy-cache-v2'; // Updated version
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'admin.html',
  'admin.js',
  'account.html',
  'ad-details.html',
  'chat.html',
  'chat.js',
  'edit-ad.html',
  'edit-ad.js',
  'login.html',
  'manifest.json',
  'marketer-ads.html',
  'my-product.html',
  'my-product.js',
  'my-transactions.html',
  'my-transactions.js',
  'payment.html',
  'payment.js',
  'post-ad.html',
  'register.html',
  'request-pending.html',
  'requests.html',
  'requests.js',
  'sales-management.html',
  'sales-management.js',
  'trader-ads.html',
  'transaction.html'
  // External assets will be cached on the fly
];

// --- INSTALL: Cache the app shell ---
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Install completed');
        self.skipWaiting();
      })
  );
});

// --- ACTIVATE: Clean up old caches ---
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Activation completed');
        return self.clients.claim();
    })
  );
});

// --- FETCH: Serve from network falling back to cache ---
self.addEventListener('fetch', event => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For Firebase, Cloudinary, and other API calls, always go to the network.
  // This prevents caching sensitive or frequently changing data.
  const isApiRequest = event.request.url.includes('firestore.googleapis.com') || 
                       event.request.url.includes('firebaseauth.googleapis.com') ||
                       event.request.url.includes('api.cloudinary.com') ||
                       event.request.url.includes('firebasestorage.googleapis.com');

  if (isApiRequest) {
    // For API calls, use a network-only strategy.
    event.respondWith(fetch(event.request));
    return;
  }

  // For other requests (our app shell, fonts, etc.), use a "Network falling back to cache" strategy.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return fetch(event.request)
        .then(response => {
          // If we get a valid response from the network, cache it and return it.
          // This keeps the cache updated.
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => {
          // If the network fetch fails (e.g., offline), try to get the response from the cache.
          return cache.match(event.request).then(response => {
              // Return the cached response if found, otherwise the browser will handle the error.
              return response;
          });
        });
    })
  );
});

// --- PUSH NOTIFICATION (Existing Code) ---
self.addEventListener('push', event => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }
  const data = event.data.json();
  console.log('Service Worker: Push Received.', data);

  const title = data.title || 'DzBigbuy';
  const options = {
    body: data.body || 'لديك رسالة جديدة!',
    icon: '/images/icon-192.png', // Main icon
    badge: '/images/icon-192.png', // Icon for notification bar on Android
    vibrate: [200, 100, 200], // Vibration pattern
    data: {
      url: data.url || '/' // URL to open on click
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// --- NOTIFICATION CLICK (Existing Code) ---
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked');
  event.notification.close(); // Close the notification

  const urlToOpen = event.notification.data.url || '/';

  // Open the app window or focus if already open
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus().then(c => c.navigate(urlToOpen));
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
