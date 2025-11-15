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
