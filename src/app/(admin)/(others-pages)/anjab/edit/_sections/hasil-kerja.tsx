// src/app/(admin)/(others-pages)/AnjabEdit/_sections/hasil-kerja.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

/** ===== Tipe data mengikuti backend TANPA alias ===== */
type HasilKerjaItem = {
    id: number;               // SERIAL int; 0 = baris baru (belum tersimpan)
    jabatan_id: string;       // UUID
    hasil_kerja: string[];    // TEXT[]
    satuan_hasil: string[];   // TEXT[]
    _tmpKey?: string;         // key react lokal
};

/** ===== Dual list input - Enhanced Visual ===== */
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
            {/* LEFT: Hasil Kerja */}
            <div className="md:col-span-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Hasil Kerja
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
                                placeholder="Contoh: Dokumen Rencana Program"
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

            {/* RIGHT: Satuan Hasil */}
            <div className="md:col-span-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Satuan Hasil
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
                                placeholder="Contoh: Dokumen, Laporan"
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

/** ===== Section: Hasil Kerja (pakai UUID dari localStorage) ===== */
export default function HasilKerjaForm({
                                           viewerPath, // contoh: "Ortala/PKSTI"
                                       }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>("");
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<HasilKerjaItem[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const firstRef = useRef<HTMLInputElement>(null);

    // Resolve ID dari localStorage: 2 segmen terakhir viewerPath
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    // 1) Resolve saat mount / viewerPath berubah
    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    // 2) Fetch list
    const fetchAll = async (jabatanId: string) => {
        if (!jabatanId) {
            console.warn("[hasil-kerja] fetchAll called with empty jabatanId");
            setLoading(false);
            return;
        }
        
        console.log("[hasil-kerja] fetchAll start:", jabatanId);
        setLastError(null);
        setLoading(true);
        try {
            const url = `/api/anjab/${encodeURIComponent(jabatanId)}/hasil-kerja`;
            console.log("[hasil-kerja] fetching:", url);
            const res = await apiFetch(url, { cache: "no-store" });
            console.log("[hasil-kerja] response:", res.status, res.ok);
            
            if (!res.ok) {
                setRows([]);
                setLastError(`Gagal memuat Hasil Kerja (HTTP ${res.status}).`);
                return;
            }
            const raw = await res.json();
            console.log("[hasil-kerja] raw data:", raw);
            
            const normalized: HasilKerjaItem[] = Array.isArray(raw)
                ? raw.map((r: any, i: number) => ({
                    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
                    jabatan_id: typeof r?.jabatan_id === "string" ? r.jabatan_id : jabatanId,
                    hasil_kerja: Array.isArray(r?.hasil_kerja) ? r.hasil_kerja : [],
                    satuan_hasil: Array.isArray(r?.satuan_hasil) ? r.satuan_hasil : [],
                    _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`,
                }))
                : [];
            console.log("[hasil-kerja] normalized:", normalized);
            setRows(normalized);
            setTimeout(() => firstRef.current?.focus(), 0);
        } catch (err) {
            console.error("[hasil-kerja] fetch error:", err);
            setRows([]);
            setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            console.log("[hasil-kerja] fetchAll done");
            setLoading(false);
        }
    };

    // 3) Trigger fetch berdasarkan hasil resolve
    useEffect(() => {
        console.log("[hasil-kerja] useEffect: resolvedId=", resolvedId, "exists=", storageInfo.exists);
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                console.log("[hasil-kerja] storage key not found");
                setLoading(false);
                setRows([]);
                setLastError("__NOT_FOUND_KEY__");
                return;
            }
            if (!resolvedId) {
                console.log("[hasil-kerja] no resolvedId yet");
                setLoading(false);
                return;
            }
            if (!alive) return;
            console.log("[hasil-kerja] calling fetchAll...");
            await fetchAll(resolvedId);
        })();
        return () => { 
            alive = false;
            console.log("[hasil-kerja] useEffect cleanup");
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedId, storageInfo.exists]);

    // Helpers UI
    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [
            ...prev,
            { id: 0, jabatan_id: resolvedId, hasil_kerja: [""], satuan_hasil: [], _tmpKey: tmpKey },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }
    function updateLocal(idx: number, patch: Partial<HasilKerjaItem>) {
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
            hasil_kerja: it.hasil_kerja ?? [],
            satuan_hasil: it.satuan_hasil ?? [],
        };

        setSaving(it.id > 0 ? it.id : "new");
        try {
            if (it.id > 0) {
                // PATCH
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja/${it.id}`,
                    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? it.id,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    hasil_kerja: Array.isArray(json.data?.hasil_kerja) ? json.data.hasil_kerja : [],
                    satuan_hasil: Array.isArray(json.data?.satuan_hasil) ? json.data.satuan_hasil : [],
                });
            } else {
                // POST
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? 0,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    hasil_kerja: Array.isArray(json.data?.hasil_kerja) ? json.data.hasil_kerja : [],
                    satuan_hasil: Array.isArray(json.data?.satuan_hasil) ? json.data.satuan_hasil : [],
                });
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Hasil Kerja disimpan." });
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
            title: "Hapus Hasil Kerja?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja/${it.id}`,
                    { method: "DELETE" }
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Hasil Kerja dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // ===== UI: key localStorage tidak ada =====
    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <EditSectionWrapper
                title="Hasil Kerja"
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
                            Buka halaman create terlebih dahulu atau pastikan hasil kerja pernah dibuat sehingga ID tersimpan,
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
                title="Hasil Kerja"
                description="Memuat data hasil kerja..."
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
            title="Hasil Kerja"
            description="Edit hasil kerja dan satuan hasil untuk jabatan ini"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            }
        >
            <div className="space-y-6">
                {rows.length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Belum ada hasil kerja yang ditambahkan</p>
                        <button
                            type="button"
                            onClick={addRow}
                            className="px-6 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors inline-flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                        </button>
                    </div>
                ) : (
                    <>
                        {rows.map((row, idx) => {
                            const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                            return (
                                <FormSection key={key} title={`Hasil Kerja ${idx + 1}`}>
                                    <DualList
                                        left={row.hasil_kerja ?? []}
                                        right={row.satuan_hasil ?? []}
                                        onChange={(L, R) => updateLocal(idx, { hasil_kerja: L, satuan_hasil: R })}
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
                            Tambah
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
