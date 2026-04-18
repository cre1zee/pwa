// ========================================
// PILLOWY SERVICE WORKER
// Offline Support & Caching
// Version: 1.0.0
// ========================================

const CACHE_NAME = 'pillowy-v1.0.1';
const OFFLINE_URL = '/index.html';

// Danh sách các file cần cache để chạy offline
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-180.png'
];

// ========================================
// INSTALL - Cài đặt và cache lần đầu
// ========================================
self.addEventListener('install', event => {
    console.log('🔧 [SW] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 [SW] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ [SW] Install complete');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ [SW] Cache failed:', err);
            })
    );
});

// ========================================
// ACTIVATE - Kích hoạt và dọn cache cũ
// ========================================
self.addEventListener('activate', event => {
    console.log('🚀 [SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ [SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ [SW] Activated, claiming clients');
                return self.clients.claim();
            })
    );
});

// ========================================
// FETCH - Chiến lược: Cache First, Network Fallback
// ========================================
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Bỏ qua các request không phải GET
    if (request.method !== 'GET') return;
    
    // Bỏ qua Chrome DevTools
    if (url.protocol === 'chrome-extension:') return;
    
    // Bỏ qua các request API bên ngoài (nếu có)
    if (url.origin !== self.location.origin && !url.hostname.includes('github')) {
        // Với external resources, thử network trước
        return;
    }
    
    // Chiến lược: Stale-While-Revalidate cho HTML, Cache First cho assets
    if (request.mode === 'navigate') {
        // Navigation requests (HTML) - Network first, fallback to cache
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cache bản mới nhất
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Offline - trả về bản cache
                    return caches.match(request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Fallback cuối cùng
                            return caches.match(OFFLINE_URL);
                        });
                })
        );
    } else {
        // Assets (CSS, JS, images) - Cache first
        event.respondWith(
            caches.match(request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        // Trả về từ cache, đồng thời update cache trong background
                        fetch(request)
                            .then(networkResponse => {
                                if (networkResponse && networkResponse.status === 200) {
                                    caches.open(CACHE_NAME).then(cache => {
                                        cache.put(request, networkResponse);
                                    });
                                }
                            })
                            .catch(() => {});
                        
                        return cachedResponse;
                    }
                    
                    // Không có trong cache, fetch từ network
                    return fetch(request)
                        .then(networkResponse => {
                            if (!networkResponse || networkResponse.status !== 200) {
                                return networkResponse;
                            }
                            
                            // Cache response
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(request, responseClone);
                            });
                            
                            return networkResponse;
                        })
                        .catch(error => {
                            // Trả về fallback cho images
                            if (request.destination === 'image') {
                                return new Response(
                                    '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="#fbc4d2"/><text x="50" y="65" font-size="40" text-anchor="middle" fill="white">🌸</text></svg>',
                                    { headers: { 'Content-Type': 'image/svg+xml' } }
                                );
                            }
                            
                            console.error('❌ [SW] Fetch failed:', error);
                            throw error;
                        });
                })
        );
    }
});

// ========================================
// MESSAGE - Nhận message từ client
// ========================================
self.addEventListener('message', event => {
    const data = event.data;
    
    if (data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (data === 'clearCache') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            }).then(() => {
                console.log('🧹 [SW] All caches cleared');
            })
        );
    }
    
    if (data && data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(data.urls);
            })
        );
    }
});

// ========================================
// PUSH NOTIFICATION - Nhận push từ server (nếu có)
// ========================================
self.addEventListener('push', event => {
    let data = {
        title: 'Pillowy Reminder',
        body: 'Time to take a break! 🌸',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            dateOfArrival: Date.now()
        },
        actions: [
            {
                action: 'open',
                title: 'Open App'
            },
            {
                action: 'close',
                title: 'Dismiss'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ========================================
// NOTIFICATION CLICK - Xử lý khi click vào notification
// ========================================
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
        .then(windowClients => {
            // Kiểm tra xem có tab nào đang mở không
            for (let client of windowClients) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Mở tab mới nếu chưa có
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ========================================
// BACKGROUND SYNC - Đồng bộ khi có mạng
// ========================================
self.addEventListener('sync', event => {
    if (event.tag === 'sync-pending-notifications') {
        event.waitUntil(syncPendingNotifications());
    }
    
    if (event.tag === 'sync-streak') {
        event.waitUntil(syncStreakData());
    }
});

async function syncPendingNotifications() {
    try {
        // Gửi message đến client để xử lý pending notifications
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_PENDING',
                timestamp: Date.now()
            });
        });
        
        console.log('🔄 [SW] Background sync completed');
    } catch (error) {
        console.error('❌ [SW] Background sync failed:', error);
        throw error;
    }
}

async function syncStreakData() {
    try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_STREAK',
                timestamp: Date.now()
            });
        });
    } catch (error) {
        console.error('❌ [SW] Streak sync failed:', error);
        throw error;
    }
}

// ========================================
// PERIODIC BACKGROUND SYNC (nếu được hỗ trợ)
// ========================================
self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-reminders') {
        event.waitUntil(checkScheduledReminders());
    }
});

async function checkScheduledReminders() {
    try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
            client.postMessage({
                type: 'CHECK_REMINDERS',
                timestamp: Date.now()
            });
        });
    } catch (error) {
        console.error('❌ [SW] Periodic check failed:', error);
        throw error;
    }
}

console.log('🌸 [SW] Pillowy Service Worker loaded');
