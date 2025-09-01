"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";

const MySwal = withReactContent(Swal);

type KJRow = {
    id_korelasi: number;
    id_jabatan: string;
    jabatan_terkait: string;
    unit_kerja_instansi: string;
    dalam_hal: string[];
};

function ListInput({
                       value,
                       onChange,
                       placeholder,
                       title,
                   }: {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    title: string;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);

    function sync(n: string[]) { setItems(n); onChange(n); }
    function add(after?: number) {
        const n = [...items];
        const idx = typeof after === "number" ? after + 1 : items.length;
        n.splice(idx, 0, "");
        sync(n);
        setTimeout(() => refs.current[idx]?.focus(), 0);
    }
    function remove(i: number) { sync(items.filter((_, x) => x !== i)); }
    function update(i: number, v: string) { const n = [...items]; n[i] = v; sync(n); }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">{title}</label>
            {items.map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        ref={(el) => (refs.current[i] = el)}
                        type="text"
                        value={items[i] ?? ""}
                        onChange={(e) => update(i, e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 rounded border px-3 py-2"
                    />
                    <button
                        type="button"
                        onClick={() => add(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700"
                        title="Tambah item di bawah"
                    >+</button>
                    <button
                        type="button"
                        onClick={() => remove(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                        title="Hapus item ini"
                    >✕</button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => add()}
                className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700"
            >
                + Tambah {title}
            </button>
        </div>
    );
}

export default function KorelasiJabatanForm({
                                                id,
                                                viewerPath,
                                            }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<KJRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/korelasi-jabatan`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setRows(json);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Korelasi Jabatan." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { id_korelasi: 0, id_jabatan: id, jabatan_terkait: "", unit_kerja_instansi: "", dalam_hal: [] },
        ]);
    }

    function updateLocal(idx: number, patch: Partial<KJRow>) {
        setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            jabatan_terkait: (it.jabatan_terkait ?? "").trim(),
            unit_kerja_instansi: (it.unit_kerja_instansi ?? "").trim(),
            dalam_hal: (it.dalam_hal ?? []).map(s => (s ?? "").trim()).filter(Boolean),
        };
        if (!payload.jabatan_terkait) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Jabatan terkait wajib diisi." });
            return;
        }

        setSaving(it.id_korelasi || "new");
        try {
            let res: Response;
            if (it.id_korelasi > 0) {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/korelasi-jabatan/${it.id_korelasi}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/anjab/${encodeURIComponent(id)}/korelasi-jabatan`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, json.data); // id tetap → urutan stabil
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Korelasi Jabatan disimpan." });
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
            title: "Hapus Korelasi Jabatan?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id_korelasi > 0) {
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/korelasi-jabatan/${it.id_korelasi}`, {
                    method: "DELETE",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Korelasi Jabatan dihapus." });
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
                    + Tambah Item Korelasi Jabatan
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            {rows.length === 0 && (
                <p className="text-gray-600">Belum ada item. Klik “+ Tambah Item Korelasi Jabatan”.</p>
            )}

            {rows.map((row, idx) => (
                <div key={(row.id_korelasi ?? 0) + "-" + idx} className="rounded border p-4 space-y-4">
                    <h3 className="font-medium text-lg">Item {idx + 1}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Jabatan Terkait *</label>
                            <input
                                type="text"
                                value={row.jabatan_terkait ?? ""}
                                onChange={(e) => updateLocal(idx, { jabatan_terkait: e.target.value })}
                                placeholder="Mis. Analis Kebijakan Madya"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Unit Kerja/Instansi</label>
                            <input
                                type="text"
                                value={row.unit_kerja_instansi ?? ""}
                                onChange={(e) => updateLocal(idx, { unit_kerja_instansi: e.target.value })}
                                placeholder="Mis. Biro Perencanaan"
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                    </div>

                    <ListInput
                        title="Dalam Hal"
                        value={row.dalam_hal ?? []}
                        onChange={(v) => updateLocal(idx, { dalam_hal: v })}
                        placeholder="Mis. Koordinasi penyusunan data"
                    />

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => saveRow(idx)}
                            disabled={saving === row.id_korelasi || saving === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saving === row.id_korelasi || saving === "new" ? "Menyimpan…" : "Simpan"}
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
