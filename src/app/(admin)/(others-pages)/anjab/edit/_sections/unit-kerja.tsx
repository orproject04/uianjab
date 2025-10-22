"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";
import { Input } from "@/components/ui/form/FormControls";

const MySwal = withReactContent(Swal);

type UnitKerja = {
    jabatan_id: string; // alias dari API (jabatan_id AS id_jabatan)
    jpt_utama: string;
    jpt_madya: string;
    jpt_pratama: string;
    administrator: string;
    pengawas: string;
    pelaksana: string;
    jabatan_fungsional: string;
};

export default function UnitKerjaForm({
                                          viewerPath,   // dipakai untuk link Kembali
                                      }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>(""); // UUID/string dari localStorage
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<UnitKerja | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const firstRef = useRef<HTMLInputElement>(null);

    // --- util: resolve dari localStorage (tanpa fallback ke prop lain)
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    // 1) resolve sekali dari storage saat mount / viewerPath berubah
    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    // 2) fetcher tunggal (untuk retry juga)
    const fetchAll = async (uuidLike: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(uuidLike)}/unit-kerja`, { cache: "no-store" });
            if (!res.ok) {
                setData(null);
                setLastError(`Gagal memuat Unit Kerja (HTTP ${res.status}).`);
                return;
            }
            const json = (await res.json()) as UnitKerja;
            setData(json);
            setTimeout(() => firstRef.current?.focus(), 0);
        } catch {
            setData(null);
            setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    };

    // 3) trigger fetch berdasarkan hasil resolve
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                setLoading(false);
                setData(null);
                setLastError("__NOT_FOUND_KEY__"); // tampilkan 2 paragraf khusus (seperti Jabatan)
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => {
            alive = false;
        };
    }, [resolvedId, storageInfo.exists]);

    // 4) simpan (SweetAlert hanya untuk sukses)
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!data || !resolvedId) return;

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
        setLastError(null);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/unit-kerja`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.error) {
                setLastError(json?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                return;
            }

            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Unit Kerja berhasil disimpan." });
            // sinkron ringan
            setData((prev) => (prev ? { ...prev, ...payload } : prev));
        } catch {
            setLastError("Terjadi kesalahan saat menyimpan.");
        } finally {
            setSaving(false);
        }
    }

    // 5) retry resolve & fetch
    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    // === UI untuk ID belum ditemukan ===
    if (!resolvedId) {
        return (
            <EditSectionWrapper
                title="Unit Kerja"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
                            onClick={retry}
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
                title="Unit Kerja"
                description="Memuat data unit kerja..."
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
                title="Unit Kerja"
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

    // === Form ===
    return (
        <EditSectionWrapper
            title="Unit Kerja"
            description="Edit informasi unit kerja dan tingkatan jabatan"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            }
        >
            <form onSubmit={onSubmit} className="space-y-6">
                <FormSection title="Tingkatan Jabatan">
                    <div className="space-y-4">
                        <Input
                            ref={firstRef}
                            name="jpt_utama"
                            label="JPT Utama"
                            hint="Jabatan Pimpinan Tinggi Utama"
                            defaultValue={data.jpt_utama ?? ""}
                            placeholder="Contoh: Sekretaris Jenderal"
                        />

                        <Input
                            name="jpt_madya"
                            label="JPT Madya"
                            hint="Jabatan Pimpinan Tinggi Madya"
                            defaultValue={data.jpt_madya ?? ""}
                            placeholder="Contoh: Direktur Jenderal"
                        />

                        <Input
                            name="jpt_pratama"
                            label="JPT Pratama"
                            hint="Jabatan Pimpinan Tinggi Pratama"
                            defaultValue={data.jpt_pratama ?? ""}
                            placeholder="Contoh: Kepala Biro"
                        />

                        <Input
                            name="administrator"
                            label="Administrator"
                            hint="Jabatan Administrator"
                            defaultValue={data.administrator ?? ""}
                            placeholder="Contoh: Kepala Bagian"
                        />

                        <Input
                            name="pengawas"
                            label="Pengawas"
                            hint="Jabatan Pengawas"
                            defaultValue={data.pengawas ?? ""}
                            placeholder="Contoh: Kepala Subbagian"
                        />

                        <Input
                            name="pelaksana"
                            label="Pelaksana"
                            hint="Jabatan Pelaksana"
                            defaultValue={data.pelaksana ?? ""}
                            placeholder="Contoh: Staf Pelaksana"
                        />

                        <Input
                            name="jabatan_fungsional"
                            label="Jabatan Fungsional"
                            hint="Jabatan Fungsional yang terkait"
                            defaultValue={data.jabatan_fungsional ?? ""}
                            placeholder="Contoh: Analis Kebijakan"
                        />
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
        </EditSectionWrapper>
    );
}
