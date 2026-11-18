const API_BASE = (import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
export function getAuthToken() {
    return localStorage.getItem("bingo_admin_token");
}
export function setAuthToken(token) {
    localStorage.setItem("bingo_admin_token", token);
}
export function clearAuthToken() {
    localStorage.removeItem("bingo_admin_token");
    localStorage.removeItem("bingo_admin_profile");
}
export async function adminFetch(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401) {
            clearAuthToken();
            window.dispatchEvent(new Event("admin_auth_expired"));
        }
        throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
    }
    return data;
}
