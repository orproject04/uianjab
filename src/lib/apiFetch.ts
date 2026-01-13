// src/lib/apiFetch.ts
// Updated untuk cookie-based authentication

let refreshLock: Promise<void> | null = null;

async function doRefresh() {
    if (refreshLock) return refreshLock; // single-flight

    refreshLock = (async () => {
        try {
            const r = await fetch("/api/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", // Penting: kirim cookies
            });
            if (!r.ok) throw new Error("Refresh failed");
            // Cookies akan di-update otomatis oleh browser
        } finally {
            refreshLock = null;
        }
    })();

    return refreshLock;
}

export async function apiFetch(input: string | URL | Request, init?: RequestInit) {
    // Pastikan credentials: 'include' untuk kirim cookies
    const fetchInit: RequestInit = {
        ...init,
        credentials: init?.credentials || "include",
    };
    // Simple in-memory single-flight cache for GET requests
    // so repeated client-side calls to the same URL don't trigger multiple network requests.
    // Respects callers that explicitly opt-out with `{ cache: 'no-store' }`.
    const method = (fetchInit.method || 'GET').toString().toUpperCase();
    const url = typeof input === 'string' ? input : String(input);

    // Map of inflight / cached responses: url -> Promise<{ status, text, headers }>
    // Stored at module level so it's shared across imports.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!(globalThis as any).__apiFetchCache) (globalThis as any).__apiFetchCache = new Map();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const apiFetchCache: Map<string, Promise<any>> = (globalThis as any).__apiFetchCache;

    const shouldCache = method === 'GET' && fetchInit.cache !== 'no-store';
    // If caller explicitly asked for no-store, evict any existing cached response
    // so future cached GETs won't return stale data after a mutation.
    if (method === 'GET' && fetchInit.cache === 'no-store') {
        apiFetchCache.delete(url);
    }
    if (shouldCache) {
        if (apiFetchCache.has(url)) {
            const cached = await apiFetchCache.get(url);
            return new Response(cached.text, { status: cached.status, headers: cached.headers });
        }

        const p = (async () => {
            let res = await fetch(input, fetchInit);
            if (res.status === 401) {
                try {
                    await doRefresh();
                } catch {
                    return { status: res.status, text: await res.text(), headers: {} };
                }
                res = await fetch(input, fetchInit);
            }
            const text = await res.text();
            const headersObj: Record<string, string> = {};
            res.headers.forEach((v, k) => (headersObj[k] = v));
            return { status: res.status, text, headers: headersObj };
        })();

        apiFetchCache.set(url, p);
        const cached = await p;
        return new Response(cached.text, { status: cached.status, headers: cached.headers });
    }

    // Non-cached request path (or explicit no-store)
    let res = await fetch(input, fetchInit);
    if (res.status !== 401) return res;

    try {
        await doRefresh();
    } catch {
        // Refresh gagal → user harus login ulang
        return res;
    }

    // retry dengan cookie yang sudah di-refresh
    res = await fetch(input, fetchInit);
    return res;
}
