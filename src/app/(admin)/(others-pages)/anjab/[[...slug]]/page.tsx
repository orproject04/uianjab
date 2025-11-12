"use client";

import Link from "next/link";
import {useParams} from "next/navigation";
import React, {useEffect, useMemo, useState} from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import {apiFetch} from "@/lib/apiFetch";
import Button from "@/components/ui/button/Button";
import AnjabBreadcrumb from "@/components/common/AnjabBreadcrumb";
import JabatanInfoCard from "@/components/common/JabatanInfoCard";
import {titleCase, slugToTitle} from "@/lib/text-utils";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

type Status = "idle" | "loading" | "ok" | "notfound" | "error";
type TabType = "info" | "pdf";

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

    // Ambil slug (bisa undefined saat /anjab)
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
        return `/anjab/edit/jabatan/${fullPath}`;
    }, [rawSlug]);

    // Blob URL + blob + filename
    const [pdfSrc, setPdfSrc] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [activeTab, setActiveTab] = useState<TabType>("info");

    // Check URL param for tab preference on mount and update
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam === 'pdf') {
            setActiveTab('pdf');
        }
    }, []);

    // Also check when status or pdfSrc changes
    useEffect(() => {
        if (status === "ok" && pdfSrc) {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam === 'pdf') {
                setActiveTab('pdf');
            }
        }
    }, [status, pdfSrc]);

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

    // Handler hapus jabatan (admin only)
    const handleDelete = async () => {
        if (!isAdmin || !id) return;

        // Ambil UUID dari localStorage
        const slugForUrl = id.replace(/-/g, "/");
        const uuid = localStorage.getItem(slugForUrl);

        if (!uuid) {
            await MySwal.fire({
                title: "Error!",
                text: "UUID jabatan tidak ditemukan. Silakan refresh halaman dan coba lagi.",
                icon: "error",
                confirmButtonColor: "#dc2626"
            });
            return;
        }

        const result = await MySwal.fire({
            title: "Hapus Dokumen Anjab?",
            html: `
                <div style="text-align: left;">
                    <p>Anda akan menghapus dokumen analisis jabatan untuk:</p>
                    <p style="font-weight: bold; color: #1f2937; margin: 12px 0; padding: 8px; background: #f3f4f6; border-radius: 4px;">
                        ${slugToTitle(id)}
                    </p>
                    <p style="color: #dc2626; font-size: 14px;">
                        <strong>Perhatian:</strong> Tindakan ini akan menghapus semua data dokumen anjab namun tidak menghapus jabatan dari sistem.
                    </p>
                </div>
            `,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Ya, Hapus Anjab",
            cancelButtonText: "Batal",
            focusCancel: true,
            customClass: {
                confirmButton: "px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700",
                cancelButton: "px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            }
        });

        if (!result.isConfirmed) return;

        try {
            // Gunakan UUID yang valid untuk DELETE request
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(uuid)}`, {
                method: "DELETE",
                cache: "no-store",
            });

            if (res.ok) {
                // Hapus UUID dari localStorage setelah berhasil dihapus
                localStorage.removeItem(slugForUrl);

                await MySwal.fire({
                    title: "Berhasil!",
                    text: "Dokumen anjab berhasil dihapus.",
                    icon: "success",
                    confirmButtonColor: "#059669"
                });
                window.location.href = "/anjab";
            } else {
                const error = await res.json().catch(() => ({}));
                await MySwal.fire({
                    title: "Gagal!",
                    text: error?.error || "Gagal menghapus dokumen anjab",
                    icon: "error",
                    confirmButtonColor: "#dc2626"
                });
            }
        } catch (error) {
            console.error("Error deleting anjab:", error);
            await MySwal.fire({
                title: "Error!",
                text: "Terjadi kesalahan saat menghapus dokumen anjab",
                icon: "error",
                confirmButtonColor: "#dc2626"
            });
        }
    };

    // === Tanpa slug/id ===
    if (!id) {
        return (
            <div className="pt-16 p-8 max-w-xl mx-auto text-center space-y-4">
                <AnjabBreadcrumb currentId="" currentTitle="Analisis Jabatan" rawSlug={[]} />
                <p className="text-gray-700">Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading" || status === "idle") {
        return (
            <div className="pt-16">
                <div className="px-6 py-3 border-b border-gray-200">
                    <AnjabBreadcrumb currentId={id} currentTitle={slugToTitle(id)} rawSlug={rawSlug} />
                </div>

                {/* Tab Navigation - Loading State */}
                <div className="px-6 py-0 space-x-8 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab("info")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === "info"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Informasi Jabatan
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab("pdf")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === "pdf"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Dokumen PDF
                                <div className="inline-flex items-center justify-center w-4 h-4">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                </div>
                            </div>
                        </button>
                    </nav>

                </div>

                {/* Loading Content */}
                <div className="p-6">
                    {activeTab === "info" && <JabatanInfoCard currentId={id} className="mb-6" />}
                    {activeTab === "pdf" && (
                        <div className="flex items-center justify-center h-96">
                            <div className="text-center space-y-3">
                                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                <p className="text-gray-500">Loading PDF...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === NOT FOUND / ERROR
    if (status === "notfound" || status === "error") {
        const isNotFound = status === "notfound";

        // Non-admin: pesan sederhana (tanpa aksi)
        if (!isAdmin) {
            return (
                <div className="pt-16">
                    <div className="px-6 py-3 border-b border-gray-200">
                        <AnjabBreadcrumb currentId={id} currentTitle={slugToTitle(id)} rawSlug={rawSlug} />
                    </div>

                    {/* Tab Navigation - Error State */}
                    <div className="px-6 py-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <nav className="flex space-x-8">
                            <button
                                onClick={() => setActiveTab("info")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                    activeTab === "info"
                                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                        : "border-transparent text-gray-500"
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Informasi Jabatan
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab("pdf")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                    activeTab === "pdf"
                                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                        : "border-transparent text-gray-500"
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Dokumen PDF
                                    <span className="inline-flex items-center justify-center w-2 h-2 bg-red-500 rounded-full"></span>
                                </div>
                            </button>
                        </nav>
                    </div>

                    <div className="p-6">
                        {activeTab === "info" && <JabatanInfoCard currentId={id} className="mb-6" />}
                        <div className="w-full min-h-[calc(100dvh-400px)] flex items-center justify-center">
                            <div className="max-w-3xl text-center space-y-3">
                                <p className={isNotFound ? "text-gray-800" : "text-red-700"}>
                                    {isNotFound ? (
                                        <>
                                            Data tidak ditemukan untuk <b>{slugToTitle(id)}</b>.
                                        </>
                                    ) : (
                                        <>
                                            Terjadi kesalahan saat memuat data <b>{slugToTitle(id)}</b>. Coba lagi nanti.
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
                    </div>
                </div>
            );
        }

        // Admin: tampilkan opsi unggah/buat manual
        return (
            <div className="pt-16">
                <div className="px-6 py-3 border-b border-gray-200">
                    <AnjabBreadcrumb currentId={id} currentTitle={slugToTitle(id)} rawSlug={rawSlug} />
                </div>

                {/* Tab Navigation - Admin Error State */}
                <div className="px-6 py-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab("info")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === "info"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Informasi Jabatan
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab("pdf")}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === "pdf"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500"
                            }`}
                            disabled
                        >
                            <div className="flex items-center gap-2 opacity-50">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Dokumen PDF
                                <span className="inline-flex items-center justify-center w-2 h-2 bg-red-500 rounded-full"></span>
                            </div>
                        </button>
                    </nav>
                </div>

                <div className="p-8 max-w-5xl mx-auto space-y-6">
                    <JabatanInfoCard currentId={id} />

                    <div className="text-center space-y-2">
                        <p className={isNotFound ? "text-gray-800" : "text-red-700"}>
                            {isNotFound ? (
                                <>Data tidak ditemukan untuk <b>{slugToTitle(id)}</b>.</>
                            ) : (
                                <>Terjadi kesalahan saat memuat data <b>{slugToTitle(id)}</b>. Coba lagi nanti.</>
                            )}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Upload Word (.doc saja) */}
                        <div className="border rounded-lg p-4">
                            <h3 className="font-medium mb-2 text-center">Upload Dokumen Anjab (.doc)</h3>
                            <WordAnjab id={id}/>
                        </div>

                        {/* Buat Manual */}
                        <div className="border rounded-lg p-4 flex">
                            <div className="m-auto text-center space-y-3">
                                <Link href={`/anjab/create/${encodeURIComponent(id)}`}>
                                    <Button className="w-full" size="sm">
                                        Buat Anjab Baru
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // === OK → tampilkan dengan sistem tab
    return (
        <div className="pt-16">
            {/* Breadcrumb */}
            <div className="px-4 sm:px-6 py-3 border-b border-gray-200">
                <AnjabBreadcrumb currentId={id} currentTitle={slugToTitle(id)} rawSlug={rawSlug} />
            </div>

            {/* Tab Navigation */}
            <div className="px-4 sm:px-6 py-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                <div className="flex items-center justify-between gap-4">
                    <nav className="flex space-x-4 sm:space-x-8 min-w-max">
                        <button
                            onClick={() => setActiveTab("info")}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeTab === "info"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="hidden sm:inline">Informasi Jabatan</span>
                                <span className="sm:hidden">Info</span>
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab("pdf")}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                activeTab === "pdf"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="hidden sm:inline">Dokumen PDF</span>
                                <span className="sm:hidden">PDF</span>
                                {pdfSrc && (
                                    <span className="inline-flex items-center justify-center w-2 h-2 bg-green-500 rounded-full"></span>
                                )}
                            </div>
                        </button>
                    </nav>

                    {/* Admin Action Buttons */}
                    {isAdmin && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Link
                                href={editHref}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors whitespace-nowrap"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span className="hidden sm:inline">Edit Anjab</span>
                                <span className="sm:hidden">Edit</span>
                            </Link>
                            <button
                                onClick={handleDelete}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm outline-1 outline-red-700 bg-white text-red-700 rounded hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span className="hidden sm:inline">Hapus Anjab</span>
                                <span className="sm:hidden">Hapus</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === "info" && (
                <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-[calc(100dvh-200px)]">
                    <div className="max-w-4xl mx-auto">
                        {/* Jabatan Info Card */}
                        <JabatanInfoCard currentId={id} />
                    </div>
                </div>
            )}

            {activeTab === "pdf" && (
                <div className="bg-white dark:bg-gray-800">
                    {/* PDF Action Bar */}
                    <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                    {fileName || fallbackNiceName}
                                </span>
                                {pdfSrc && (
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex-shrink-0">
                                        PDF Tersedia
                                    </span>
                                )}
                            </div>

                            {pdfSrc && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <a
                                        href={pdfSrc}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm outline-1 outline-purple-700 bg-white text-black rounded hover:bg-purple-200 transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        <span className="hidden sm:inline">Full Screen</span>
                                        <span className="sm:hidden">Layar Penuh</span>
                                    </a>
                                    <button
                                        onClick={handleDownload}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="hidden sm:inline">Unduh PDF</span>
                                        <span className="sm:hidden">Unduh</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PDF Viewer */}
                    <div className="relative w-full" style={{
                        height: "calc(100vh - var(--header-height) - 120px)", // Dynamic height considering header and tab bars
                        minHeight: "400px"
                    }}>
                        {pdfSrc ? (
                            <iframe
                                src={pdfSrc}
                                className="w-full h-full border-0"
                                style={{
                                    WebkitOverflowScrolling: "touch",
                                } as React.CSSProperties}
                                title={`Preview PDF - ${slugToTitle(id)}`}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                                <div className="text-center space-y-3">
                                    <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-lg font-medium">Dokumen PDF tidak tersedia</p>
                                    <p className="text-sm">Silakan hubungi administrator untuk mengunggah dokumen</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}