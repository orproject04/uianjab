"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";

const MySwal = withReactContent(Swal);

type HasilKerjaRow = {
    id_hasil: number;
    id_jabatan: string;
    hasil_kerja: string[];   // TEXT[]
    satuan_hasil: string[];  // TEXT[]
};

function PairList({
                      valueA,
                      valueB,
                      onChange,
                  }: {
    valueA: string[];
    valueB: string[];
    onChange: (nextA: string[], nextB: string[]) => void;
}) {
    const [A, setA] = useState<string[]>(valueA ?? []);
    const [B, setB] = useState<string[]>(valueB ?? []);
    const refsA = useRef<Array<HTMLInputElement | null>>([]);
    const refsB = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setA(valueA ?? []); }, [valueA]);
    useEffect(() => { setB(valueB ?? []); }, [valueB]);

    function sync(nextA: string[], nextB: string[]) {
        setA(nextA); setB(nextB); onChange(nextA, nextB);
    }
    function addPair(after?: number) {
        const nA = [...A], nB = [...B];
        const idx = typeof after === "number" ? after + 1 : A.length;
        nA.splice(idx, 0, ""); nB.splice(idx, 0, "");
        sync(nA, nB);
        setTimeout(() => refsA.current[idx]?.focus(), 0);
    }
    function removePair(i: number) {
        const nA = A.filter((_, x) => x !== i);
        const nB = B.filter((_, x) => x !== i);
        sync(nA, nB);
    }
    function updateA(i: number, v: string) { const nA = [...A]; nA[i] = v; sync(nA, B); }
    function updateB(i: number, v: string) { const nB = [...B]; nB[i] = v; sync(A, nB); }

    return (
        <div className="space-y-2">
            {A.map((_, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                        ref={(el) => (refsA.current[i] = el)}
                        type="text"
                        value={A[i] ?? ""}
                        onChange={(e) => updateA(i, e.target.value)}
                        placeholder="Hasil Kerja (mis. Laporan Evaluasi)"
                        className="md:col-span-5 rounded border px-3 py-2"
                    />
                    <span className="text-center text-sm text-gray-500 md:col-span-1">↔</span>
                    <input
                        ref={(el) => (refsB.current[i] = el)}
                        type="text"
                        value={B[i] ?? ""}
                        onChange={(e) => updateB(i, e.target.value)}
                        placeholder="Satuan (mis. dokumen)"
                        className="md:col-span-4 rounded border px-3 py-2"
                    />
                    <div className="flex gap-2 md:col-span-2 justify-end">
                        <button
                            type="button"
                            onClick={() => addPair(i)}
                            className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700"
                            title="Tambah Hasil Kerja di bawah"
                        >+</button>
                        <button
                            type="button"
                            onClick={() => removePair(i)}
                            className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                            title="Hapus pasangan ini"
                        >✕</button>
                    </div>
                </div>
            ))}

            {/* Label tombol diganti sesuai permintaan */}
            <button
                type="button"
                onClick={() => addPair()}
                className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700"
            >
                + Tambah Hasil Kerja
            </button>
        </div>
    );
}

export default function HasilKerjaForm({
                                           id,
                                           viewerPath,
                                       }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<HasilKerjaRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/hasil-kerja`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch (e) {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Hasil Kerja." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_hasil: 0, id_jabatan: id, hasil_kerja: [""], satuan_hasil: [""] },
        ]);
    }
    function updateLocal(idx: number, patch: Partial<HasilKerjaRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            hasil_kerja: it.hasil_kerja?.filter(Boolean) ?? [],
            satuan_hasil: it.satuan_hasil?.filter(Boolean) ?? [],
        };
        const len = Math.min(payload.hasil_kerja.length, payload.satuan_hasil.length);
        payload.hasil_kerja = payload.hasil_kerja.slice(0, len);
        payload.satuan_hasil = payload.satuan_hasil.slice(0, len);

        setSaving(it.id_hasil || "new");
        try {
            let res: Response;
            if (it.id_hasil > 0) {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/hasil-kerja/${it.id_hasil}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/hasil-kerja`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data);
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
            if (it.id_hasil > 0) {
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/hasil-kerja/${it.id_hasil}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Hasil Kerja dihapus." });
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
                    + Tambah Item Hasil Kerja
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Hasil Kerja”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_hasil ?? 0) + "-" + idx} className="rounded border p-4 space-y-3">
                    {/* Item number ditampilkan increment 1,2,3... */}
                    <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                    <PairList
                        valueA={row.hasil_kerja ?? []}
                        valueB={row.satuan_hasil ?? []}
                        onChange={(a, b) => updateLocal(idx, { hasil_kerja: a, satuan_hasil: b })}
                    />

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => saveRow(idx)}
                            disabled={saving === row.id_hasil || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saving === row.id_hasil || saving === "new" ? "Menyimpan…" : "Simpan"}
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
