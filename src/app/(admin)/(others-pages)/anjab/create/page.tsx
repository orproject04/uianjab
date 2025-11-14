"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

export default function AnjabCreatePage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    const namaRef = useRef<HTMLInputElement>(null);
    const kodeRef = useRef<HTMLInputElement>(null);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget as any;

        const payload: any = {
            nama_jabatan: String(form.nama_jabatan.value || "").trim(),
            kode_jabatan: String(form.kode_jabatan.value || "").trim(),
            ikhtisar_jabatan: String(form.ikhtisar_jabatan.value || "").trim() || null,
            kelas_jabatan: String(form.kelas_jabatan.value || "").trim() || null,
            prestasi_diharapkan: String(form.prestasi_diharapkan.value || "").trim() || null,
        };

        if (!payload.nama_jabatan) {
            await MySwal.fire({
                icon: "warning",
                title: "Validasi",
                text: "Nama Jabatan wajib diisi.",
            });
            namaRef.current?.focus();
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
                    (res.status === 400
                        ? "Data tidak valid."
                        : "Terjadi kesalahan sistem.");
                await MySwal.fire({ icon: "error", title: "Gagal membuat", text: msg });
                return;
            }

            const createdId: string | undefined = json?.data?.id;

            await MySwal.fire({
                icon: "success",
                title: "Anjab dibuat",
                text: "Berhasil membuat anjab baru. Anda akan diarahkan ke halaman master anjab.",
                timer: 1500,
                showConfirmButton: false,
            });

            // Redirect ke halaman master anjab
            router.push(`/anjab/master`);
        } catch (err: any) {
            await MySwal.fire({
                icon: "error",
                title: "Gagal",
                text: err?.message || "Terjadi kesalahan tidak terduga.",
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Buat Anjab Baru
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Isi formulir di bawah untuk membuat dokumen analisis jabatan baru
                    </p>
                </div>

                {/* Form */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <form onSubmit={onSubmit} className="space-y-6">
                        {/* Nama Jabatan */}
                        <div>
                            <label htmlFor="nama_jabatan" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nama Jabatan <span className="text-red-500">*</span>
                            </label>
                            <input
                                ref={namaRef}
                                type="text"
                                id="nama_jabatan"
                                name="nama_jabatan"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="Masukkan nama jabatan"
                            />
                        </div>

                        {/* Kode Jabatan */}
                        <div>
                            <label htmlFor="kode_jabatan" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Kode Jabatan
                            </label>
                            <input
                                ref={kodeRef}
                                type="text"
                                id="kode_jabatan"
                                name="kode_jabatan"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="Masukkan kode jabatan"
                            />
                        </div>

                        {/* Ikhtisar Jabatan */}
                        <div>
                            <label htmlFor="ikhtisar_jabatan" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Ikhtisar Jabatan
                            </label>
                            <textarea
                                id="ikhtisar_jabatan"
                                name="ikhtisar_jabatan"
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="Masukkan ikhtisar jabatan (opsional)"
                            />
                        </div>

                        {/* Kelas Jabatan */}
                        <div>
                            <label htmlFor="kelas_jabatan" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Kelas Jabatan
                            </label>
                            <input
                                type="text"
                                id="kelas_jabatan"
                                name="kelas_jabatan"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="Masukkan kelas jabatan (opsional)"
                            />
                        </div>

                        {/* Prestasi yang Diharapkan */}
                        <div>
                            <label htmlFor="prestasi_diharapkan" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Prestasi yang Diharapkan
                            </label>
                            <textarea
                                id="prestasi_diharapkan"
                                name="prestasi_diharapkan"
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="Masukkan prestasi yang diharapkan (opsional)"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {saving ? "Menyimpan..." : "Simpan Anjab"}
                            </button>
                            <button
                                type="button"
                                onClick={() => router.back()}
                                disabled={saving}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Batal
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
