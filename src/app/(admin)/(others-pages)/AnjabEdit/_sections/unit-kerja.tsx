"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";

const MySwal = withReactContent(Swal);

type UnitKerja = {
    id_unit_kerja?: number;
    id_jabatan: string;
    jpt_utama: string;
    jpt_madya: string;
    jpt_pratama: string;
    administrator: string;
    pengawas: string;
    pelaksana: string;
    jabatan_fungsional: string;
};

export default function UnitKerjaForm({
                                          id,
                                          viewerPath,
                                      }: {
    id: string;         // contoh: "OKK-Ortala"
    viewerPath: string; // contoh: "Ortala/PKSTI"
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<UnitKerja | null>(null);
    const firstRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!id) { setLoading(false); return; }
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/unit-kerja`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setData(json);
                setTimeout(() => firstRef.current?.focus(), 0);
            } catch (e) {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Unit Kerja." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!data) return;

        const f = e.currentTarget as any;
        const payload = {
            jpt_utama: String(f.jpt_utama.value || "").trim(),
            jpt_madya: String(f.jpt_madya.value || "").trim(),
            jpt_pratama: String(f.jpt_pratama.value || "").trim(),
            administrator: String(f.administrator.value || "").trim(),
            pengawas: String(f.pengawas.value || "").trim(),
            pelaksana: String(f.pelaksana.value || "").trim(),
            jabatan_fungsional: String(f.jabatan_fungsional.value || "").trim(),
            upsert: true,
        };

        setSaving(true);
        try {
            const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/unit-kerja`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Unit Kerja berhasil disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(false);
        }
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
    if (!data) return <div className="p-6 text-red-600">Data tidak ditemukan.</div>;

    return (
        <form onSubmit={onSubmit} className="space-y-4 max-w-3xl mx-auto">
            <div>
                <label className="block text-sm font-medium mb-1">JPT Utama</label>
                <input type="text" ref={firstRef} name="jpt_utama" defaultValue={data.jpt_utama ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">JPT Madya</label>
                <input type="text" name="jpt_madya" defaultValue={data.jpt_madya ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">JPT Pratama</label>
                <input type="text" name="jpt_pratama" defaultValue={data.jpt_pratama ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Administrator</label>
                <input type="text" name="administrator" defaultValue={data.administrator ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pengawas</label>
                <input type="text" name="pengawas" defaultValue={data.pengawas ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pelaksana</label>
                <input type="text" name="pelaksana" defaultValue={data.pelaksana ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Jabatan Fungsional</label>
                <input type="text" name="jabatan_fungsional" defaultValue={data.jabatan_fungsional ?? ""} rows={2}
                          className="w-full rounded border px-3 py-2" />
            </div>

            <div className="pt-2 flex items-center gap-3">
                <button type="submit" disabled={saving}
                        className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60">
                    {saving ? "Menyimpan..." : "Simpan"}
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Batal
                </Link>
            </div>
        </form>
    );
}
