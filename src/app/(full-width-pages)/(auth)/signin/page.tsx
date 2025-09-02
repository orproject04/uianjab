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

export default function SignInForm() {
  const router = useRouter();
  const q = useSearchParams();
  const next = useMemo(() => q.get("next") || "/", [q]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);

  // util singkat buat munculin alert
  function showNotice(n: Notice) {
    setNotice(n);
  }

  // auto-dismiss setelah 4 detik
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // pesan sukses setelah verifikasi / logout
  useEffect(() => {
    if (q.get("verified") === "1") {
      showNotice({ type: "success", text: "Email berhasil diverifikasi. Silakan login." });
    } else if (q.get("loggedout") === "1") {
      showNotice({ type: "info", text: "Anda telah keluar." });
    }
  }, [q]);

  // jika sudah login, langsung redirect
  // useEffect(() => {
  //   let cancelled = false;
  //   (async () => {
  //     try {
  //       const r = await fetch("/api/auth/me", { method: "GET" });
  //       if (!cancelled && r.ok) router.replace(next);
  //     } catch {}
  //   })();
  //   return () => { cancelled = true; };
  // }, [router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (r.ok) {
        router.replace(next);
      } else {
        const j = await r.json().catch(() => ({}));
        showNotice({ type: "error", text: j?.error || "Login gagal. Periksa email/password." });
      }
    } catch {
      showNotice({ type: "error", text: "Tidak bisa menghubungi server." });
    } finally {
      setLoading(false);
    }
  }

  // map style alert
  const alertClass =
      notice?.type === "success"
          ? "text-green-700 bg-green-50 border border-green-200"
          : notice?.type === "info"
              ? "text-blue-700 bg-blue-50 border border-blue-200"
              : "text-red-700 bg-red-50 border border-red-200"; // error default

  return (
      <div className="flex flex-col flex-1 lg:w-1/2 w-full">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Silahkan input email dan password.
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
                <Label>
                  Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  />
                  <span
                      onClick={() => setShowPassword((v) => !v)}
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

              <div className="flex items-center justify-end">
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                  Lupa password?
                </Link>
              </div>

              <div>
                <Button className="w-full" size="sm" type="submit" disabled={loading}>
                  {loading ? "Memproses..." : "Masuk"}
                </Button>
              </div>

              <div className="text-sm text-center">
                Belum punya akun?{" "}
                <Link href="/signup" className="text-blue-600 hover:underline">
                  Daftar
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
  );
}
