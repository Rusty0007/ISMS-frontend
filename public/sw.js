/**
 * ISMS Service Worker
 * 
 * Combines:
 * 1. Offline Resilience (Caching & Fallbacks)
 * 2. Firebase Cloud Messaging (Background Notifications)
 */

// ── 1. FIREBASE SETUP (Background Notifications) ──────────────────────────────

// Import Firebase scripts (Compat mode)
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Configuration placeholders — should match the ones in lib/fcm.ts
const firebaseConfig = {
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID",
};

// Only initialize if the user has replaced the placeholders
if (firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_")) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        const { title, body } = payload.notification ?? {};
        if (!title) return;
        self.registration.showNotification(title, {
            body:  body ?? "",
            icon:  "/logo.png",
            badge: "/logo.png",
            data:  payload.data ?? {},
        });
    });
}


// ── 2. OFFLINE RESILIENCE (Caching) ───────────────────────────────────────────

const CACHE_NAME = "isms-offline-v1";
const CORE_ASSETS = [
    "/",
    "/login",
    "/dashboard",
    "/referee",
    "/logo.png",
    "/favicon.ico"
];

self.addEventListener("install", (event) => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Use addAll for core assets. If one fails, the cache won't be created.
            // We wrap it in a catch to ensure the SW installs even if one asset is missing.
            return cache.addAll(CORE_ASSETS).catch(err => {
                console.warn("[SW] Some core assets failed to cache during install:", err);
            });
        })
    );
});

self.addEventListener("activate", (event) => {
    // Claim any existing clients immediately
    event.waitUntil(self.clients.claim());

    // Clean up old caches
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    
    // Only handle requests for our own origin
    if (url.origin !== self.location.origin) return;

    // 1. Navigation Requests (HTML pages)
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache the successful response for future offline use
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(async () => {
                    // Offline: Try exact match, then dashboard fallback
                    const cache = await caches.open(CACHE_NAME);
                    const matched = await cache.match(request);
                    if (matched) return matched;
                    
                    const fallback = await cache.match("/dashboard");
                    if (fallback) return fallback;
                    
                    return Response.error();
                })
        );
        return;
    }

    // 2. Static Assets (Next.js chunks, images)
    // Cache-first strategy for these
    if (
        url.pathname.startsWith("/_next/") || 
        url.pathname.startsWith("/sports/") || 
        url.pathname === "/logo.png" ||
        url.pathname.endsWith(".woff") ||
        url.pathname.endsWith(".woff2")
    ) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                
                return fetch(request).then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                }).catch(() => {
                    // If both fail, we just let it fail
                    return undefined;
                });
            })
        );
    }
});
