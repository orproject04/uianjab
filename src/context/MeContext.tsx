// src/context/MeContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export type Me = { id: string; email: string; role: string; full_name: string | null };

type MeCtx = {
    me: Me | null;
    loading: boolean;
    error: string | null;
    // panggil manual kalau perlu re-fetch (mis. setelah update profil)
    refresh: () => Promise<void>;
    isAdmin: boolean;
};

const Ctx = createContext<MeCtx | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);

            // Cookie-based: langsung fetch, browser auto kirim cookies
            const r = await apiFetch("/api/auth/me", { cache: "no-store" });
            if (!r.ok) {
                setMe(null);
                if (r.status !== 401) setError(`HTTP ${r.status}`);
                setLoading(false);
                return;
            }
            const j = await r.json();
            setMe(j?.data ?? null);
        } catch (e: any) {
            setError(e?.message || "Failed to load /api/auth/me");
            setMe(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            await load();
        })();
        return () => { alive = false; };
    }, []);

    // Cookies auto-share antar tab, tapi tetap bisa listen untuk manual refresh
    // Gunakan BroadcastChannel untuk sinkronisasi login/logout antar tab
    useEffect(() => {
        const channel = new BroadcastChannel('auth_channel');
        
        channel.onmessage = (event) => {
            if (event.data === 'login' || event.data === 'logout') {
                load(); // Reload user info
            }
        };

        return () => channel.close();
    }, []);

    const value = useMemo<MeCtx>(() => ({
        me,
        loading,
        error,
        refresh: load,
        isAdmin: (me?.role ?? "user") === "admin",
    }), [me, loading, error]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useMe must be used inside <MeProvider>");
    return v;
}
