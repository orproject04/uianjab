"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";

type NoticeType = "success" | "info" | "error";
type Notice = { type: NoticeType; text: string };

export default function ResendVerificationForm() {
  const router = useRouter();
  const q = useSearchParams();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = (n: Notice) => setNotice(n);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Pre-fill email from query params if available (from signup redirect)
  useEffect(() => {
    const emailFromQuery = q.get("email");
    if (emailFromQuery) {
      setEmail(decodeURIComponent(emailFromQuery));
    }
  }, [q]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const r = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ email }),
      });

      const j = await r.json().catch(() => ({} as any));
      
      if (!r.ok) {
        showNotice({ 
          type: "error", 
          text: j?.error || "Gagal mengirim email verifikasi. Periksa email Anda." 
        });
        return;
      }

      showNotice({
        type: "success",
        text: j?.message || "Email verifikasi berhasil dikirim. Silakan periksa inbox Anda.",
      });

    } catch {
      showNotice({
        type: "error",
        text: "Tidak bisa menghubungi server.",
      });
    } finally {
      setLoading(false);
    }
  }

  const alertClass =
    notice?.type === "success"
      ? "text-green-700 bg-green-50 border border-green-200"
      : notice?.type === "info"
      ? "text-blue-700 bg-blue-50 border border-blue-200"
      : "text-red-700 bg-red-50 border border-red-200";

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
                <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
            Kirim Ulang Email Verifikasi
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Masukkan email Anda untuk mengirim ulang email verifikasi.
          </p>
        </div>

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
              <input
                type="email"
                placeholder="nama@instansi.go.id"
                required
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:border-gray-700 dark:focus:border-brand-800"
              />
            </div>

            <div>
              <Button className="w-full" size="sm" disabled={loading}>
                {loading ? "Mengirim..." : "Kirim Email Verifikasi"}
              </Button>
            </div>

            <div className="text-sm text-center space-y-2">
              <div>
                Sudah memiliki akun terverifikasi?{" "}
                <Link href="/signin" className="text-blue-600 hover:underline">
                  Masuk
                </Link>
              </div>
              <div>
                Belum punya akun?{" "}
                <Link href="/signup" className="text-blue-600 hover:underline">
                  Daftar
                </Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}