"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

export default function AnjabCreateByIdPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>(); // ID dari URL
    const [saving, setSaving] = useState(false);

    const kodeRef = useRef<HTMLInputElement>(null);
    const namaRef = useRef<HTMLInputElement>(null);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget as any;

        const payload = {
            id_jabatan: String(id).trim(), // dikunci dari path
            kode_jabatan: String(form.kode_jabatan.value || "").trim(),
            nama_jabatan: String(form.nama_jabatan.value || "").trim(),
            ikhtisar_jabatan: String(form.ikhtisar_jabatan.value || "").trim() || null,
            kelas_jabatan: String(form.kelas_jabatan.value || "").trim() || null,
            prestasi_diharapkan: String(form.prestasi_diharapkan.value || "").trim() || null,
        };

        if (!payload.kode_jabatan || !payload.nama_jabatan) {
            await MySwal.fire({
                icon: "warning",
                title: "Validasi",
                text: "Kode Jabatan dan Nama Jabatan wajib diisi.",
            });
            (!payload.kode_jabatan ? kodeRef : namaRef).current?.focus();
            return;
        }

        setSaving(true);
        try {
            const res = await apiFetch("/api/anjab", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg =
                    json?.error ||
                    (res.status === 409
                        ? "ID Jabatan sudah ada."
                        : res.status === 400
                            ? "Data tidak valid."
                            : "Terjadi kesalahan sistem.");
                await MySwal.fire({ icon: "error", title: "Gagal membuat", text: msg });
                return;
            }

            await MySwal.fire({
                icon: "success",
                title: "Anjab dibuat",
                text: `ID: ${payload.id_jabatan}`,
            });

            router.push(`/AnjabEdit/jabatan/${encodeURIComponent(payload.id_jabatan)}`);
            router.refresh();
        } catch (e) {
            console.error(e);
            await MySwal.fire({ icon: "error", title: "Error", text: "Terjadi kesalahan sistem." });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">Buat Anjab Baru</h1>
                <Link href={`/Anjab/${encodeURIComponent(String(id))}`} className="rounded border px-3 py-1.5">
                    Kembali
                </Link>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">ID Jabatan</label>
                        <input
                            value={String(id)}
                            readOnly
                            disabled
                            className="w-full rounded border px-3 py-2 bg-gray-100"
                        />
                        <p className="text-xs text-gray-500 mt-1">ID tidak dapat diubah.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Kode Jabatan *</label>
                        <input ref={kodeRef} name="kode_jabatan" className="w-full rounded border px-3 py-2" required />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Nama Jabatan *</label>
                    <input ref={namaRef} name="nama_jabatan" className="w-full rounded border px-3 py-2" required />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Ikhtisar Jabatan</label>
                    <textarea name="ikhtisar_jabatan" rows={3} className="w-full rounded border px-3 py-2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Kelas Jabatan</label>
                        <input name="kelas_jabatan" className="w-full rounded border px-3 py-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Prestasi Diharapkan</label>
                        <input name="prestasi_diharapkan" className="w-full rounded border px-3 py-2" />
                    </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button type="submit" disabled={saving} className="rounded bg-green-600 text-white px-4 py-2 disabled:opacity-60">
                        {saving ? "Membuat..." : "Buat"}
                    </button>
                    <Link href={`/Anjab/${encodeURIComponent(String(id))}`} className="rounded border px-4 py-2">
                        Batal
                    </Link>
                </div>
            </form>
        </div>
    );
}
