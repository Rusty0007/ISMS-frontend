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
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("roles");
    document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function isUnauthorized(status: number) {
    return status === 401 || status === 403;
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
