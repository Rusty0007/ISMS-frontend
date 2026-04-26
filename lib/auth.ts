// sessionStorage is used intentionally:
// - Tokens are cleared automatically when the browser tab is closed
// - Each tab has its own isolated storage (no cross-tab token sharing)
const ACCESS_TOKEN_KEY = "access_token";
const AUTH_COOKIE_AGE_SECONDS = 60 * 60 * 24;

function hasWindow() {
    return typeof window !== "undefined";
}

function writeTokenCookie(token: string, maxAgeSeconds: number) {
    document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function getAccessToken(): string | null {
    if (!hasWindow()) return null;
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) writeTokenCookie(token, AUTH_COOKIE_AGE_SECONDS);
    return token;
}

export function setAccessToken(token: string) {
    if (!hasWindow()) return;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    writeTokenCookie(token, AUTH_COOKIE_AGE_SECONDS);
}

export function clearAuthSession() {
    if (!hasWindow()) return;
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("first_name");
    sessionStorage.removeItem("last_name");
    sessionStorage.removeItem("roles");
    // Clear cached FCM token so the next login re-registers a fresh token
    localStorage.removeItem("isms_fcm_token");
    document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function isUnauthorized(status: number) {
    return status === 401 || status === 403;
}

/** Decode JWT exp claim (no verification — client-side only). Returns ms epoch or null. */
export function getTokenExpiryMs(): number | null {
    const token = getAccessToken();
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

/** Returns true when the token expires within the given threshold (default 30 min). */
export function isTokenExpiringSoon(thresholdMs = 30 * 60 * 1000): boolean {
    const expiry = getTokenExpiryMs();
    if (!expiry) return false;
    return Date.now() + thresholdMs >= expiry;
}

/**
 * Call POST /auth/refresh and store the new token.
 * Safe to call speculatively — if it fails we keep the existing token.
 */
export async function refreshAccessToken(): Promise<boolean> {
    const token = getAccessToken();
    if (!token) return false;
    try {
        const res = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            if (data.access_token) {
                setAccessToken(data.access_token);
                return true;
            }
        }
    } catch {
        // Network error — keep existing token
    }
    return false;
}

/**
 * Call this when an API response comes back with 401 "Session expired".
 * Clears local auth state and redirects to /login with a reason parameter
 * so the login page can show an informative message.
 */
export function handleSessionKicked(reason: "expired" | "kicked" = "kicked") {
    if (!hasWindow()) return;
    clearAuthSession();
    window.location.replace(`/login?reason=${reason}`);
}
