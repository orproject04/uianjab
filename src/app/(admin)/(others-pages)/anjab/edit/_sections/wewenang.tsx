// src/app/(admin)/(others-pages)/AnjabEdit/_sections/wewenang.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type WewenangRow = {
    id: number;              // SERIAL dari DB
    jabatan_id: string;      // UUID
    uraian_wewenang: string; // TEXT
    _tmpKey?: string;        // untuk key lokal React
};

export default function WewenangForm({
                                         id,           // TIDAK dipakai; kita pakai UUID dari localStorage
                                         viewerPath,   // contoh: "setjen/depmin/okk"
                                     }: {
    id: string;
    viewerPath: string;
}) {
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({ storageKey: "", exists: false, value: "" });
    const [resolvedId, setResolvedId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<WewenangRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const firstRef = useRef<HTMLTextAreaElement>(null);

    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    async function fetchAll(jabatanId: string) {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(jabatanId)}/wewenang`, { cache: "no-store" });
            if (!res.ok) {
                setRows([]);
                setLastError(`Gagal memuat (HTTP ${res.status}).`);
                return;
            }
            const raw = await res.json();
            const normalized: WewenangRow[] = Array.isArray(raw)
                ? raw.map((r: any, i: number) => ({
                    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
                    jabatan_id: typeof r?.jabatan_id === "string" ? r.jabatan_id : jabatanId,
                    uraian_wewenang: String(r?.uraian_wewenang ?? ""),
                    _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`,
                }))
                : [];
            setRows(normalized);
            setTimeout(() => firstRef.current?.focus(), 0);
        } catch {
            setRows([]);
            setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                setLoading(false);
                setRows([]);
                setLastError("__NOT_FOUND_KEY__");
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => { alive = false; };
    }, [resolvedId, storageInfo.exists]);

    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [...prev, { id: 0, jabatan_id: resolvedId, uraian_wewenang: "", _tmpKey: tmpKey }]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    function updateLocal(idx: number, patch: Partial<WewenangRow>) {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = { uraian_wewenang: String(it.uraian_wewenang ?? "").trim() };
        if (!payload.uraian_wewenang) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Uraian wajib diisi." });
            return;
        }

        setSaving(it.id > 0 ? it.id : "new");
        try {
            if (it.id > 0) {
                // PATCH
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/wewenang/${it.id}`,
                    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? it.id,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    uraian_wewenang: String(json.data?.uraian_wewenang ?? ""),
                });
            } else {
                // POST
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/wewenang`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? 0,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    uraian_wewenang: String(json.data?.uraian_wewenang ?? ""),
                });
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Wewenang disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(null);
        }
    }

    async function deleteRow(idx: number) {
        const it = rows[idx];
        const ok = await MySwal.fire({
            icon: "warning",
            title: "Hapus Wewenang?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/wewenang/${it.id}`,
                    { method: "DELETE" }
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Wewenang dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // Bila UUID belum ada di localStorage â†’ Teks (bukan SweetAlert), sama dengan modul lain
    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <EditSectionWrapper
                title="Wewenang"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <div className="text-red-600 mb-4">
                        <p>ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                        <p className="text-sm text-gray-600 mt-2">
                            Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                            lalu kembali ke halaman ini.
                        </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                            onClick={retry}
                        >
                            Coba lagi
                        </button>
                        <Link 
                            href={`/anjab/${viewerPath}`} 
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Kembali
                        </Link>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    if (loading) {
        return (
            <EditSectionWrapper
                title="Wewenang"
                description="Memuat data wewenang..."
                icon={
                    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                }
            >
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Memuat data...</p>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            title="Wewenang"
            description="Kelola wewenang yang dimiliki oleh jabatan ini"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            }
        >
            {rows.length === 0 ? (
                <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 mb-4 text-gray-400">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Belum ada wewenang yang ditambahkan
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Mulai dengan menambahkan wewenang pertama untuk jabatan ini
                    </p>
                    <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Wewenang
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {rows.map((row, idx) => {
                        const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                        const isSaving = saving === row.id || saving === "new";

                        return (
                            <FormSection key={key} title={`Wewenang ${idx + 1}`}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Uraian Wewenang
                                        </label>
                                        <textarea
                                            ref={idx === rows.length - 1 ? firstRef : undefined}
                                            value={row.uraian_wewenang ?? ""}
                                            onChange={(e) => updateLocal(idx, { uraian_wewenang: e.target.value })}
                                            placeholder="Contoh: Menyetujui rencana kerja triwulanan dan mengalokasikan anggaran"
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-y"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => saveRow(idx)}
                                            disabled={isSaving}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSaving ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                                    Menyimpan...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Simpan
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(idx)}
                                            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                            </FormSection>
                        );
                    })}

                    <button
                        type="button"
                        onClick={addRow}
                        className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 dark:hover:border-brand-400 dark:hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Wewenang Baru
                    </button>
                </div>
            )}

            <FormActions>
                <Link
                    href={`/anjab/${viewerPath}`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Kembali
                </Link>
            </FormActions>
        </EditSectionWrapper>
    );
}
