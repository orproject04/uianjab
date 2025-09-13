// src/app/(admin)/(others-pages)/AnjabEdit/_sections/tanggung-jawab.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type TJRow = {
    id: number;                    // SERIAL dari DB
    jabatan_id: string;            // UUID
    uraian_tanggung_jawab: string; // TEXT
    _tmpKey?: string;              // key lokal untuk React
};

export default function TanggungJawabForm({ viewerPath }: { viewerPath: string }) {
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({ storageKey: "", exists: false, value: "" });
    const [resolvedId, setResolvedId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<TJRow[]>([]);
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

    async function fetchAll(jabatanId: string) {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(jabatanId)}/tanggung-jawab`, { cache: "no-store" });
            if (!res.ok) {
                setRows([]);
                setLastError(`Gagal memuat (HTTP ${res.status}).`);
                return;
            }
            const raw = await res.json();
            const normalized: TJRow[] = Array.isArray(raw)
                ? raw.map((r: any, i: number) => ({
                    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
                    jabatan_id: typeof r?.jabatan_id === "string" ? r.jabatan_id : jabatanId,
                    uraian_tanggung_jawab: String(r?.uraian_tanggung_jawab ?? ""),
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
    }

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
            { id: 0, jabatan_id: resolvedId, uraian_tanggung_jawab: "", _tmpKey: tmpKey },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    function updateLocal(idx: number, patch: Partial<TJRow>) {
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
            uraian_tanggung_jawab: String(it.uraian_tanggung_jawab ?? "").trim(),
        };
        if (!payload.uraian_tanggung_jawab) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Uraian wajib diisi." });
            return;
        }

        setSaving(it.id > 0 ? it.id : "new");
        try {
            if (it.id > 0) {
                // PATCH
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tanggung-jawab/${it.id}`,
                    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? it.id,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    uraian_tanggung_jawab: String(json.data?.uraian_tanggung_jawab ?? ""),
                });
            } else {
                // POST
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tanggung-jawab`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? 0,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    uraian_tanggung_jawab: String(json.data?.uraian_tanggung_jawab ?? ""),
                });
            }
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
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tanggung-jawab/${it.id}`,
                    { method: "DELETE" }
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Tanggung Jawab dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // Jika UUID tidak ada di localStorage → teks (bukan SweetAlert), sama seperti modul lain
    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <div className="p-6 space-y-3">
                <p className="text-red-600">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                <p className="text-sm text-gray-600">
                    Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan, lalu kembali ke halaman ini.
                </p>
                <div className="flex items-center gap-3">
                    <button className="rounded border px-3 py-1.5" onClick={retry}>Coba lagi</button>
                    <Link href={`/Anjab/${viewerPath}`} className="rounded border px-3 py-1.5">Kembali</Link>
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
                    + Tambah Item Tanggung Jawab
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Tanggung Jawab”.</p>
            )}

            {rows.map((row, idx) => {
                const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                return (
                    <div key={key} className="rounded border p-4 space-y-3">
                        <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                        <div className="flex items-start gap-2">
                            <input
                                ref={idx === rows.length - 1 ? firstRef : undefined}
                                type="text"
                                value={row.uraian_tanggung_jawab ?? ""}
                                onChange={(e) => updateLocal(idx, { uraian_tanggung_jawab: e.target.value })}
                                placeholder="Uraian tanggung jawab (mis. Mengkoordinasikan penyusunan laporan kinerja)"
                                className="flex-1 rounded border px-3 py-2"
                            />
                            <button
                                type="button"
                                onClick={() => saveRow(idx)}
                                disabled={saving === row.id || saving === "new"}
                                className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                title="Simpan item ini"
                            >
                                {saving === row.id || saving === "new" ? "Menyimpan…" : "Simpan"}
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
                );
            })}
        </div>
    );
}
