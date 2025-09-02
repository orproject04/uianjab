"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";

type NoticeType = "success" | "info" | "error";
type Notice = { type: NoticeType; text: string };

export default function ForgotPasswordPage() {
    const router = useRouter();
    const q = useSearchParams();
    const next = useMemo(() => q.get("next") || "/", [q]);

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const [notice, setNotice] = useState<Notice | null>(null);
    const showNotice = (n: Notice) => setNotice(n);

    // auto-dismiss alert (4 detik)
    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(t);
    }, [notice]);

    // jika sudah login → redirect
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
            // 1) cek apakah email terdaftar
            const c = await fetch("/api/auth/check-email", {
                method: "POST",
                headers: { "Content-Type":"application/json" },
                body: JSON.stringify({ email })
            });
            const cj = await c.json().catch(() => ({}));
            if (!c.ok) {
                showNotice({ type: "error", text: cj?.error || "Gagal memeriksa email." });
                setLoading(false);
                return;
            }
            if (!cj?.exists) {
                // Tidak terdaftar → kasih alert & hentikan
                showNotice({ type: "error", text: "Email tidak terdaftar." });
                setLoading(false);
                return;
            }

            // 2) lanjut kirim forgot (server akan mengirim email reset)
            await fetch("/api/auth/forgot", {
                method: "POST",
                headers: { "Content-Type":"application/json" },
                body: JSON.stringify({ email })
            });

            showNotice({
                type: "info",
                text: "Tautan reset telah dikirim ke Email Anda."
            });
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

    return (
        <div className="flex flex-col flex-1 lg:w-1/2 w-full">
            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
                <div className="mb-5 sm:mb-8">
                    <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                        Lupa Password
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Masukkan email Anda. Kami akan mengirim tautan untuk mengatur ulang password.
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

                <form onSubmit={onSubmit}>
                    <div className="space-y-6">
                        <div>
                            <Label>
                                Email <span className="text-error-500">*</span>
                            </Label>
                            <Input
                                placeholder="nama@instansi.go.id"
                                type="email"
                                required
                                value={email}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <Button className="w-full" size="sm" type="submit" disabled={loading}>
                                {loading ? "Mengirim..." : "Kirim Link Reset"}
                            </Button>
                        </div>

                        <div className="text-sm text-center">
                            Ingat password?{" "}
                            <Link href="/signin" className="text-blue-600 hover:underline">
                                Masuk
                            </Link>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
