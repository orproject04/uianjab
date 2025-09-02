"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";

type NoticeType = "success" | "info" | "error";
type Notice = { type: NoticeType; text: string };

export default function ResetPasswordPage() {
    const router = useRouter();
    const sp = useSearchParams();
    const next = useMemo(() => sp.get("next") || "/", [sp]);

    const [token, setToken] = useState("");
    const [pw, setPw] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const [notice, setNotice] = useState<Notice | null>(null);
    const showNotice = (n: Notice) => setNotice(n);

    // ambil token dari query
    useEffect(() => {
        setToken(sp.get("token") || "");
    }, [sp]);

    // auto-dismiss alert (4 detik)
    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(t);
    }, [notice]);

    // jika sudah login → redirect ke next
    // useEffect(() => {
    //     let cancelled = false;
    //     (async () => {
    //         try {
    //             const r = await fetch("/api/auth/me", { method: "GET" });
    //             if (!cancelled && r.ok) router.replace(next);
    //         } catch {}
    //     })();
    //     return () => { cancelled = true; };
    // }, [router, next]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setNotice(null);
        try {
            const r = await fetch("/api/auth/reset", {
                method: "POST",
                headers: { "Content-Type":"application/json" },
                body: JSON.stringify({ token, new_password: pw })
            });
            if (r.ok) {
                showNotice({ type: "success", text: "Password telah direset. Silakan login." });
                setTimeout(() => router.replace("/signin"), 1200);
            } else {
                const j = await r.json().catch(() => ({}));
                showNotice({ type: "error", text: j?.error || "Gagal reset password." });
            }
        } catch {
            showNotice({ type: "error", text: "Tidak bisa menghubungi server." });
        } finally {
            setLoading(false);
        }
    }

    const alertClass =
        notice?.type === "success"
            ? "text-green-700 bg-green-50 border border-green-200"
            : notice?.type === "info"
                ? "text-blue-700 bg-blue-50 border border-blue-200"
                : "text-red-700 bg-red-50 border border-red-200"; // error

    const tokenMissing = !token || token.length < 10;

    return (
        <div className="flex flex-col flex-1 lg:w-1/2 w-full">
            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
                <div className="mb-5 sm:mb-8">
                    <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                        Reset Password
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Masukkan password baru Anda.
                    </p>
                </div>

                {/* Alert */}
                {notice && (
                    <div
                        role="status"
                        className={`${alertClass} rounded-lg px-3 py-2 text-sm mb-4 flex items-start justify-between gap-3`}
                    >
                        <span>{notice.text}</span>
                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            aria-label="Tutup pemberitahuan"
                            className="shrink-0 inline-flex items-center justify-center rounded-md px-1 text-inherit/80 hover:text-inherit"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Info jika token hilang */}
                {tokenMissing && (
                    <div
                        className={`text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-4`}
                    >
                        Token tidak ditemukan. Buka tautan dari email reset password Anda.
                    </div>
                )}

                <form onSubmit={onSubmit}>
                    <div className="space-y-6">
                        <input type="hidden" value={token} readOnly />

                        <div>
                            <Label>
                                Password Baru <span className="text-error-500">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Minimal 8 karakter"
                                    required
                                    minLength={8}
                                    value={pw}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)}
                                />
                                <span
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                                >
                  {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                  ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                  )}
                </span>
                            </div>
                        </div>

                        <div>
                            <Button
                                className="w-full"
                                size="sm"
                                type="submit"
                                disabled={loading || tokenMissing}
                            >
                                {loading ? "Memproses..." : "Setel Ulang"}
                            </Button>
                        </div>

                        <div className="text-sm text-center">
                            Kembali ke{" "}
                            <Link href="/signin" className="text-blue-600 hover:underline">
                                halaman masuk
                            </Link>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
