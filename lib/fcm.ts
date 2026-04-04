// lib/fcm.ts — Firebase Cloud Messaging helper
//
// ── SETUP ──────────────────────────────────────────────────────────────────────
// 1. Replace the firebaseConfig values below with your Firebase web app config.
//    Firebase Console → Project Settings → General → Your apps → Web app
// 2. Replace VAPID_KEY with your Web Push certificate key pair.
//    Firebase Console → Project Settings → Cloud Messaging → Web Push certificates

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

// ── Replace with your Firebase web app config ─────────────────────────────────
const firebaseConfig = {
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID",
};

const VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";
// ─────────────────────────────────────────────────────────────────────────────

function getFirebaseApp() {
    return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

let _messaging: Messaging | null = null;

function getFirebaseMessaging(): Messaging | null {
    if (typeof window === "undefined") return null;   // SSR guard
    if (_messaging) return _messaging;
    try {
        _messaging = getMessaging(getFirebaseApp());
        return _messaging;
    } catch {
        return null;
    }
}

/**
 * Request notification permission, obtain an FCM token, and save it to the
 * ISMS backend so the server can send push notifications to this browser.
 *
 * Call this once after the user logs in (e.g. in NavBar's useEffect).
 * Safe to call multiple times — it only registers the service worker and
 * sends the token to the backend on the first call per session.
 */
export async function registerFcmToken(authToken: string): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!("serviceWorker" in navigator)) return;

    // Skip silently if Firebase is not yet configured
    if (
        VAPID_KEY.startsWith("REPLACE_") ||
        firebaseConfig.apiKey.startsWith("REPLACE_")
    ) return;

    try {
        // Don't prompt if already denied — browser will spam console warnings
        if (Notification.permission === "denied") return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Register the service worker that handles background messages
        const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

        const msging = getFirebaseMessaging();
        if (!msging) return;

        const token = await getToken(msging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (!token) return;

        await fetch("/api/auth/fcm-token", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token }),
        });
    } catch (err) {
        // Non-fatal — app works without push notifications
        console.warn("[FCM] Registration failed:", err);
    }
}

/**
 * Subscribe to foreground FCM messages.
 * Returns an unsubscribe function to call on component unmount.
 *
 * Use this to show a toast when the user receives a push while the tab is active
 * (the service worker only fires for background messages).
 */
export function onForegroundMessage(
    handler: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void
): () => void {
    const msging = getFirebaseMessaging();
    if (!msging) return () => {};
    const unsub = onMessage(msging, handler);
    return unsub;
}
