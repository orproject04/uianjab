"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

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
            <div className="p-6 space-y-3">
                <p className="text-red-600">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                <p className="text-sm text-gray-600">
                    Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                    lalu kembali ke halaman ini.
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
                <button
                    type="button"
                    onClick={addRow}
                    className="rounded px-4 py-2 bg-green-600 text-white hover:bg-green-700"
                >
                    + Tambah Item Risiko
                </button>
                <Link href={`/anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Risiko”.</p>
            )}

            {rows.map((row, idx) => {
                const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                return (
                    <div key={key} className="rounded border p-4 space-y-3">
                        <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nama Risiko *</label>
                                <input
                                    ref={idx === rows.length - 1 ? firstRef : undefined}
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
