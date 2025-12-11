"use client";

import React, {useEffect, useState} from "react";
import {useRouter, usePathname, useSearchParams} from "next/navigation";

import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

import {useOptionalSidebar} from "@/context/SidebarContext";
import {useMe} from "@/context/MeContext";

const AdminLayoutClient: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const sidebar = useOptionalSidebar();
    const isExpanded = !!sidebar?.isExpanded;
    const isHovered = !!sidebar?.isHovered;
    const isMobileOpen = !!sidebar?.isMobileOpen;

    const {me, loading} = useMe();
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();

    const [canRender, setCanRender] = useState(false);

    useEffect(() => {
        if (loading) return; // Tunggu MeContext selesai load

        const next = `${pathname || "/"}${sp.toString() ? `?${sp.toString()}` : ""}`;

        // Jika tidak ada user, redirect ke login
        if (!me) {
            router.replace(`/signin?next=${encodeURIComponent(next)}`);
            return;
        }

        // Cek role untuk halaman tertentu
        if (
            me.role !== "admin" &&
            (pathname?.startsWith("/anjab/edit") || pathname?.startsWith("/anjab/create"))
        ) {
            router.replace("/");
            return;
        }

        setCanRender(true);
    }, [me, loading, router, pathname, sp]);

    if (loading || !canRender) {
        return (
            <div className="w-full h-screen flex items-center justify-center">
                <div className="text-sm text-gray-500">Memeriksa sesi…</div>
            </div>
        );
    }

    const mainContentMargin = isMobileOpen
        ? "ml-0"
        : isExpanded || isHovered
            ? "lg:ml-[380px]"
            : "lg:ml-[90px]";


    return (
        <div className="min-h-screen xl:flex">
            <AppSidebar/>
            <Backdrop/>
            <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
                <AppHeader/>
                <div id="admin-content" style={{paddingTop: 'var(--header-height)'}} className="p-4 mx-auto max-w-7xl md:p-6 lg:p-8">{children}</div>
            </div>
        </div>
    );
};

export default AdminLayoutClient;