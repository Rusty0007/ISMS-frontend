// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the ISMS tab is not in focus.
//
// ── SETUP ──────────────────────────────────────────────────────────────────────
// Replace the placeholder values below with your Firebase project config.
// Find them in: Firebase Console → Project Settings → General → Your apps → Web app
//
// VAPID key: Project Settings → Cloud Messaging → Web Push certificates → Key pair

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// ── Replace with your Firebase web app config ─────────────────────────────────
firebase.initializeApp({
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification ?? {};
    if (!title) return;
    self.registration.showNotification(title, {
        body:  body ?? "",
        icon:  "/icon-192.png",   // place a 192×192 icon in /public or adjust path
        badge: "/icon-72.png",
        data:  payload.data ?? {},
    });
});
