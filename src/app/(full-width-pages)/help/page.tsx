"use client";

import React, {useState, useEffect} from "react";
import Link from "next/link";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import {useOptionalSidebar} from "@/context/SidebarContext";
import {useMe} from "@/context/MeContext";
import {tokenStore} from "@/lib/tokens";

// Helper to check if JWT is expired
function isJwtExpired(token: string): boolean {
    try {
        const [, payloadB64] = token.split(".");
        const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
        const expSec: number = json?.exp ?? 0;
        return Math.floor(Date.now() / 1000) >= expSec;
    } catch {
        return true;
    }
}

function HelpContent({activeTab, setActiveTab, isAuthenticated}: {activeTab: string; setActiveTab: (tab: string) => void; isAuthenticated: boolean}) {
    const handleTabClick = (tab: string) => {
        setActiveTab(tab);
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-lg">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-purple-600 to-purple-700">
                <h1 className="text-2xl font-semibold text-white">Panduan Penggunaan</h1>
                <p className="text-purple-100 mt-1">Pelajari cara menggunakan sistem manajemen jabatan dengan mudah</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-1 px-6 overflow-x-auto">
                    <button
                        onClick={() => handleTabClick("akun")}
                        className={`py-4 px-6 text-sm font-medium border-b-2 hover:text-purple-600 hover:border-purple-300 flex items-center gap-2 whitespace-nowrap ${
                            activeTab === "akun" ? "border-purple-600 text-purple-600" : "border-transparent text-gray-600"
                        }`}
                        aria-current={activeTab === "akun"}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                            <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" fill="currentColor"/>
                            <path d="M12.0002 14.5C6.99016 14.5 2.91016 17.86 2.91016 22C2.91016 22.28 3.13016 22.5 3.41016 22.5H20.5902C20.8702 22.5 21.0902 22.28 21.0902 22C21.0902 17.86 17.0102 14.5 12.0002 14.5Z" fill="currentColor"/>
                        </svg>
                        Pembuatan Akun
                    </button>
                    <button
                        onClick={() => handleTabClick("peta")}
                        className={`py-4 px-6 text-sm font-medium border-b-2 hover:text-purple-600 hover:border-purple-300 flex items-center gap-2 whitespace-nowrap ${
                            activeTab === "peta" ? "border-purple-600 text-purple-600" : "border-transparent text-gray-600"
                        }`}
                        aria-current={activeTab === "peta"}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM9 17H7V10H9V17ZM13 17H11V7H13V17ZM17 17H15V13H17V17Z" fill="currentColor"/>
                        </svg>
                        Peta Jabatan
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div>
                {/* Tab: Pembuatan Akun (default) */}
                <section className={`${activeTab === "akun" ? "block" : "hidden"} p-6`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Card: Daftar Akun Baru */}
                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 flex flex-col">
                            <div className="aspect-video bg-white/30 dark:bg-white/10 backdrop-blur-lg border border-white/40 dark:border-white/20 shadow-lg flex items-center justify-center">
                                <svg className="w-24 h-24 text-purple-400" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" fill="currentColor"/>
                                    <path d="M12.0002 14.5C6.99016 14.5 2.91016 17.86 2.91016 22C2.91016 22.28 3.13016 22.5 3.41016 22.5H20.5902C20.8702 22.5 21.0902 22.28 21.0902 22C21.0902 17.86 17.0102 14.5 12.0002 14.5Z" fill="currentColor"/>
                                </svg>
                            </div>
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-2">
                                    <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 text-sm font-semibold">1</span>
                                    Daftar Akun Baru
                                </h3>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-200 ml-8" style={{textIndent: '-1.2em', paddingLeft: '1.5em'}}>
                                    <li>Buka halaman <strong>Daftar</strong> (Sign Up).</li>
                                    <li>Isi <strong>Nama Lengkap</strong>, <strong>Email</strong> aktif, dan <strong>Password</strong> minimal 8 karakter.</li>
                                    <li>Klik tombol <strong>Daftar</strong>.</li>
                                </ol>
                            </div>
                        </div>
                        {/* Card: Verifikasi Email */}
                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 flex flex-col">
                            <div className="aspect-video bg-white/30 dark:bg-white/10 backdrop-blur-lg border border-white/40 dark:border-white/20 shadow-lg flex items-center justify-center">
                                <svg className="w-24 h-24 text-blue-400" viewBox="0 0 24 24" fill="none">
                                    <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="currentColor"/>
                                </svg>
                            </div>
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-2">
                                    <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 text-sm font-semibold">2</span>
                                    Verifikasi Email
                                </h3>
                                <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-200 ml-8" style={{textIndent: '-1.2em', paddingLeft: '1.5em'}}>
                                    <li>Periksa email Anda untuk link verifikasi.</li>
                                    <li>Klik link verifikasi di email.</li>
                                    <li>Periksa folder Spam jika email tidak ditemukan.</li>
                                    <li>Gunakan "Kirim Ulang" jika belum menerima email.</li>
                                </ul>
                                <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
                                    <p className="text-amber-800 dark:text-amber-200 text-xs">
                                        <strong>Penting:</strong> Akun tidak dapat digunakan sebelum email terverifikasi.
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Card: Masuk ke Sistem */}
                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 flex flex-col">
                            <div className="aspect-video bg-white/30 dark:bg-white/10 backdrop-blur-lg border border-white/40 dark:border-white/20 shadow-lg flex items-center justify-center">
                                <svg className="w-24 h-24 text-green-400" viewBox="0 0 24 24" fill="none">
                                    <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/>
                                </svg>
                            </div>
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-2">
                                    <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 text-sm font-semibold">3</span>
                                    Masuk ke Sistem
                                </h3>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-200 ml-8" style={{textIndent: '-1.2em', paddingLeft: '1.5em'}}>
                                    <li>Buka halaman <strong>Masuk</strong> (Sign In).</li>
                                    <li>Masukkan <strong>Email</strong> dan <strong>Password</strong> yang sudah terdaftar.</li>
                                    <li>Klik tombol <strong>Masuk</strong>.</li>
                                </ol>
                                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                    <h4 className="font-medium mb-1 text-gray-900 dark:text-gray-100 text-sm">Lupa Password?</h4>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">Gunakan link <strong>Lupa Password</strong> di halaman login untuk reset password. Link reset akan dikirim ke email terdaftar.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Card: Security Tips */}
                    <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-800/50 overflow-hidden">
                        <div className="p-4 bg-amber-50/50 dark:bg-amber-900/20">
                            <h3 className="font-medium flex items-center gap-2 text-amber-800 dark:text-amber-200">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 17C11.45 17 11 16.55 11 16V12C11 11.45 11.45 11 12 11C12.55 11 13 11.45 13 12V16C13 16.55 12.55 17 12 17ZM13 9H11V7H13V9Z" fill="currentColor"/>
                                </svg>
                                Tips Keamanan
                            </h3>
                            <ul className="list-disc list-inside mt-2 space-y-2 text-sm text-amber-800 dark:text-amber-200 ml-8">
                                <li>Gunakan password unik dan kuat.</li>
                                <li>Jangan bagikan kata sandi Anda kepada orang lain.</li>
                                <li>Jika menerima email verifikasi yang mencurigakan, hubungi administrator.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Tab: Peta Jabatan */}
                <section className={`${activeTab === "peta" ? "block" : "hidden"} p-6`}>
                    <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                        <h3 className="font-medium mb-2 flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none">
                                <path d="M19.5 3H4.5C3.12 3 2 4.12 2 5.5V18.5C2 19.88 3.12 21 4.5 21H19.5C20.88 21 22 19.88 22 18.5V5.5C22 4.12 20.88 3 19.5 3ZM4.5 4.5H19.5C20.05 4.5 20.5 4.95 20.5 5.5V7H3.5V5.5C3.5 4.95 3.95 4.5 4.5 4.5ZM19.5 19.5H4.5C3.95 19.5 3.5 19.05 3.5 18.5V8.5H20.5V18.5C20.5 19.05 20.05 19.5 19.5 19.5Z" fill="currentColor"/>
                            </svg>
                            Cara Menggunakan Peta Jabatan
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                            <li>• Navigasi struktur jabatan menggunakan tampilan hierarki</li>
                            <li>• Cari jabatan berdasarkan nama atau unit kerja</li>
                            <li>• Terdapat data bezetting, kebutuhan pegawai serta selisihnya pada setiap jabatan</li>
                            <li>• Filter berdasarkan unit kerja atau level</li>
                        </ul>
                    </div>

                </section>

                {/* Tab: Analisis Jabatan */}

            </div>
        </div>
    );
}

