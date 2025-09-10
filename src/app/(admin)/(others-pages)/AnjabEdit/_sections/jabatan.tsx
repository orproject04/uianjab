"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import WordAbk from "@/components/form/form-elements/WordAbk";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type Jabatan = {
    id_jabatan: string;
    kode_jabatan: string | null;
    nama_jabatan: string | null;
    ikhtisar_jabatan: string | null;
    kelas_jabatan: string | null;
    prestasi_diharapkan: string | null;
};

export default function EditJabatanSection({
                                               id,
                                               viewerPath,
                                           }: {
    id: string;         // contoh: "OKK-Ortala"
    viewerPath: string; // contoh: "Ortala/Organisasi/XYZ"
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<Jabatan | null>(null);
    const [abkNeeded, setAbkNeeded] = useState(false);
    const [abkExamples, setAbkExamples] = useState<Array<{ id_tugas: number; nomor_tugas: number | null }>>([]);
    const namaRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }
        let alive = true;

        (async () => {
            try {
                setLoading(true);

                // Ambil data jabatan
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(id)}`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) {
                    await MySwal.fire({ icon: "error", title: "Gagal memuat", text: `Status: ${res.status}` });
                    return;
                }
                const json = await res.json();
                setData(json);
                setTimeout(() => namaRef.current?.focus(), 0);

                // Cek kebutuhan ABK
                const abkRes = await apiFetch(`/api/anjab/${encodeURIComponent(id)}/abk`, { cache: "no-store" });
                if (abkRes.ok) {
                    const abk = await abkRes.json();
                    setAbkNeeded(Boolean(abk?.needed));
                    setAbkExamples(Array.isArray(abk?.examples) ? abk.examples : []);
                } else {
                    // abaikan error kecil di checker ini
                    setAbkNeeded(false);
                    setAbkExamples([]);
                }
            } catch (e) {
                console.error(e);
                await MySwal.fire({ icon: "error", title: "Error", text: "Gagal memuat data." });
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [id]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!data) return;

        const form = e.currentTarget as any;
        const payload = {
            kode_jabatan: String(form.kode_jabatan.value || "").trim() || null,
            nama_jabatan: String(form.nama_jabatan.value || "").trim() || null,
            ikhtisar_jabatan: String(form.ikhtisar_jabatan.value || "").trim() || null,
            kelas_jabatan: String(form.kelas_jabatan.value || "").trim() || null,
            prestasi_diharapkan: String(form.prestasi_diharapkan.value || "").trim() || null,
        };

        if (!payload.nama_jabatan || !payload.kode_jabatan) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Nama & Kode Jabatan wajib diisi." });
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/jabatan`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: json?.error || `Status: ${res.status}` });
                return;
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Perubahan berhasil disimpan." });
        } catch (e) {
            console.error(e);
            await MySwal.fire({ icon: "error", title: "Error", text: "Terjadi kesalahan saat menyimpan." });
        } finally {
            setSaving(false);
        }
    }

    async function onDelete() {
        const ok = await MySwal.fire({
            icon: "warning",
            title: "Hapus Anjab?",
            html: `<div class="text-left">Menghapus akan <b>menghapus semua data turunan</b> (unit kerja, kualifikasi, tugas pokok, dst) untuk ID <code>${id}</code>. Lanjutkan?</div>`,
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
            confirmButtonColor: "#EF4444",
        });
        if (!ok.isConfirmed) return;

        try {
            const res = await fetch(`/api/anjab/${encodeURIComponent(id)}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            await MySwal.fire({ icon: "success", title: "Terhapus", text: `Anjab ${id} telah dihapus.` });
            // Arahkan kembali ke viewer root / daftar
            window.location.href = `/Anjab/${encodeURIComponent(id)}`;
        } catch (e) {
            console.error(e);
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
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
        <div className="">
            {/* Header tombol aksi */}
            <div className="flex items-center justify-end mb-4">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onDelete}
                        className="rounded px-3 py-1.5 bg-red-600 text-white hover:bg-red-700"
                        title="Hapus anjab ini"
                    >
                        Hapus Anjab
                    </button>
                </div>
            </div>

            {/* Form edit jabatan */}
            <form onSubmit={onSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium mb-1">ID Jabatan</label>
                    <input value={data.id_jabatan} disabled className="w-full rounded border px-3 py-2 bg-gray-100" />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Kode Jabatan *</label>
                    <input ref={namaRef} name="kode_jabatan" defaultValue={data.kode_jabatan ?? ""} className="w-full rounded border px-3 py-2" required />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Nama Jabatan *</label>
                    <input name="nama_jabatan" defaultValue={data.nama_jabatan ?? ""} className="w-full rounded border px-3 py-2" required />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Ikhtisar Jabatan</label>
                    <textarea name="ikhtisar_jabatan" defaultValue={data.ikhtisar_jabatan ?? ""} rows={4} className="w-full rounded border px-3 py-2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Kelas Jabatan</label>
                        <input name="kelas_jabatan" defaultValue={data.kelas_jabatan ?? ""} className="w-full rounded border px-3 py-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Prestasi Diharapkan</label>
                        <input name="prestasi_diharapkan" defaultValue={data.prestasi_diharapkan ?? ""} className="w-full rounded border px-3 py-2" />
                    </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button type="submit" disabled={saving} className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60">
                        {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                    <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                        Batal
                    </Link>
                </div>
            </form>

            {/* Section Upload ABK (kondisional) */}
            {abkNeeded && (
                <div className="mt-8 rounded-lg border p-4 bg-yellow-50">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-yellow-800">Sebagian kolom ABK pada Tugas Pokok belum terisi</h3>
                            {abkExamples.length > 0 && (
                                <p className="text-sm text-yellow-700">
                                    Contoh item belum lengkap:{" "}
                                    {abkExamples.map((x, i) => `#${x.nomor_tugas ?? x.id_tugas}`).join(", ")}
                                </p>
                            )}
                            <p className="text-sm text-yellow-700 mt-1">
                                Kamu bisa unggah file ABK (Word) untuk melengkapi otomatis.
                            </p>
                        </div>
                    </div>

                    <div className="mt-4">
                        <WordAbk id={id} />
                    </div>
                </div>
            )}
        </div>
    );
}
