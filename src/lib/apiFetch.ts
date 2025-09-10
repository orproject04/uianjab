// src/lib/apiFetch.ts
let refreshPromise: Promise<Response> | null = null;

export async function apiFetch(url: string, init?: RequestInit) {
    const opts = { ...init, credentials: "include" as const };

    let res = await fetch(url, opts);
    if (res.status !== 401) return res;

    // 401 → trigger refresh (sekali saja walau banyak request paralel)
    if (!refreshPromise) {
        refreshPromise = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
            .finally(() => { refreshPromise = null; });
    }
    const r = await refreshPromise;
    if (!r.ok) throw new Error("Session expired");

    // retry request
    res = await fetch(url, opts);
    return res;
}
