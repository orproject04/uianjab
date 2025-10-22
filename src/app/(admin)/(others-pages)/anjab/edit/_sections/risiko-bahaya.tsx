"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type RisikoRow = {
    id: number;          // SERIAL
    jabatan_id: string;  // UUID
    nama_risiko: string;
    penyebab: string;
    _tmpKey?: string;    // untuk key local sementara
};

export default function RisikoBahayaForm({
                                             id,            // TIDAK dipakai (tetap ada agar kompatibel), UUID diambil dari localStorage
                                             viewerPath,    // contoh: "setjen/depmin-okk"
                                         }: {
    id: string;
    viewerPath: string;
}) {
    const [storageKey, setStorageKey] = useState<string>("");
    const [resolvedId, setResolvedId] = useState<string>("");
    const [hasKey, setHasKey] = useState<boolean>(true);

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<RisikoRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const firstRef = useRef<HTMLInputElement>(null);

    function resolveFromStorage(vpath: string) {
        const key = vpath.split("/").filter(Boolean).slice(-2).join("/");
        setStorageKey(key);
        try {
            const val = localStorage.getItem(key);
            if (!val) {
                setHasKey(false);
                setResolvedId("");
            } else {
                setHasKey(true);
                setResolvedId(val);
            }
        } catch {
            setHasKey(false);
            setResolvedId("");
        }
    }

    useEffect(() => { resolveFromStorage(viewerPath); }, [viewerPath]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!hasKey || !resolvedId) {
                setLoading(false);
                setRows([]);
                return;
            }
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/risiko-bahaya`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const data: RisikoRow[] = Array.isArray(json)
                    ? json.map((r: any, i: number) => ({
                        id: Number(r?.id) || 0,
                        jabatan_id: String(r?.jabatan_id ?? resolvedId),
                        nama_risiko: String(r?.nama_risiko ?? ""),
                        penyebab: String(r?.penyebab ?? ""),
                        _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`
                    }))
                    : [];
                setRows(data);
                setTimeout(() => firstRef.current?.focus(), 0);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Risiko Bahaya." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [hasKey, resolvedId]);

    const retry = () => resolveFromStorage(viewerPath);

    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [
            ...prev,
            { id: 0, jabatan_id: resolvedId, nama_risiko: "", penyebab: "", _tmpKey: tmpKey },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    function updateLocal(idx: number, patch: Partial<RisikoRow>) {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            nama_risiko: String(it.nama_risiko ?? "").trim(),
            penyebab: String(it.penyebab ?? "").trim(),
        };
        if (!payload.nama_risiko) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Nama risiko wajib diisi." });
            return;
        }

        setSaving(it.id > 0 ? it.id : "new");
        try {
            let res: Response;
            if (it.id > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/risiko-bahaya/${it.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/risiko-bahaya`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, {
                id: Number(json.data?.id) ?? it.id,
                jabatan_id: String(json.data?.jabatan_id ?? resolvedId),
                nama_risiko: String(json.data?.nama_risiko ?? ""),
                penyebab: String(json.data?.penyebab ?? ""),
            });
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Risiko Bahaya disimpan." });
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
            title: "Hapus Risiko?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/risiko-bahaya/${it.id}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Risiko dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    if (!hasKey || !resolvedId) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                }
                title="Risiko Bahaya"
                description="ID (UUID) untuk path ini belum ditemukan. Buka halaman create terlebih dahulu."
            >
                <div className="text-center py-8">
                    <p className="text-red-600 dark:text-red-400 mb-4">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                        lalu kembali ke halaman ini.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        <button 
                            onClick={retry}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Coba lagi
                        </button>
                        <Link 
                            href={`/anjab/${viewerPath}`} 
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                }
                title="Risiko Bahaya"
                description="Memuat data risiko bahaya..."
            >
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Memuat data...</p>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            }
            title="Risiko Bahaya"
            description="Kelola informasi risiko dan bahaya untuk jabatan ini"
        >
            {rows.length === 0 ? (
                <div className="text-center py-12 px-4">
                    <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Belum ada risiko bahaya yang ditambahkan
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Tambahkan risiko dan bahaya yang mungkin terjadi untuk jabatan ini
                    </p>
                    <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Risiko Bahaya
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {rows.map((row, idx) => {
                        const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                        return (
                            <FormSection key={key} title={`Risiko Bahaya ${idx + 1}`}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Nama Risiko <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            ref={idx === rows.length - 1 ? firstRef : undefined}
                                            type="text"
                                            value={row.nama_risiko ?? ""}
                                            onChange={(e) => updateLocal(idx, { nama_risiko: e.target.value })}
                                            placeholder="Mis. Paparan bahan kimia, Terpeleset"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Penyebab
                                        </label>
                                        <input
                                            type="text"
                                            value={row.penyebab ?? ""}
                                            onChange={(e) => updateLocal(idx, { penyebab: e.target.value })}
                                            placeholder="Mis. Kebocoran reagen, lantai licin"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => saveRow(idx)}
                                        disabled={saving === row.id || saving === "new"}
                                        className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                                    >
                                        {saving === row.id || saving === "new" ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
                                        className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors inline-flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Hapus
                                    </button>
                                </div>
                            </FormSection>
                        );
                    })}

                    <button
                        type="button"
                        onClick={addRow}
                        className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 dark:hover:border-brand-400 dark:hover:text-brand-400 transition-colors inline-flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Risiko Bahaya Baru
                    </button>
                </div>
            )}

        </EditSectionWrapper>
    );
}
