// src/app/(admin)/(others-pages)/AnjabEdit/_sections/bahan-kerja.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

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

    const addLeft = (after?: number) => {
        const nl = [...L];
        const idx = typeof after === "number" ? after + 1 : L.length;
        nl.splice(idx, 0, "");
        sync(nl, R);
        setTimeout(() => leftRefs.current[idx]?.focus(), 0);
    };
    const removeLeft = (i: number) => sync(L.filter((_, x) => x !== i), R);
    const updateLeft = (i: number, v: string) => { const nl = [...L]; nl[i] = v; sync(nl, R); };

    const addRight = (after?: number) => {
        const nr = [...R];
        const idx = typeof after === "number" ? after + 1 : R.length;
        nr.splice(idx, 0, "");
        sync(L, nr);
        setTimeout(() => rightRefs.current[idx]?.focus(), 0);
    };
    const removeRight = (i: number) => sync(L, R.filter((_, x) => x !== i));
    const updateRight = (i: number, v: string) => { const nr = [...R]; nr[i] = v; sync(L, nr); };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
                <label className="block text-sm font-medium mb-2">Bahan Kerja</label>
                <div className="space-y-2">
                    {L.map((val, i) => (
                        <div key={`L-${i}`} className="flex items-center gap-2">
                            <input
                                ref={(el) => (leftRefs.current[i] = el)}
                                type="text"
                                value={val ?? ""}
                                onChange={(e) => updateLeft(i, e.target.value)}
                                placeholder="Bahan Kerja (mis. Data keuangan)"
                                className="flex-1 rounded border px-3 py-2"
                            />
                            <button type="button" onClick={() => addLeft(i)} className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700" title="Tambah item di bawah">+</button>
                            <button type="button" onClick={() => removeLeft(i)} className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700" title="Hapus item ini">✕</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addLeft()} className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700">
                        + Tambah Bahan Kerja
                    </button>
                </div>
            </div>

            <div className="md:col-span-6">
                <label className="block text-sm font-medium mb-2">Penggunaan dalam Tugas</label>
                <div className="space-y-2">
                    {R.map((val, i) => (
                        <div key={`R-${i}`} className="flex items-center gap-2">
                            <input
                                ref={(el) => (rightRefs.current[i] = el)}
                                type="text"
                                value={val ?? ""}
                                onChange={(e) => updateRight(i, e.target.value)}
                                placeholder="Penggunaan (mis. Penyusunan laporan)"
                                className="flex-1 rounded border px-3 py-2"
                            />
                            <button type="button" onClick={() => addRight(i)} className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700" title="Tambah item di bawah">+</button>
                            <button type="button" onClick={() => removeRight(i)} className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700" title="Hapus item ini">✕</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addRight()} className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700">
                        + Tambah Penggunaan
                    </button>
                </div>
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
            <div className="p-6 space-y-3">
                <p className="text-red-600">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                <p className="text-sm text-gray-600">
                    Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan, lalu kembali ke halaman ini.
                </p>
                <div className="flex items-center gap-3">
                    <button className="rounded border px-3 py-1.5" onClick={retry}>Coba lagi</button>
                    <Link href={`/anjab/${viewerPath}`} className="rounded border px-3 py-1.5">Kembali</Link>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-6">Memuat…</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between">
                <button type="button" onClick={addRow} className="rounded px-4 py-2 bg-green-600 text-white hover:bg-green-700">
                    + Tambah Item Bahan Kerja
                </button>
                <Link href={`/anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Bahan Kerja”.</p>
            )}

            {rows.map((row, idx) => {
                const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                return (
                    <div key={key} className="rounded border p-4 space-y-3">
                        <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                        <DualList
                            left={row.bahan_kerja ?? []}
                            right={row.penggunaan_dalam_tugas ?? []}
                            onChange={(L, R) => updateLocal(idx, { bahan_kerja: L, penggunaan_dalam_tugas: R })}
                        />

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => saveRow(idx)}
                                disabled={saving === row.id || saving === "new"}
                                className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {saving === row.id || saving === "new" ? "Menyimpan…" : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => deleteRow(idx)}
                                className="rounded px-4 py-2 border bg-red-50 hover:bg-red-100"
                            >
                                Hapus
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
