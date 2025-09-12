"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type KondisiRow = {
    id_kondisi: number;
    id_jabatan: string;
    aspek: string;
    faktor: string;
};

export default function KondisiLingkunganKerjaForm({
                                                       id,
                                                       viewerPath,
                                                   }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<KondisiRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/kondisi-lingkungan-kerja`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Kondisi Lingkungan Kerja." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_kondisi: 0, id_jabatan: id, aspek: "", faktor: "" },
        ]);
    }

    function updateLocal(idx: number, patch: Partial<KondisiRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            aspek: (it.aspek ?? "").trim(),
            faktor: (it.faktor ?? "").trim(),
        };
        if (!payload.aspek) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Aspek wajib diisi." });
            return;
        }

        setSaving(it.id_kondisi || "new");
        try {
            let res: Response;
            if (it.id_kondisi > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/kondisi-lingkungan-kerja/${it.id_kondisi}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/kondisi-lingkungan-kerja`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data); // id tetap → urutan stabil
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
            if (it.id_kondisi > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/kondisi-lingkungan-kerja/${it.id_kondisi}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Kondisi dihapus." });
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
                    + Tambah Item Kondisi
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Kondisi”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_kondisi ?? 0) + "-" + idx} className="rounded border p-4 space-y-3">
                    <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Aspek *</label>
                            <input
                                type="text"
                                value={row.aspek ?? ""}
                                onChange={(e) => updateLocal(idx, { aspek: e.target.value })}
                                placeholder="Mis. Kebisingan, Pencahayaan, Temperatur"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Faktor (opsional)</label>
                            <input
                                type="text"
                                value={row.faktor ?? ""}
                                onChange={(e) => updateLocal(idx, { faktor: e.target.value })}
                                placeholder="Mis. 75 dB(A), 500 lux"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => saveRow(idx)}
                            disabled={saving === row.id_kondisi || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saving === row.id_kondisi || saving === "new" ? "Menyimpan…" : "Simpan"}
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
