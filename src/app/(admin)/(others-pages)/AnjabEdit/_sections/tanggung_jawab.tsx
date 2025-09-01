"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";

const MySwal = withReactContent(Swal);

type TJRow = {
    id_tanggung_jawab: number;
    id_jabatan: string;
    uraian_tanggung_jawab: string;
};

export default function TanggungJawabForm({
                                              id,
                                              viewerPath,
                                          }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<TJRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/tanggung-jawab`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Tanggung Jawab." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_tanggung_jawab: 0, id_jabatan: id, uraian_tanggung_jawab: "" },
        ]);
    }

    function updateLocal(idx: number, patch: Partial<TJRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            uraian_tanggung_jawab: (it.uraian_tanggung_jawab ?? "").trim(),
        };
        if (!payload.uraian_tanggung_jawab) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Uraian wajib diisi." });
            return;
        }

        setSaving(it.id_tanggung_jawab || "new");
        try {
            let res: Response;
            if (it.id_tanggung_jawab > 0) {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/tanggung-jawab/${it.id_tanggung_jawab}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/tanggung-jawab`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data); // id tetap → urutan stabil
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Tanggung Jawab disimpan." });
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
            title: "Hapus Tanggung Jawab?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id_tanggung_jawab > 0) {
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/tanggung-jawab/${it.id_tanggung_jawab}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Tanggung Jawab dihapus." });
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
                    + Tambah Item Tanggung Jawab
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Tanggung Jawab”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_tanggung_jawab ?? 0) + "-" + idx} className="rounded border p-4 space-y-3">
                    <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                    <div className="flex items-start gap-2">
                        <input
                            type="text"
                            value={row.uraian_tanggung_jawab ?? ""}
                            onChange={(e) => updateLocal(idx, { uraian_tanggung_jawab: e.target.value })}
                            placeholder="Uraian tanggung jawab (mis. Mengkoordinasikan penyusunan laporan kinerja)"
                            className="flex-1 rounded border px-3 py-2"
                        />
                        <button
                            type="button"
                            onClick={() => saveRow(idx)}
                            disabled={saving === row.id_tanggung_jawab || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="Simpan item ini"
                        >
                            {saving === row.id_tanggung_jawab || saving === "new" ? "Menyimpan…" : "Simpan"}
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteRow(idx)}
                            className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                            title="Hapus item ini"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
