"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

export default function AnjabCreateByIdPage() {
    const router = useRouter();
    const { id } = useParams<{ id?: string }>() ?? {}; // segmen terakhir URL → dipakai sebagai slug saat create
    const [saving, setSaving] = useState(false);

    const namaRef = useRef<HTMLInputElement>(null);
    const kodeRef = useRef<HTMLInputElement>(null);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget as any;

        // slug diambil dari segmen terakhir URL (mis: setjen-depmin)
        const slugRaw = String(id || "").trim();

        const payload = {
            nama_jabatan: String(form.nama_jabatan.value || "").trim(),
            kode_jabatan: String(form.kode_jabatan.value || "").trim(),
            slug: slugRaw, // simpan ke DB
            ikhtisar_jabatan: String(form.ikhtisar_jabatan.value || "").trim() || null,
            kelas_jabatan: String(form.kelas_jabatan.value || "").trim() || null,
            prestasi_diharapkan: String(form.prestasi_diharapkan.value || "").trim() || null,
        };

        if (!payload.nama_jabatan || !payload.kode_jabatan) {
            await MySwal.fire({
                icon: "warning",
                title: "Validasi",
                text: "Nama Jabatan dan Kode Jabatan wajib diisi.",
            });
            (!payload.nama_jabatan ? namaRef : kodeRef).current?.focus();
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
            if (!res.ok || json?.ok === false) {
                const msg =
                    json?.error ||
                    (res.status === 409
                        ? "Slug sudah digunakan. Gunakan URL berbeda."
                        : res.status === 400
                            ? "Data tidak valid."
                            : "Terjadi kesalahan sistem.");
                await MySwal.fire({ icon: "error", title: "Gagal membuat", text: msg });
                return;
            }

            // Ambil id & slug dari respons (backend sebaiknya return {ok:true, data:{id, slug, ...}})
            const createdId: string | undefined = json?.data?.id;
            const createdSlugRaw: string = (json?.data?.slug || slugRaw || "").trim();

            // Bentuk slug untuk URL edit: "setjen-depmin" → "setjen/depmin"
            const slugForUrl = createdSlugRaw.replace(/-/g, "/");

            // Simpan ID supaya halaman edit bisa langsung pakai untuk query DB
            try {
                if (createdId) {
                    // simpan mapping di kedua format slug (slash & dash) biar aman
                    if (slugForUrl) {
                        localStorage.setItem(`${slugForUrl}`, createdId);
                    }
                }
            } catch {
                // ignore storage error (private mode, quota, dsb)
            }

            await MySwal.fire({
                icon: "success",
                title: "Anjab dibuat",
                text: slugForUrl ? `Slug: ${slugForUrl}` : "Berhasil",
                timer: 1200,
                showConfirmButton: false,
            });

            if (slugForUrl) {
                router.push(`/AnjabEdit/jabatan/${slugForUrl}`);
            } else {
                router.push(`/Anjab`);
            }
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
                <Link
                    href={id ? `/Anjab/${encodeURIComponent(String(id))}` : `/Anjab`}
                    className="rounded border px-3 py-1.5"
                >
                    Kembali
                </Link>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
                {/* Nama di atas */}
                <div>
                    <label className="block text-sm font-medium mb-1">Nama Jabatan *</label>
                    <input
                        ref={namaRef}
                        name="nama_jabatan"
                        className="w-full rounded border px-3 py-2"
                        required
                    />
                </div>

                {/* Kode di bawah */}
                <div>
                    <label className="block text-sm font-medium mb-1">Kode Jabatan *</label>
                    <input
                        ref={kodeRef}
                        name="kode_jabatan"
                        className="w-full rounded border px-3 py-2"
                        required
                    />
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
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded bg-green-600 text-white px-4 py-2 disabled:opacity-60"
                    >
                        {saving ? "Membuat..." : "Buat"}
                    </button>
                    <Link
                        href={id ? `/Anjab/${encodeURIComponent(String(id))}` : `/Anjab`}
                        className="rounded border px-4 py-2"
                    >
                        Batal
                    </Link>
                </div>
            </form>
        </div>
    );
}
