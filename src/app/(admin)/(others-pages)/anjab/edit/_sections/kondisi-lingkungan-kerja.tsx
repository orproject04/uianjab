"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type KondisiRow = {
    id: number;            // SERIAL
    jabatan_id: string;    // UUID
    aspek: string;
    faktor: string;
    _tmpKey?: string;
};

export default function KondisiLingkunganKerjaForm({
                                                       id,            // TIDAK dipakai; UUID diambil dari localStorage
                                                       viewerPath,    // contoh: "setjen/depmin-okk"
                                                   }: {
    id: string;
    viewerPath: string;
}) {
    const [storageKey, setStorageKey] = useState<string>("");
    const [resolvedId, setResolvedId] = useState<string>("");
    const [hasKey, setHasKey] = useState<boolean>(true);

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<KondisiRow[]>([]);
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
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kondisi-lingkungan-kerja`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const data: KondisiRow[] = Array.isArray(json)
                    ? json.map((r: any, i: number) => ({
                        id: Number(r?.id) || 0,
                        jabatan_id: String(r?.jabatan_id ?? resolvedId),
                        aspek: String(r?.aspek ?? ""),
                        faktor: String(r?.faktor ?? ""),
                        _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`
                    }))
                    : [];
                setRows(data);
                setTimeout(() => firstRef.current?.focus(), 0);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Kondisi Lingkungan Kerja." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [hasKey, resolvedId]);

    const retry = () => resolveFromStorage(viewerPath);

    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [...prev, { id: 0, jabatan_id: resolvedId, aspek: "", faktor: "", _tmpKey: tmpKey }]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    function updateLocal(idx: number, patch: Partial<KondisiRow>) {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            aspek: String(it.aspek ?? "").trim(),
            faktor: String(it.faktor ?? "").trim(),
        };
        if (!payload.aspek) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Aspek wajib diisi." });
            return;
        }

        setSaving(it.id > 0 ? it.id : "new");
        try {
            let res: Response;
            if (it.id > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kondisi-lingkungan-kerja/${it.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kondisi-lingkungan-kerja`, {
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
                aspek: String(json.data?.aspek ?? ""),
                faktor: String(json.data?.faktor ?? ""),
            });
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Kondisi Lingkungan Kerja disimpan." });
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
            title: "Hapus Kondisi?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kondisi-lingkungan-kerja/${it.id}`, { method: "DELETE" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Kondisi dihapus." });
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
                title="Kondisi Lingkungan Kerja"
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
                title="Kondisi Lingkungan Kerja"
                description="Memuat data kondisi lingkungan kerja..."
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            }
            title="Kondisi Lingkungan Kerja"
            description="Kelola informasi kondisi lingkungan kerja untuk jabatan ini"
        >
            {rows.length === 0 ? (
                <div className="text-center py-12 px-4">
                    <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Belum ada kondisi lingkungan kerja yang ditambahkan
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Tambahkan kondisi lingkungan kerja untuk jabatan ini
                    </p>
                    <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Kondisi Lingkungan Kerja
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {rows.map((row, idx) => {
                        const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                        return (
                            <FormSection key={key} title={`Kondisi Lingkungan Kerja ${idx + 1}`}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Aspek <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            ref={idx === rows.length - 1 ? firstRef : undefined}
                                            type="text"
                                            value={row.aspek ?? ""}
                                            onChange={(e) => updateLocal(idx, { aspek: e.target.value })}
                                            placeholder="Mis. Kebisingan, Pencahayaan, Temperatur"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Faktor
                                        </label>
                                        <input
                                            type="text"
                                            value={row.faktor ?? ""}
                                            onChange={(e) => updateLocal(idx, { faktor: e.target.value })}
                                            placeholder="Mis. 75 dB(A), 500 lux"
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
                        Tambah Kondisi Lingkungan Kerja Baru
                    </button>
                </div>
            )}

        </EditSectionWrapper>
    );
}
