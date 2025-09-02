// src/app/(admin)/(others-pages)/Anjab/[[...slug]]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";

type Status = "loading" | "ok" | "notfound" | "error";

export default function InformasiJabatanPage() {
    const params = useParams();

    // ---- ambil role user (untuk hide tombol non-admin)
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
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
        return () => { alive = false; };
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

    // URL PDF langsung (bukan blob). Tambahkan hash agar fit horizontal.
    const pdfUrl = id ? `/api/anjab/${encodedId}/pdf#view=FitH` : "";

    const [status, setStatus] = useState<Status>("loading");

    // Cek ketersediaan PDF dengan HEAD (ringan & cepat).
    useEffect(() => {
        let alive = true;
        async function check() {
            if (!id) {
                if (alive) setStatus("notfound");
                return;
            }
            try {
                if (alive) setStatus("loading");
                const res = await fetch(`/api/anjab/${encodedId}/pdf`, {
                    method: "HEAD",
                    cache: "no-store",
                });
                if (!alive) return;
                if (res.ok) setStatus("ok");
                else if (res.status === 404) setStatus("notfound");
                else setStatus("error");
            } catch {
                if (alive) setStatus("error");
            }
        }
        check();
        return () => { alive = false; };
    }, [id, encodedId]);

    // === Tanpa slug/id ===
    if (!id) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center space-y-4">
                <p className="text-gray-700">Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading") {
        return <p style={{ padding: 20 }}>Loading...</p>;
    }

    // === NOT FOUND / ERROR
    if (status === "notfound" || status === "error") {
        const isNotFound = status === "notfound";

        // ---- Jika BUKAN admin: ganti pesan & sembunyikan semua aksi
// ---- Jika BUKAN admin: ganti pesan & center vertikal-horisontal
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

        // ---- Admin: tampilan lama (upload .doc & buat manual)
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

    // === OK → tampilkan PDF; non-admin tidak melihat tombol Edit
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
                <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border px-3 py-1.5 hover:bg-gray-50"
                >
                    Buka di halaman baru
                </a>

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
                <iframe
                    src={pdfUrl}
                    style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        WebkitOverflowScrolling: "touch",
                    } as React.CSSProperties}
                    title={`Preview PDF - ${id}`}
                />
            </div>
        </>
    );
}