export default function HelpPage() {
    const [activeTab, setActiveTab] = useState("akun");
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const sidebar = useOptionalSidebar();
    const isExpanded = sidebar?.isExpanded ?? false;
    const isHovered = sidebar?.isHovered ?? false;
    const isMobileOpen = sidebar?.isMobileOpen ?? false;
    const mainContentMargin = isMobileOpen ? "ml-0" : isExpanded || isHovered ? "lg:ml-[380px]" : "lg:ml-[90px]";

    const {me} = useMe();

    useEffect(() => {
        // Check authentication status
        const access = tokenStore.access;
        const hasValidToken = access && !isJwtExpired(access);
        const hasMe = !!me;

        // User is authenticated if they have a valid token or me context
        setIsAuthenticated(hasValidToken || hasMe);
    }, [me]);

    // Authenticated layout: with sidebar and header
    if (isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col xl:flex-row">
                <AppSidebar />
                <Backdrop />
                <div className={`flex-1 min-h-screen ${mainContentMargin} transition-all duration-300`}>
                    <AppHeader />
                    <main className="p-4 sm:p-6 lg:p-8" style={{ paddingTop: 'calc(var(--header-height) + 2rem)' }}>
                        <div className="mx-auto max-w-7xl">
                            <HelpContent activeTab={activeTab} setActiveTab={setActiveTab} isAuthenticated={isAuthenticated} />
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    // Unauthenticated layout: full-width, no sidebar/header
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Back button */}
                <div className="mb-6">
                    <Link
                        href="/signin"
                        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Kembali ke halaman masuk
                    </Link>
                </div>
                <HelpContent activeTab={activeTab} setActiveTab={setActiveTab} isAuthenticated={isAuthenticated} />
            </div>
        </div>
    );
}