"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type RisikoRow = {
    id_risiko: number;
    id_jabatan: string;
    nama_risiko: string;
    penyebab: string;
};

export default function RisikoBahayaForm({
                                             id,
                                             viewerPath,
                                         }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<RisikoRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/risiko-bahaya`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Risiko Bahaya." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_risiko: 0, id_jabatan: id, nama_risiko: "", penyebab: "" },
        ]);
    }

    function updateLocal(idx: number, patch: Partial<RisikoRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            nama_risiko: (it.nama_risiko ?? "").trim(),
            penyebab: (it.penyebab ?? "").trim(),
        };
        if (!payload.nama_risiko) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Nama risiko wajib diisi." });
            return;
        }

        setSaving(it.id_risiko || "new");
        try {
            let res: Response;
            if (it.id_risiko > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/risiko-bahaya/${it.id_risiko}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/risiko-bahaya`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data); // id tetap → urutan stabil
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
            if (it.id_risiko > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/risiko-bahaya/${it.id_risiko}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Risiko dihapus." });
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
                    + Tambah Item Risiko
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Risiko”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_risiko ?? 0) + "-" + idx} className="rounded border p-4 space-y-3">
                    <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Nama Risiko *</label>
                            <input
                                type="text"
                                value={row.nama_risiko ?? ""}
                                onChange={(e) => updateLocal(idx, { nama_risiko: e.target.value })}
                                placeholder="Mis. Paparan bahan kimia, Terpeleset"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Penyebab (opsional)</label>
                            <input
                                type="text"
                                value={row.penyebab ?? ""}
                                onChange={(e) => updateLocal(idx, { penyebab: e.target.value })}
                                placeholder="Mis. Kebocoran reagen, lantai licin"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => saveRow(idx)}
                            disabled={saving === row.id_risiko || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saving === row.id_risiko || saving === "new" ? "Menyimpan…" : "Simpan"}
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
