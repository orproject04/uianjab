"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type BahanKerjaRow = {
    id_bahan: number;
    id_jabatan: string;
    bahan_kerja: string[];             // TEXT[] (list mandiri)
    penggunaan_dalam_tugas: string[];  // TEXT[] (list mandiri)
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

    // LEFT ops (Bahan Kerja)
    const addLeft = (after?: number) => {
        const nl = [...L];
        const idx = typeof after === "number" ? after + 1 : L.length;
        nl.splice(idx, 0, "");
        sync(nl, R);
        setTimeout(() => leftRefs.current[idx]?.focus(), 0);
    };
    const removeLeft = (i: number) => sync(L.filter((_, x) => x !== i), R);
    const updateLeft = (i: number, v: string) => { const nl = [...L]; nl[i] = v; sync(nl, R); };

    // RIGHT ops (Penggunaan dalam Tugas)
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
            {/* LEFT LIST: Bahan Kerja */}
            <div className="md:col-span-6">
                <label className="block text-sm font-medium mb-2">Bahan Kerja</label>
                <div className="space-y-2">
                    {L.map((_, i) => (
                        <div key={`L-${i}`} className="flex items-center gap-2">
                            <input
                                ref={(el) => (leftRefs.current[i] = el)}
                                type="text"
                                value={L[i] ?? ""}
                                onChange={(e) => updateLeft(i, e.target.value)}
                                placeholder="Bahan Kerja (mis. Data keuangan)"
                                className="flex-1 rounded border px-3 py-2"
                            />
                            <button
                                type="button"
                                onClick={() => addLeft(i)}
                                className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700"
                                title="Tambah item di bawah"
                            >+</button>
                            <button
                                type="button"
                                onClick={() => removeLeft(i)}
                                className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                                title="Hapus item ini"
                            >✕</button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addLeft()}
                        className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700"
                    >
                        + Tambah Bahan Kerja
                    </button>
                </div>
            </div>

            {/* RIGHT LIST: Penggunaan dalam Tugas */}
            <div className="md:col-span-6">
                <label className="block text-sm font-medium mb-2">Penggunaan dalam Tugas</label>
                <div className="space-y-2">
                    {R.map((_, i) => (
                        <div key={`R-${i}`} className="flex items-center gap-2">
                            <input
                                ref={(el) => (rightRefs.current[i] = el)}
                                type="text"
                                value={R[i] ?? ""}
                                onChange={(e) => updateRight(i, e.target.value)}
                                placeholder="Penggunaan (mis. Penyusunan laporan)"
                                className="flex-1 rounded border px-3 py-2"
                            />
                            <button
                                type="button"
                                onClick={() => addRight(i)}
                                className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700"
                                title="Tambah item di bawah"
                            >+</button>
                            <button
                                type="button"
                                onClick={() => removeRight(i)}
                                className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                                title="Hapus item ini"
                            >✕</button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addRight()}
                        className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700"
                    >
                        + Tambah Penggunaan
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function BahanKerjaForm({
                                           id,
                                           viewerPath,
                                       }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<BahanKerjaRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/bahan-kerja`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Bahan Kerja." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_bahan: 0, id_jabatan: id, bahan_kerja: [""], penggunaan_dalam_tugas: [] },
        ]);
    }
    function updateLocal(idx: number, patch: Partial<BahanKerjaRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            bahan_kerja: it.bahan_kerja ?? [],
            penggunaan_dalam_tugas: it.penggunaan_dalam_tugas ?? [],
        };

        setSaving(it.id_bahan || "new");
        try {
            let res: Response;
            if (it.id_bahan > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/bahan-kerja/${it.id_bahan}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/bahan-kerja`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data);
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
            if (it.id_bahan > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/bahan-kerja/${it.id_bahan}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Bahan Kerja dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    if (loading) return <div className="p-6">Memuat…</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between">
                <button
                    type="button"
                    onClick={addRow}
                    className="rounded px-4 py-2 bg-green-600 text-white hover:bg-green-700"
                >
                    + Tambah Item Bahan Kerja
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Bahan Kerja”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_bahan ?? 0) + "-" + idx} className="rounded border p-4 space-y-3">
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
                            disabled={saving === row.id_bahan || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saving === row.id_bahan || saving === "new" ? "Menyimpan…" : "Simpan"}
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
            ))}
        </div>
    );
}
