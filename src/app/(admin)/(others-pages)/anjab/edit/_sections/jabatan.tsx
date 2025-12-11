"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import EditSectionWrapper, { FormSection, FormField, FormActions } from "@/components/form/EditSectionWrapper";
import { Input, Textarea } from "@/components/ui/form/FormControls";
import Button from "@/components/ui/button/Button";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type Jabatan = {
    id: string;
    kode_jabatan: string | null;
    nama_jabatan: string | null;
    ikhtisar_jabatan: string | null;
    kelas_jabatan: string | null;
    prestasi_diharapkan: string | null;
};

export default function EditJabatanSection({
                                               id,          // TIDAK dipakai lagi untuk fetch; kita override dengan UUID dari storage
                                               viewerPath,  // contoh: "setjen/depmin/okk"
                                           }: {
    id: string;
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>(""); // UUID hasil lookup storage
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [data, setData] = useState<Jabatan | null>(null);
    const namaRef = useRef<HTMLInputElement>(null);

    // 1) Resolve UUID dari storage (tanpa memanggil API resolver lain)
    const resolveIdFromStorage = () => {
        try {
            const slugKey = viewerPath.split("/").filter(Boolean).slice(-2).join("/");
            const bySlash = localStorage.getItem(`${slugKey}`);
            if (bySlash) return bySlash;
        } catch {
            // abaikan error storage
        }
        return "";
    };

    // 2) Saat mount / viewerPath berubah → ambil UUID
    useEffect(() => {
        const uuid = resolveIdFromStorage();
        setResolvedId(uuid);
    }, [viewerPath]); // hanya tergantung viewerPath

    // 3) Ambil data jika UUID sudah ada
    useEffect(() => {
        let alive = true;

        (async () => {
            if (!resolvedId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                // Ambil data jabatan memakai UUID yang sudah di-resolve
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/jabatan`, {
                    cache: "no-store",
                });
                if (!alive) return;
                if (!res.ok) {
                    await MySwal.fire({
                        icon: "error",
                        title: "Gagal memuat",
                        text: `Status: ${res.status}`,
                    });
                    setData(null);
                    return;
                }
                const json = await res.json();
                setData(json);
                setTimeout(() => namaRef.current?.focus(), 0);
            } catch (e) {
                await MySwal.fire({ icon: "error", title: "Error", text: "Gagal memuat data." });
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [resolvedId]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!data || !resolvedId) return;

        const form = e.currentTarget as any;
        const payload = {
            nama_jabatan: String(form.nama_jabatan.value || "").trim() || null,
            kode_jabatan: String(form.kode_jabatan.value || "").trim() || null,
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
            return;
        }

        setSaving(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/jabatan`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                await MySwal.fire({
                    icon: "error",
                    title: "Gagal menyimpan",
                    text: json?.error || `Status: ${res.status}`,
                });
                return;
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Perubahan berhasil disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Error", text: "Terjadi kesalahan saat menyimpan." });
        } finally {
            setSaving(false);
        }
    }

    async function onDelete() {
        if (!resolvedId) return;

        const ok = await MySwal.fire({
            icon: "warning",
            title: "Hapus Anjab?",
            html: `<div class="text-left">Menghapus akan <b>menghapus semua data turunan</b> untuk ID <code>${resolvedId}</code>. Lanjutkan?</div>`,
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
            confirmButtonColor: "#EF4444",
        });
        if (!ok.isConfirmed) return;

        setDeleting(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            await MySwal.fire({ icon: "success", title: "Terhapus", text: `Anjab telah dihapus.` });
            
            // Redirect: jika viewerPath dimulai dengan "master/" (master edit), redirect ke /anjab/master
            // Jika tidak (slug edit), redirect ke /anjab/${viewerPath}
            const isMaster = viewerPath.startsWith("master/");
            window.location.href = isMaster ? `/anjab/master` : `/anjab/${viewerPath}`;
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        } finally {
            setDeleting(false);
        }
    }

    // UI saat belum berhasil resolve UUID
    if (!resolvedId) {
        return (
            <EditSectionWrapper
                title="Informasi Jabatan"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <div className="text-red-600 mb-4">
                        <p>ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                        <p className="text-sm text-gray-600 mt-2">
                            Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                            lalu kembali ke halaman ini.
                        </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                            onClick={() => setResolvedId(resolveIdFromStorage())}
                        >
                            Coba lagi
                        </button>
                        <Link
                            href={`/anjab/${viewerPath}`}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Kembali
                        </Link>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    if (loading) {
        return (
            <EditSectionWrapper
                title="Informasi Jabatan"
                description="Memuat data jabatan..."
                icon={
                    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                }
            >
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Memuat data...</p>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    if (!data) {
        return (
            <EditSectionWrapper
                title="Informasi Jabatan"
                description="Data tidak ditemukan"
                icon={
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L4.168 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <p className="text-red-600 mb-4">Data tidak ditemukan.</p>
                    <Link
                        href={`/anjab/${viewerPath}`}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Kembali
                    </Link>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <>
            <EditSectionWrapper

                title="Informasi Jabatan"
                description="Edit informasi dasar jabatan dan data terkait"
                icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>}
                actions={<button
                    type="button"
                    onClick={onDelete}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    title="Hapus anjab ini"
                >
                    {deleting ? "Menghapus..." : "Hapus Anjab"}
                </button>}
            >
                <form onSubmit={onSubmit} className="space-y-6">
                    <FormSection title="Identitas Jabatan">
                        <div className="space-y-4">
                            {/*<Input
                                label="ID Jabatan (UUID)"
                                hint="ID unik yang digunakan sistem"
                                value={resolvedId}
                                disabled /> */}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    ref={namaRef}
                                    name="kode_jabatan"
                                    label="Kode Jabatan"
                                    defaultValue={data.kode_jabatan ?? ""}
                                    placeholder="Masukkan kode jabatan (opsional)" />

                                <Input
                                    name="nama_jabatan"
                                    label="Nama Jabatan"
                                    defaultValue={data.nama_jabatan ?? ""}
                                    placeholder="Masukkan nama jabatan"
                                    required />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection title="Detail Jabatan">
                        <div className="space-y-4">
                            <Textarea
                                name="ikhtisar_jabatan"
                                label="Ikhtisar Jabatan"
                                hint="Ringkasan umum tentang jabatan ini"
                                defaultValue={data.ikhtisar_jabatan ?? ""}
                                rows={4}
                                placeholder="Jelaskan ikhtisar jabatan..." />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    name="kelas_jabatan"
                                    label="Kelas Jabatan"
                                    hint="Tingkat atau level jabatan"
                                    defaultValue={data.kelas_jabatan ?? ""}
                                    placeholder="Contoh: Tinggi, Menengah, Rendah" />

                                <Input
                                    name="prestasi_diharapkan"
                                    label="Prestasi Diharapkan"
                                    hint="Target kinerja yang diharapkan"
                                    defaultValue={data.prestasi_diharapkan ?? ""}
                                    placeholder="Jelaskan prestasi yang diharapkan" />
                            </div>
                        </div>
                    </FormSection>

                    <FormActions>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {saving && (
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {saving ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                        <Link
                            href={`/anjab/${viewerPath}`}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Batal
                        </Link>
                    </FormActions>
                </form>
            </EditSectionWrapper></>
    );
}