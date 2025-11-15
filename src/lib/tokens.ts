// src/lib/tokens.ts
import crypto from "crypto";

/* ========= Server-side token helpers (tetap) ========= */
export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}
export function hashRefreshToken(token: string) {
    const pepper = process.env.REFRESH_TOKEN_PEPPER || "";
    return crypto.createHash("sha256").update(token + pepper).digest("hex");
}
export function hashResetToken(token: string) {
    const pepper = process.env.RESET_TOKEN_PEPPER || "";
    return crypto.createHash("sha256").update(token + pepper).digest("hex");
}

/* ========= Client-side storage helpers (Bearer-only) =========
   Simpan di localStorage agar bisa di-share antar tab.
   Pastikan file ini hanya dipakai di Client Components.
*/
const ACCESS_KEY = "anjab_access_token";
const REFRESH_KEY = "anjab_refresh_token";

function ls() {
    if (typeof window === "undefined") return null;
    return window.localStorage;
}

export const tokenStore = {
    get access(): string | null {
        return ls()?.getItem(ACCESS_KEY) ?? null;
    },
    get refresh(): string | null {
        return ls()?.getItem(REFRESH_KEY) ?? null;
    },
    set(access: string | null, refresh: string | null) {
        const store = ls();
        if (!store) return;
        if (access) store.setItem(ACCESS_KEY, access);
        else store.removeItem(ACCESS_KEY);
        if (refresh) store.setItem(REFRESH_KEY, refresh);
        else store.removeItem(REFRESH_KEY);
    },
    clear() {
        const store = ls();
        if (!store) return;
        store.removeItem(ACCESS_KEY);
        store.removeItem(REFRESH_KEY);
    },
};

export function setTokens(access: string, refresh: string) {
    tokenStore.set(access, refresh);
}
export function clearTokens() {
    tokenStore.clear();
}
