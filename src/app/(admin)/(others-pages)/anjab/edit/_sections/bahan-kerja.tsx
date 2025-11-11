// src/app/(admin)/(others-pages)/AnjabEdit/_sections/bahan-kerja.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type BahanKerjaRow = {
    id: number;                        // SERIAL (backend kolom "id")
    jabatan_id: string;                // UUID (backend kolom "jabatan_id")
    bahan_kerja: string[];
    penggunaan_dalam_tugas: string[];
    _tmpKey?: string;                  // hanya untuk key react lokal
};

function DualList({
                      left,
                      right,
                      onChange,
                  }: {
    left: string[];
    right: string[];
    onChange: (nextLeft: string[], nextRight: string[]) => void;
}) {
    const [L, setL] = useState<string[]>(left ?? []);
    const [R, setR] = useState<string[]>(right ?? []);
    const leftRefs = useRef<Array<HTMLInputElement | null>>([]);
    const rightRefs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setL(left ?? []); }, [left]);
    useEffect(() => { setR(right ?? []); }, [right]);

    const sync = (nl: string[], nr: string[]) => { setL(nl); setR(nr); onChange(nl, nr); };

    // LEFT ops
    const addLeft = (after?: number) => {
        const nl = [...L];
        const idx = typeof after === "number" ? after + 1 : L.length;
        nl.splice(idx, 0, "");
        sync(nl, R);
        setTimeout(() => leftRefs.current[idx]?.focus(), 0);
    };
    const removeLeft = (i: number) => {
        if (L.length <= 1) return; // Minimal 1 item
        sync(L.filter((_, x) => x !== i), R);
    };
    const updateLeft = (i: number, v: string) => {
        const nl = [...L]; nl[i] = v; sync(nl, R);
    };
    const handleLeftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addLeft(i);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && L[i] === "" && L.length > 1) {
            e.preventDefault();
            removeLeft(i);
        }
    };

    // RIGHT ops
    const addRight = (after?: number) => {
        const nr = [...R];
        const idx = typeof after === "number" ? after + 1 : R.length;
        nr.splice(idx, 0, "");
        sync(L, nr);
        setTimeout(() => rightRefs.current[idx]?.focus(), 0);
    };
    const removeRight = (i: number) => {
        if (R.length <= 1) return; // Minimal 1 item
        sync(L, R.filter((_, x) => x !== i));
    };
    const updateRight = (i: number, v: string) => {
        const nr = [...R]; nr[i] = v; sync(L, nr);
    };
    const handleRightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addRight(i);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && R[i] === "" && R.length > 1) {
            e.preventDefault();
            removeRight(i);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* LEFT: Bahan Kerja */}
            <div className="md:col-span-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Bahan Kerja
                </label>
                <div className="space-y-2">
                    {L.map((val, i) => (
                        <div key={`L-${i}`} className="flex gap-2">
                            <input
                                ref={(el) => { leftRefs.current[i] = el; }}
                                type="text"
                                value={val ?? ""}
                                onChange={(e) => updateLeft(i, e.target.value)}
                                onKeyDown={(e) => handleLeftKeyDown(e, i)}
                                placeholder="Contoh: Data keuangan"
                                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                            />
                            <button
                                type="button"
                                onClick={() => removeLeft(i)}
                                disabled={L.length <= 1}
                                title="Hapus baris"
                                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => addLeft()}
                    className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah
                </button>
            </div>

            {/* RIGHT: Penggunaan dalam Tugas */}
            <div className="md:col-span-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Penggunaan dalam Tugas
                </label>
                <div className="space-y-2">
                    {R.map((val, i) => (
                        <div key={`R-${i}`} className="flex gap-2">
                            <input
                                ref={(el) => { rightRefs.current[i] = el; }}
                                type="text"
                                value={val ?? ""}
                                onChange={(e) => updateRight(i, e.target.value)}
                                onKeyDown={(e) => handleRightKeyDown(e, i)}
                                placeholder="Contoh: Penyusunan laporan"
                                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                            />
                            <button
                                type="button"
                                onClick={() => removeRight(i)}
                                disabled={R.length <= 1}
                                title="Hapus baris"
                                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => addRight()}
                    className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah
                </button>
            </div>
        </div>
    );
}

export default function BahanKerjaForm({ viewerPath }: { viewerPath: string }) {
    const [resolvedId, setResolvedId] = useState<string>("");
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({ storageKey: "", exists: false, value: "" });

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<BahanKerjaRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const firstRef = useRef<HTMLInputElement>(null);

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

    const fetchAll = async (jabatanId: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(jabatanId)}/bahan-kerja`, { cache: "no-store" });
            if (!res.ok) {
                setRows([]);
                setLastError(`Gagal memuat Bahan Kerja (HTTP ${res.status}).`);
                return;
            }
            const raw = await res.json();
            const normalized: BahanKerjaRow[] = Array.isArray(raw)
                ? raw.map((r: any, i: number) => ({
                    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
                    jabatan_id: typeof r?.jabatan_id === "string" ? r.jabatan_id : jabatanId,
                    bahan_kerja: Array.isArray(r?.bahan_kerja) ? r.bahan_kerja : [],
                    penggunaan_dalam_tugas: Array.isArray(r?.penggunaan_dalam_tugas) ? r.penggunaan_dalam_tugas : [],
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
    };

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

    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [
            ...prev,
            { id: 0, jabatan_id: resolvedId, bahan_kerja: [""], penggunaan_dalam_tugas: [], _tmpKey: tmpKey },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }
    function updateLocal(idx: number, patch: Partial<BahanKerjaRow>) {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }
    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            bahan_kerja: it.bahan_kerja ?? [],
            penggunaan_dalam_tugas: it.penggunaan_dalam_tugas ?? [],
        };

        setSaving(it.id > 0 ? it.id : "new");
        try {
            if (it.id > 0) {
                // PATCH item (pakai kolom "id")
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/bahan-kerja/${it.id}`,
                    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? it.id,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    bahan_kerja: Array.isArray(json.data?.bahan_kerja) ? json.data.bahan_kerja : [],
                    penggunaan_dalam_tugas: Array.isArray(json.data?.penggunaan_dalam_tugas) ? json.data.penggunaan_dalam_tugas : [],
                });
            } else {
                // POST create
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/bahan-kerja`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? 0,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    bahan_kerja: Array.isArray(json.data?.bahan_kerja) ? json.data.bahan_kerja : [],
                    penggunaan_dalam_tugas: Array.isArray(json.data?.penggunaan_dalam_tugas) ? json.data.penggunaan_dalam_tugas : [],
                });
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Bahan Kerja disimpan." });
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
            title: "Hapus Bahan Kerja?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/bahan-kerja/${it.id}`,
                    { method: "DELETE" }
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Bahan Kerja dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // Jika UUID tidak ditemukan di localStorage → tampilkan info (tidak memanggil API)
    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <EditSectionWrapper
                title="Bahan Kerja"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
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
                title="Bahan Kerja"
                description="Memuat data bahan kerja..."
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
            title="Bahan Kerja"
            description="Edit bahan kerja dan penggunaan dalam tugas untuk jabatan ini"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            }
        >
            <div className="space-y-6">
                {rows.length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Belum ada bahan kerja yang ditambahkan</p>
                        <button
                            type="button"
                            onClick={addRow}
                            className="px-6 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors inline-flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah Bahan Kerja
                        </button>
                    </div>
                ) : (
                    <>
                        {rows.map((row, idx) => {
                            const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                            return (
                                <FormSection key={key} title={`Bahan Kerja ${idx + 1}`}>
                                    <DualList
                                        left={row.bahan_kerja ?? []}
                                        right={row.penggunaan_dalam_tugas ?? []}
                                        onChange={(L, R) => updateLocal(idx, { bahan_kerja: L, penggunaan_dalam_tugas: R })}
                                    />

                                    <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                                        <button
                                            type="button"
                                            onClick={() => saveRow(idx)}
                                            disabled={saving === row.id || saving === "new"}
                                            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                        >
                                            {saving === row.id || saving === "new" ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Menyimpan...
                                                </>
                                            ) : (
                                                "Simpan"
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(idx)}
                                            className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </FormSection>
                            );
                        })}
                        
                        <button
                            type="button"
                            onClick={addRow}
                            className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah Bahan Kerja Baru
                        </button>
                    </>
                )}

                <FormActions>
                    <Link 
                        href={`/anjab/${viewerPath}`} 
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Kembali
                    </Link>
                </FormActions>
            </div>
        </EditSectionWrapper>
    );
}
