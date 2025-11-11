// src/components/layout/UserDropdown.tsx
"use client";

import React, {useEffect, useState} from "react";
import {Dropdown} from "../ui/dropdown/Dropdown";
import {FaUser} from "react-icons/fa";
import {useRouter} from "next/navigation";

import {useMe} from "@/context/MeContext";
import {tokenStore, clearTokens} from "@/lib/tokens";

type Me = { id: string; email: string; role: string; full_name: string | null };

export default function UserDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const router = useRouter();

    // Ambil profil dari MeContext (tidak fetch sendiri)
    const {me} = useMe();

    function toggleDropdown(e: React.MouseEvent<HTMLButtonElement>) {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
    }

    function closeDropdown() {
        setIsOpen(false);
    }

    // Tutup dropdown saat klik di luar
    useEffect(() => {
        function onDocClick() {
            setIsOpen(false);
        }

        if (isOpen) document.addEventListener("click", onDocClick);
        return () => document.removeEventListener("click", onDocClick);
    }, [isOpen]);

    async function handleSignOut() {
        if (signingOut) return;
        setSigningOut(true);
        try {
            // Kirim refresh token ke server agar sesi direvoke (jika ada)
            const refresh = tokenStore.refresh;
            if (refresh) {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    credentials: "omit", // Bearer-only; kita simpan token di sessionStorage
                    body: JSON.stringify({refresh_token: refresh}),
                }).catch(() => { /* abaikan error jaringan */
                });
            }
        } finally {
            // Selalu bersihkan token lokal agar benar-benar keluar
            clearTokens();
            closeDropdown();
            router.replace("/signin?loggedout=1");
            setSigningOut(false);
        }
    }

    const displayName =
        me?.full_name?.trim() ||
        (me?.email ? me.email.split("@")[0] : "User");

    return (
        <div className="relative">
            {/* Toggle: di desktop tampil avatar + nama; di mobile hanya avatar */}
            <button
                type="button"
                onClick={toggleDropdown}
                className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
        <span
            className="mr-3 overflow-hidden rounded-full h-8 w-8 flex items-center justify-center bg-gray-200 dark:bg-gray-800">
          <FaUser size={20}/>
        </span>

                {/* Nama di tombol hanya tampil di desktop */}
                <span className="mr-1 font-medium text-theme-sm hidden lg:block">
          {displayName}
        </span>

                <svg
                    className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    width="18" height="20" viewBox="0 0 18 20" fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                >
                    <path d="M4.3125 8.65625L9 13.3437L13.6875 8.65625" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>

            <Dropdown
                isOpen={isOpen}
                onClose={closeDropdown}
                className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
            >
                {/* Nama dipindah ke dalam dropdown untuk mobile, non-interaktif */}
                <div
                    className="block lg:hidden px-3 py-2 text-left text-gray-800 dark:text-gray-200 font-semibold text-[14px] select-none cursor-default"
                    aria-hidden="true"
                >
                  {displayName}
                </div>

                <div className="block lg:hidden h-px bg-gray-200 dark:bg-white/10 my-2"/>

                <button
                    type="button"
                    onClick={() => {
                        closeDropdown();
                        router.push("/help");
                    }}
                    className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                    <svg className="w-6 h-6 fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300" viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.88 16h-1.75v-1.75h1.75V18zM15.07 9.75c-.28.56-.83 1.03-1.49 1.42-.53.33-.84.56-.97.86-.08.17-.11.38-.11.62H11.6c0-.52.12-.9.35-1.2.3-.39.77-.66 1.48-1.06.56-.33.86-.6 1.02-.86.18-.29.17-.66-.04-1.02-.18-.32-.52-.49-.96-.49-.5 0-.86.23-1.08.69l-1.5-.69c.36-.8 1.05-1.48 2.58-1.48 1.44 0 2.41.7 2.82 1.6.23.55.18 1.18-.21 1.86z" />
                    </svg>
                    Help
                </button>

                <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex items-center gap-3 px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                    <svg className="fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300" width="24"
                         height="24" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd"
                              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"/>
                    </svg>
                    {signingOut ? "Signing out..." : "Sign out"}
                </button>
            </Dropdown>
        </div>
    );
}
