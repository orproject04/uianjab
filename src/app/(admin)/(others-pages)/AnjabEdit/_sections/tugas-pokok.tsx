"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type TugasPokok = {
    id_tugas: number;
    id_jabatan: string;
    nomor_tugas: number | null;
    uraian_tugas: string;
    hasil_kerja: string[];            // TEXT[]
    jumlah_hasil: number | null;      // INT
    waktu_penyelesaian_jam: number | null; // INT
    waktu_efektif: number | null;     // INT
    kebutuhan_pegawai: number | null; // NUMERIC(10,4)
    tahapan: string[];                // <- dari tabel tahapan_uraian_tugas (digabung di API)
};

/** Reusable ArrayInput (string[]) dengan tombol seragam */
function ArrayInput({
                        label,
                        value,
                        onChange,
                        placeholder,
                        autoFocus = false,
                    }: {
    label: string;
    value: string[];
    onChange: (v: string[]) => void;
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        setItems(value ?? []);
    }, [value]);

    function setAndEmit(next: string[]) {
        setItems(next);
        onChange(next);
    }
    function update(i: number, v: string) {
        const next = [...items]; next[i] = v; setAndEmit(next);
    }
    function add(after?: number) {
        const next = [...items];
        if (typeof after === "number") next.splice(after + 1, 0, "");
        else next.push("");
        setAndEmit(next);
        setTimeout(() => {
            const idx = typeof after === "number" ? after + 1 : next.length - 1;
            refs.current[idx]?.focus();
        }, 0);
    }
    function remove(i: number) {
        const next = items.filter((_, idx) => idx !== i);
        setAndEmit(next);
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">{label}</label>
            {items.map((v, i) => (
                <div key={i} className="flex gap-2">
                    <input
                        ref={el => refs.current[i] = el}
                        type="text"
                        value={v}
                        onChange={e => update(i, e.target.value)}
                        className="flex-1 rounded border px-3 py-2"
                        placeholder={placeholder}
                        autoFocus={autoFocus && i === 0}
                    />
                    <button
                        type="button"
                        onClick={() => add(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-green-500 text-white hover:bg-green-600"
                        title="Tambah baris di bawah"
                    >+</button>
                    <button
                        type="button"
                        onClick={() => remove(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                        title="Hapus baris ini"
                    >✕</button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => add()}
                className="rounded px-3 py-2 bg-green-500 text-white hover:bg-green-600"
            >+ Tambah</button>
        </div>
    );
}

export default function TugasPokokForm({
                                           id,
                                           viewerPath,
                                       }: {
    id: string;         // contoh: "OKK-Ortala"
    viewerPath: string; // "Ortala/PKSTI"
}) {
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<number | "new" | null>(null);
    const [list, setList] = useState<TugasPokok[]>([]);
    const firstRef = useRef<HTMLTextAreaElement>(null);

    // Fetch list
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/tugas-pokok`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: TugasPokok[] = await res.json();
                setList(data);
                setTimeout(() => firstRef.current?.focus(), 0);
            } catch (e) {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Tugas Pokok." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    function updateLocal(idx: number, patch: Partial<TugasPokok>) {
        setList(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveItem(idx: number) {
        const item = list[idx];
        const payload = {
            nomor_tugas: item.nomor_tugas ?? null,
            uraian_tugas: item.uraian_tugas ?? "",
            hasil_kerja: item.hasil_kerja ?? [],
            jumlah_hasil: item.jumlah_hasil ?? null,
            waktu_penyelesaian_jam: item.waktu_penyelesaian_jam ?? null,
            waktu_efektif: item.waktu_efektif ?? null,
            kebutuhan_pegawai: item.kebutuhan_pegawai ?? null,
            tahapan: item.tahapan ?? [],
        };
        setSavingId(item.id_tugas ?? "new");
        try {
            if (item.id_tugas > 0) {
                // PATCH
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/tugas-pokok/${item.id_tugas}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                // refresh row
                updateLocal(idx, json.data);
            } else {
                // POST create
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/tugas-pokok`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, json.data);
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Tugas Pokok berhasil disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSavingId(null);
        }
    }

    async function deleteItem(idx: number) {
        const item = list[idx];
        const ok = await MySwal.fire({
            icon: "warning",
            title: "Hapus Tugas?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (item.id_tugas > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/tugas-pokok/${item.id_tugas}`, { method: "DELETE" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setList(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Tugas Pokok dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    function addNew() {
        setList(prev => [
            ...prev,
            {
                id_tugas: 0,            // 0 = belum tersimpan
                id_jabatan: id,
                nomor_tugas: (prev[prev.length - 1]?.nomor_tugas ?? 0) + 1,
                uraian_tugas: "",
                hasil_kerja: [],
                jumlah_hasil: null,
                waktu_penyelesaian_jam: null,
                waktu_efektif: null,
                kebutuhan_pegawai: null,
                tahapan: [],
            },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    if (!id) {
        return (
            <div className="p-6 text-center">
                <p>Slug tidak valid.</p>
                <Link href="/Anjab" className="text-blue-600 underline">Kembali</Link>
            </div>
        );
    }
    if (loading) return <div className="p-6">Memuat…</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between">
                <button
                    type="button"
                    onClick={addNew}
                    className="rounded px-4 py-2 bg-green-600 text-white hover:bg-green-700"
                >
                    + Tambah Tugas
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">Kembali</Link>
            </div>

            {list.length === 0 && (
                <p className="text-gray-600">Belum ada Tugas Pokok. Klik “+ Tambah Tugas”.</p>
            )}

            {list.map((row, idx) => (
                <div key={row.id_tugas ?? idx} className="rounded border p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Nomor</label>
                            <input
                                type="number"
                                value={row.nomor_tugas ?? 0}
                                onChange={(e) => updateLocal(idx, { nomor_tugas: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Jumlah Hasil</label>
                            <input
                                type="number"
                                value={row.jumlah_hasil ?? 0}
                                onChange={(e) => updateLocal(idx, { jumlah_hasil: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Waktu (jam)</label>
                            <input
                                type="number"
                                value={row.waktu_penyelesaian_jam ?? 0}
                                onChange={(e) => updateLocal(idx, { waktu_penyelesaian_jam: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Waktu Efektif</label>
                            <input
                                type="number"
                                value={row.waktu_efektif ?? 0}
                                onChange={(e) => updateLocal(idx, { waktu_efektif: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Kebutuhan Pegawai</label>
                        <input
                            type="number"
                            step="0.0001"
                            value={row.kebutuhan_pegawai ?? 0}
                            onChange={(e) => updateLocal(idx, { kebutuhan_pegawai: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-full rounded border px-3 py-2"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Uraian Tugas</label>
                        <textarea
                            ref={idx === list.length - 1 ? firstRef : undefined}
                            value={row.uraian_tugas ?? ""}
                            onChange={(e) => updateLocal(idx, { uraian_tugas: e.target.value })}
                            rows={3}
                            className="w-full rounded border px-3 py-2"
                        />
                    </div>

                    <ArrayInput
                        label="Tahapan Uraian Tugas"
                        value={row.tahapan ?? []}
                        onChange={(v) => updateLocal(idx, { tahapan: v })}
                        placeholder="Contoh: Mengumpulkan data …"
                    />

                    <ArrayInput
                        label="Hasil Kerja (satu per baris)"
                        value={row.hasil_kerja ?? []}
                        onChange={(v) => updateLocal(idx, { hasil_kerja: v })}
                        placeholder="Contoh: Laporan analisis …"
                    />

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => saveItem(idx)}
                            disabled={savingId === row.id_tugas || savingId === "new"}
                            className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {savingId === row.id_tugas ? "Menyimpan…" : "Simpan"}
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteItem(idx)}
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
