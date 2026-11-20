export const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || "").replace(/\/+$/, "");

export function getAuthToken(): string | null {
  return localStorage.getItem("bingo_admin_token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("bingo_admin_token", token);
}

export function clearAuthToken() {
  localStorage.removeItem("bingo_admin_token");
  localStorage.removeItem("bingo_admin_profile");
}

export function getTelegramFileUrl(fileId: string): string {
  const token = getAuthToken() || "";
  return `${API_BASE}/api/admin/telegram-file/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function adminFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    if (res.status === 401 && !endpoint.includes("/auth/login")) {
      clearAuthToken();
      window.dispatchEvent(new Event("admin_auth_expired"));
    }
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export function formatMoney(val: number): string {
  return Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
