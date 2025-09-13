// src/app/(admin)/(others-pages)/Anjab/[[...slug]]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import { apiFetch } from "@/lib/apiFetch";

type Status = "idle" | "loading" | "ok" | "notfound" | "error";

export default function InformasiJabatanPage() {
    const params = useParams();

    // ---- ambil role user (untuk hide tombol non-admin)
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await apiFetch("/api/auth/me", { method: "GET", cache: "no-store" });
                if (!alive) return;
                if (r.ok) {
                    const j = await r.json();
                    setIsAdmin(j?.data?.role === "admin");
                } else {
                    setIsAdmin(false);
                }
            } catch {
                if (alive) setIsAdmin(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    // Ambil slug (bisa undefined saat /Anjab)
    const rawSlug = useMemo<string[]>(() => {
        const s = (params as any)?.slug;
        if (!s) return [];
        return Array.isArray(s) ? s : [String(s)];
    }, [params]);

    // id = join 2 segmen terakhir pakai "-"
    const id = useMemo(() => {
        if (rawSlug.length === 0) return "";
        if (rawSlug.length === 1) return rawSlug[0];
        return rawSlug.slice(-2).join("-");
    }, [rawSlug]);

    const encodedId = useMemo(() => (id ? encodeURIComponent(id) : ""), [id]);

    // href edit: pakai full path (/)
    const editHref = useMemo(() => {
        if (rawSlug.length === 0) return "#";
        const fullPath = rawSlug.join("/"); // contoh: "A/B/C/D"
        return `/AnjabEdit/jabatan/${fullPath}`;
    }, [rawSlug]);

    // Blob URL untuk iframe
    const [pdfSrc, setPdfSrc] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>("idle");

    // === Tambahan: resolve UUID jabatan dari slug (2 segmen terakhir) & simpan ke localStorage ===
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!id) return;
            try {
                // Asumsi endpoint GET /api/anjab/[slug] mengembalikan JSON yang memuat kolom id (uuid jabatan)
                const res = await apiFetch(`/api/anjab/${encodedId}/uuid`, { method: "GET", cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();

                // Ambil UUID dengan fallback aman
                const createdId =
                    data?.id ??
                    null;

                if (!cancelled && createdId && typeof window !== "undefined") {
                    // Key = dua segmen terakhir (nilai `id`)
                    const slugForUrl = id.replace(/-/g, "/");
                    localStorage.setItem(slugForUrl, String(createdId));
                }
            } catch {
                // diamkan bila gagal; tidak mengganggu alur utama
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, encodedId]);

    // Ambil PDF (GET) → blob → objectURL
    useEffect(() => {
        let alive = true;
        let currentUrl: string | null = null;

        async function loadPdf() {
            if (!id) {
                if (alive) {
                    setPdfSrc(null);
                    setStatus("notfound");
                }
                return;
            }

            try {
                if (alive) {
                    setStatus("loading");
                    setPdfSrc(null);
                }

                const res = await apiFetch(`/api/anjab/${encodedId}/pdf`, {
                    method: "GET",
                    cache: "no-store",
                });

                if (!alive) return;

                if (res.ok) {
                    const blob = await res.blob();
                    // Buat object URL untuk iframe
                    const url = URL.createObjectURL(blob);
                    currentUrl = url;
                    if (alive) {
                        setPdfSrc(url);
                        setStatus("ok");
                    }
                } else if (res.status === 404) {
                    setStatus("notfound");
                } else {
                    setStatus("error");
                }
            } catch {
                if (alive) setStatus("error");
            }
        }

        loadPdf();

        return () => {
            alive = false;
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
            }
        };
    }, [id, encodedId]);

    // === Tanpa slug/id ===
    if (!id) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center space-y-4">
                <p className="text-gray-700">Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading" || status === "idle") {
        return <p style={{ padding: 20 }}>Loading...</p>;
    }

    // === NOT FOUND / ERROR
    if (status === "notfound" || status === "error") {
        const isNotFound = status === "notfound";

        // Non-admin: pesan sederhana (tanpa aksi)
        if (!isAdmin) {
            return (
                <div className="w-full min-h-[calc(100dvh-200px)] flex items-center justify-center px-6">
                    <div className="max-w-3xl text-center space-y-3">
                        <p className={isNotFound ? "text-gray-800" : "text-red-700"}>
                            {isNotFound ? (
                                <>
                                    Data tidak ditemukan untuk <b>{id}</b>.
                                </>
                            ) : (
                                <>
                                    Terjadi kesalahan saat memuat data <b>{id}</b>. Coba lagi nanti.
                                </>
                            )}
                        </p>
                        <p className="text-sm text-gray-600">
                            <b>
                                Silakan Hubungi Subbagian Organisasi Bagian Organisasi dan Ketatalaksanaan
                                untuk melihat Dokumen Analisis Jabatan.
                            </b>
                        </p>
                    </div>
                </div>
            );
        }

        // Admin: tampilkan opsi unggah/buat manual
        return (
            <div className="p-8 max-w-5xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                    <p className={isNotFound ? "text-gray-800" : "text-red-700"}>
                        {isNotFound ? (
                            <>Data tidak ditemukan untuk <b>{id}</b>.</>
                        ) : (
                            <>Terjadi kesalahan saat memuat data <b>{id}</b>. Coba lagi nanti.</>
                        )}
                    </p>
                    <p className="text-sm text-gray-600">
                        Silakan memilih antara <b>mengunggah dokumen Anjab berformat .doc</b> (tidak mendukung .docx)
                        atau <b>membuat Anjab secara manual</b>.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Upload Word (.doc saja) */}
                    <div className="border rounded-lg p-4">
                        <h3 className="font-medium mb-2 text-center">Upload Dokumen Anjab (.doc)</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            Ekstrak otomatis dari dokumen Word <b>.doc</b> untuk ID: <b>{id}</b>. <i>.docx tidak didukung.</i>
                        </p>
                        <WordAnjab id={id} acceptExt=".doc" />
                    </div>

                    {/* Buat Manual */}
                    <div className="border rounded-lg p-4 flex">
                        <div className="m-auto text-center space-y-3">
                            <h3 className="font-medium">Buat Anjab Manual</h3>
                            <p className="text-sm text-gray-600">
                                Mulai dari form kosong. ID akan dikunci: <b>{id}</b>.
                            </p>
                            <Link
                                href={`/AnjabCreate/${encodeURIComponent(id)}`}
                                className="inline-block rounded bg-green-600 text-white px-4 py-2 hover:bg-green-700"
                            >
                                + Buat Anjab Manual
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // === OK → tampilkan PDF dari blob; non-admin tidak melihat tombol Edit
    return (
        <>
            {/* Bar atas tipis */}
            <div
                style={{
                    padding: 12,
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    alignItems: "center",
                }}
            >
                {pdfSrc && (
                    <a
                        href={pdfSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border px-3 py-1.5 hover:bg-gray-50"
                    >
                        Buka di halaman baru
                    </a>
                )}

                {isAdmin && (
                    <Link
                        href={editHref}
                        className="rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700"
                    >
                        Edit Anjab
                    </Link>
                )}
            </div>

            {/* iframe full viewport height */}
            <div style={{ width: "100%", height: "100dvh" }}>
                {pdfSrc ? (
                    <iframe
                        src={pdfSrc}
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "none",
                            WebkitOverflowScrolling: "touch",
                        } as React.CSSProperties}
                        title={`Preview PDF - ${id}`}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                        Tidak ada konten.
                    </div>
                )}
            </div>
        </>
    );
}
