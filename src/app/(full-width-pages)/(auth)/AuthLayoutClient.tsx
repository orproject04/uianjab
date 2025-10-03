"use client";

import React, {useEffect, useMemo, useState} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import {ThemeProvider} from "@/context/ThemeContext";
import {tokenStore} from "@/lib/tokens";

// Helper kecil untuk cek exp JWT (tanpa verifikasi kriptografis)
function isJwtExpired(token: string): boolean {
    try {
        const [, payloadB64] = token.split(".");
        const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
        const expSec: number = json?.exp ?? 0;
        return Math.floor(Date.now() / 1000) >= expSec;
    } catch {
        return true; // gagal decode -> treat as expired
    }
}

export default function AuthLayoutClient({children}: { children: React.ReactNode }) {
    const router = useRouter();
    const q = useSearchParams();
    const next = useMemo(() => q.get("next") || "/", [q]);

    const [canShow, setCanShow] = useState(false);

    useEffect(() => {
        let alive = true;

        (async () => {
            const access = tokenStore.access;
            const refresh = tokenStore.refresh;

            // 1) Tanpa token → tampilkan halaman auth
            if (!access && !refresh) {
                if (alive) setCanShow(true);
                return;
            }

            // 2) Access valid → redirect
            if (access && !isJwtExpired(access)) {
                router.replace(next);
                return;
            }

            // 3) Coba refresh
            if (refresh) {
                try {
                    const r = await fetch("/api/auth/refresh", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({refresh_token: refresh}),
                        credentials: "omit",
                    });
                    if (alive && r.ok) {
                        const j = await r.json().catch(() => ({} as any));
                        if (j?.access_token && j?.refresh_token) {
                            tokenStore.set(j.access_token, j.refresh_token);
                            router.replace(next);
                            return;
                        }
                    }
                    if (alive) setCanShow(true);
                } catch {
                    if (alive) setCanShow(true);
                }
                return;
            }

            if (alive) setCanShow(true);
        })();

        return () => {
            alive = false;
        };
    }, [router, next]);

    if (!canShow) {
        return (
            <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
                <ThemeProvider>
                    <div className="relative flex w-full h-screen items-center justify-center dark:bg-gray-900">
                        <div className="text-sm text-gray-500">Memeriksa sesi…</div>
                    </div>
                </ThemeProvider>
            </div>
        );
    }

    return (
        <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
            <ThemeProvider>
                <div
                    className="relative flex lg:flex-row w-full h-screen justify-center flex-col dark:bg-gray-900 sm:p-0">
                    {children}

                    <div className="lg:w-1/2 w-full h-full bg-brand-600 dark:bg-white/5 lg:grid items-center hidden">
                        <div className="relative items-center justify-center flex z-1">
                            <div className="flex flex-col items-center max-w-xs">
                                <Link href="/" className="block mb-4">
                                    <Image width={231} height={48} src="/images/logo/pandawa5.png" alt="Logo"/>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Theme toggler dst kalau ada */}
                </div>
            </ThemeProvider>
        </div>
    );
}
