"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function SessionRefreshOnNav() {
    const pathname = usePathname();
    const search = useSearchParams();

    // Hindari double-call pada navigasi yang sama
    const lastKeyRef = useRef<string>("");

    useEffect(() => {
        const key = pathname + "?" + (search?.toString() || "");
        if (lastKeyRef.current === key) return;
        lastKeyRef.current = key;

        // panggil refresh "best-effort"
        (async () => {
            try {
                await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
            } catch {
                // abaikan error; kalau refresh gagal, middleware akan handle saat token habis
            }
        })();
    }, [pathname, search]);

    return null;
}
