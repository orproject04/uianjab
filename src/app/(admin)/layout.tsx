// src/app/(admin)/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

import { useOptionalSidebar } from "@/context/SidebarContext";
import { tokenStore } from "@/lib/tokens";
import { apiFetch } from "@/lib/apiFetch";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    // Sidebar opsional: aman walau belum ada Provider
    const sidebar = useOptionalSidebar();
    const isExpanded = !!sidebar?.isExpanded;
    const isHovered = !!sidebar?.isHovered;
    const isMobileOpen = !!sidebar?.isMobileOpen;

    // Guard login
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();
    const next = useMemo(() => {
        const q = sp.toString();
        return (pathname || "/") + (q ? `?${q}` : "");
    }, [pathname, sp]);

    const [canRender, setCanRender] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            // tidak ada access token → langsung ke signin
            if (!tokenStore.access) {
                router.replace(`/signin?next=${encodeURIComponent(next)}`);
                return;
            }

            // ada token → validasi; apiFetch akan auto-refresh jika perlu
            const r = await apiFetch("/api/auth/me", { cache: "no-store" });
            if (!alive) return;

            if (!r.ok) {
                router.replace(`/signin?next=${encodeURIComponent(next)}`);
                return;
            }

            const j = await r.json();
            const role = j?.data?.role ?? "user";

            // ⛔️ jika user biasa buka /AnjabEdit atau /AnjabCreate → redirect home
            if (
                role !== "admin" &&
                (pathname.startsWith("/AnjabEdit") || pathname.startsWith("/AnjabCreate"))
            ) {
                router.replace("/");
                return;
            }

            setCanRender(true);
        })();

        return () => {
            alive = false;
        };
    }, [router, next, pathname]);

    if (!canRender) {
        return (
            <div className="w-full h-screen flex items-center justify-center">
                <div className="text-sm text-gray-500">Memeriksa sesi…</div>
            </div>
        );
    }

    const mainContentMargin = isMobileOpen
        ? "ml-0"
        : isExpanded || isHovered
            ? "lg:ml-[350px]"
            : "lg:ml-[90px]";

    return (
        <div className="min-h-screen xl:flex">
            <AppSidebar />
            <Backdrop />
            <div
                className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
            >
                <AppHeader />
                <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
