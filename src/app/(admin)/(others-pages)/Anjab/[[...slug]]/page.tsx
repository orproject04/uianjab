"use client";

import Link from "next/link";
import {useParams} from "next/navigation";
import React, {useEffect, useMemo, useState} from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import {apiFetch} from "@/lib/apiFetch";

type Status = "idle" | "loading" | "ok" | "notfound" | "error";

function titleCase(s: string) {
    return s
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
}

// Parse filename dari header Content-Disposition
function parseContentDispositionFilename(cd: string | null): string | null {
    if (!cd) return null;

    // filename*=UTF-8''encoded
    const mStar = cd.match(/filename\*\s*=\s*([^']+)''([^;]+)/i);
    if (mStar && mStar[2]) {
        try {
            return decodeURIComponent(mStar[2].trim());
        } catch {
            // ignore
        }
    }

    // filename="..."/filename=...
    const m = cd.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    if (m) return (m[1] || m[2] || "").trim();

    return null;
}

export default function InformasiJabatanPage() {
    const params = useParams();

    // ---- ambil role user (untuk hide tombol non-admin)
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await apiFetch("/api/auth/me", {method: "GET", cache: "no-store"});
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

    // Filename cantik fallback (kalau header tidak ada)
    const fallbackNiceName = useMemo(() => {
        if (!id) return "Anjab.pdf";
        const words = id.replace(/-/g, " ");
        return `Anjab ${titleCase(words)}.pdf`;
    }, [id]);

    // href edit: pakai full path (/)
    const editHref = useMemo(() => {
        if (rawSlug.length === 0) return "#";
        const fullPath = rawSlug.join("/"); // contoh: "A/B/C/D"
        return `/AnjabEdit/jabatan/${fullPath}`;
    }, [rawSlug]);

    // Blob URL + blob + filename
    const [pdfSrc, setPdfSrc] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>("idle");

    // === resolve UUID jabatan dari slug (2 segmen terakhir) & simpan ke localStorage — HANYA untuk admin ===
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!id || !isAdmin) return; // <— hanya admin
            try {
                const res = await apiFetch(`/api/anjab/${encodedId}/uuid`, {method: "GET", cache: "no-store"});
                if (!res.ok) return;
                const data = await res.json();
                const createdId = data?.id ?? null;
                if (!cancelled && createdId && typeof window !== "undefined") {
                    const slugForUrl = id.replace(/-/g, "/");
                    // Simpan agar komponen lain bisa baca
                    localStorage.setItem(slugForUrl, String(createdId));
                }
            } catch {
                // diamkan bila gagal
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, encodedId, isAdmin]);

    // Ambil PDF (GET) → blob → objectURL — pakai apiFetch (bawa Authorization header), TANPA cookie & TANPA ?auth
    useEffect(() => {
        let alive = true;
        let currentUrl: string | null = null;

        async function loadPdf() {
            if (!id) {
                if (alive) {
                    setPdfSrc(null);
                    setPdfBlob(null);
                    setFileName(null);
                    setStatus("notfound");
                }
                return;
            }

            try {
                if (alive) {
                    setStatus("loading");
                    setPdfSrc(null);
                    setPdfBlob(null);
                    setFileName(null);
                }

                const res = await apiFetch(`/api/anjab/${encodedId}/pdf`, {
                    method: "GET",
                    cache: "no-store",
                    // (opsional) pastikan Accept PDF
                    headers: {Accept: "application/pdf"},
                });

                if (!alive) return;

                if (res.ok) {
                    // Ambil filename dari header
                    const cd = res.headers.get("Content-Disposition");
                    const parsedName = parseContentDispositionFilename(cd);
                    const niceName = parsedName || fallbackNiceName;

                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);

                    currentUrl = url;
                    if (alive) {
                        setPdfBlob(blob);
                        setPdfSrc(url);
                        setFileName(niceName);
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
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [id, encodedId, fallbackNiceName]);

    // Handler unduh dengan nama file cantik
    const handleDownload = () => {
        if (!pdfSrc) return;
        const a = document.createElement("a");
        a.href = pdfSrc;                // pakai blob URL yang sama
        a.download = fileName || fallbackNiceName; // kontrol nama file
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // === Tanpa slug/id ===
    if (!id) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center space-y-4">
                <p className="text-gray-700">Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading" || status === "idle") {
        return <p style={{padding: 20}}>Loading...</p>;
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
                        Silakan memilih antara <b>mengunggah dokumen Anjab berformat .doc </b>
                        atau <b>membuat Anjab secara manual</b>.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Upload Word (.doc saja) */}
                    <div className="border rounded-lg p-4">
                        <h3 className="font-medium mb-2 text-center">Upload Dokumen Anjab (.doc)</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            Ekstrak otomatis dari dokumen Word <b>.doc</b> untuk <b>{id}</b>.
                        </p>
                        <WordAnjab id={id}/>
                    </div>

                    {/* Buat Manual */}
                    <div className="border rounded-lg p-4 flex">
                        <div className="m-auto text-center space-y-3">
                            <h3 className="font-medium">Buat Anjab Manual</h3>
                            <p className="text-sm text-gray-600">
                                Mulai dari form kosong.
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

    // === OK → tampilkan PDF dari blob; SEDIAKAN tombol "Unduh" (download attribute) agar nama file sesuai
    return (
        <>
            {/* Bar atas */}
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
                    <>
                        {/* Buka di tab baru (viewer bawaan mungkin tetap pakai nama default) */}
                        <a
                            href={pdfSrc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border px-3 py-1.5 hover:bg-gray-50"
                        >
                            Full Screen
                        </a>

                        {/* Tombol Unduh: memastikan nama file = header/fallback */}
                        <button
                            onClick={handleDownload}
                            className="rounded bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700"
                        >
                            Unduh PDF
                        </button>
                    </>
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
            <div style={{width: "100%", height: "100dvh"}}>
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
