// src/lib/apiFetch.ts
import { tokenStore, setTokens, clearTokens } from "@/lib/tokens";

let refreshLock: Promise<void> | null = null;

async function doRefresh() {
    const rt = tokenStore.refresh;
    if (!rt) throw new Error("No refresh token");

    if (refreshLock) return refreshLock; // single-flight

    refreshLock = (async () => {
        try {
            const r = await fetch("/api/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "omit",
                body: JSON.stringify({ refresh_token: rt }),
            });
            if (!r.ok) throw new Error("Refresh failed");
            const j = await r.json();
            if (!j?.access_token || !j?.refresh_token) throw new Error("Invalid refresh payload");
            setTokens(j.access_token, j.refresh_token);
        } finally {
            refreshLock = null;
        }
    })();

    return refreshLock;
}

function withAuth(init?: RequestInit): RequestInit {
    const headers = new Headers(init?.headers || {});
    const at = tokenStore.access;
    if (at) headers.set("Authorization", `Bearer ${at}`);
    return { ...init, headers };
}

export async function apiFetch(input: string | URL | Request, init?: RequestInit) {
    let res = await fetch(input, withAuth(init));
    if (res.status !== 401) return res;

    try {
        await doRefresh();
    } catch {
        clearTokens(); // refresh gagal → bersihkan kredensial lokal
        return res;    // biarkan 401 diteruskan ke caller
    }

    // retry dengan access token baru
    res = await fetch(input, withAuth(init));
    return res;
}
