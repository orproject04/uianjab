// src/app/(admin)/(others-pages)/AnjabEdit/_sections/kualifikasi.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type Kualifikasi = {
    jabatan_id: string; // alias dari API (jabatan_id AS id_jabatan), biarkan kompatibel
    pendidikan_formal: string[] | null;
    diklat_penjenjangan: string[] | null;
    diklat_teknis: string[] | null;
    diklat_fungsional: string[] | null;
    pengalaman_kerja: string[] | null;
};

/** ===== Reusable Dynamic Input List (string[]) ===== */
function ArrayInput({
                        label,
                        name,
                        defaultItems = [],
                        placeholder,
                        autoFocus = false,
                    }: {
    label: string;
    name: string;
    defaultItems?: string[];
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const [items, setItems] = useState<string[]>(defaultItems);
    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        setItems(defaultItems ?? []);
    }, [defaultItems]);

    function updateItem(i: number, v: string) {
        const next = [...items];
        next[i] = v;
        setItems(next);
    }
    function addItem(atIndex?: number) {
        const next = [...items];
        if (typeof atIndex === "number") {
            next.splice(atIndex + 1, 0, "");
            setItems(next);
            setTimeout(() => inputsRef.current[atIndex + 1]?.focus(), 0);
        } else {
            next.push("");
            setItems(next);
            setTimeout(() => inputsRef.current[next.length - 1]?.focus(), 0);
        }
    }
    function removeItem(i: number) {
        const next = items.filter((_, idx) => idx !== i);
        setItems(next);
        setTimeout(() => {
            const focusIdx = Math.max(0, i - 1);
            inputsRef.current[focusIdx]?.focus();
        }, 0);
    }
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addItem(i);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && items[i] === "") {
            e.preventDefault();
            removeItem(i);
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            const nextIndex = e.key === "ArrowUp" ? Math.max(0, i - 1) : Math.min(items.length - 1, i + 1);
            inputsRef.current[nextIndex]?.focus();
        }
    }

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {label}
            </label>
            
            {items.length === 0 ? (
                <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <svg className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Belum ada {label.toLowerCase()}</p>
                    <button
                        type="button"
                        onClick={() => addItem()}
                        className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors inline-flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Item Pertama
                    </button>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {items.map((v, i) => (
                            <div key={i} className="flex gap-2">
                                <input
                                    ref={(el) => { inputsRef.current[i] = el; }}
                                    type="text"
                                    name={`${name}[${i}]`}
                                    value={v}
                                    onChange={(e) => updateItem(i, e.target.value)}
                                    onKeyDown={(e) => onKeyDown(e, i)}
                                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                                    placeholder={placeholder}
                                    autoFocus={autoFocus && i === 0}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeItem(i)}
                                    title="Hapus baris ini"
                                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => addItem()}
                        className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Item
                    </button>
                    
                </>
            )}
            
            {/* Hidden input sebagai JSON agar mudah diparse */}
            <input type="hidden" name={name} value={JSON.stringify(items)} />
        </div>
    );
}

/** ===== Section: Kualifikasi (disamakan perilaku & struktur) ===== */
export default function KualifikasiForm({
                                            viewerPath,
                                        }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>(""); // dibaca dari localStorage
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<Kualifikasi | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const firstFocus = useRef<HTMLDivElement>(null);

    // resolve dari localStorage (key = 2 segmen terakhir viewerPath)
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    // 1) resolve sekali saat mount / viewerPath berubah
    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    // 2) fetcher tunggal (untuk retry juga)
    const fetchAll = async (idLike: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(idLike)}/kualifikasi`, { cache: "no-store" });
            if (!res.ok) {
                setData(null);
                setLastError(`Gagal memuat Kualifikasi (HTTP ${res.status}).`);
                return;
            }
            const json = (await res.json()) as Kualifikasi;
            setData(json);
            setTimeout(() => firstFocus.current?.querySelector("input")?.focus(), 0);
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
                setLastError("__NOT_FOUND_KEY__"); // tampilkan 2 paragraf khusus
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => {
            alive = false;
        };
    }, [resolvedId, storageInfo.exists]);

    // 4) submit (SweetAlert hanya saat sukses)
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!resolvedId) return;

        const f = e.currentTarget as any;
        const payload = {
            pendidikan_formal: JSON.parse(f.pendidikan_formal.value || "[]"),
            diklat_penjenjangan: JSON.parse(f.diklat_penjenjangan.value || "[]"),
            diklat_teknis: JSON.parse(f.diklat_teknis.value || "[]"),
            diklat_fungsional: JSON.parse(f.diklat_fungsional.value || "[]"),
            pengalaman_kerja: JSON.parse(f.pengalaman_kerja.value || "[]"),
            upsert: true,
        };

        setSaving(true);
        setLastError(null);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kualifikasi`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || (json as any)?.error) {
                setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                return;
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Kualifikasi Jabatan berhasil disimpan." });
            // sinkron ringan
            setData((prev) =>
                prev
                    ? {
                        ...prev,
                        pendidikan_formal: payload.pendidikan_formal,
                        diklat_penjenjangan: payload.diklat_penjenjangan,
                        diklat_teknis: payload.diklat_teknis,
                        diklat_fungsional: payload.diklat_fungsional,
                        pengalaman_kerja: payload.pengalaman_kerja,
                    }
                    : prev
            );
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

    // === UI konsisten dengan EditSectionWrapper ===
    if (!resolvedId) {
        return (
            <EditSectionWrapper
                title="Kualifikasi Jabatan"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                title="Kualifikasi Jabatan"
                description="Memuat data kualifikasi..."
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
                title="Kualifikasi Jabatan"
                description="Data tidak ditemukan"
                icon={
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L4.168 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <p className="text-red-600 mb-4">Data tidak ditemukan.</p>
                    {lastError && <p className="text-sm text-gray-600">Detail: {lastError}</p>}
                    <div className="flex items-center justify-center gap-3 mt-4">
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

    // === Form ===
    return (
        <EditSectionWrapper
            title="Kualifikasi Jabatan"
            description="Edit persyaratan kualifikasi untuk jabatan ini"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            }
        >
            <form onSubmit={onSubmit} className="space-y-6">
                <FormSection title="Pendidikan dan Pelatihan">
                    <div ref={firstFocus} className="space-y-4">
                        <ArrayInput
                            label="Pendidikan Formal"
                            name="pendidikan_formal"
                            defaultItems={data.pendidikan_formal ?? []}
                            placeholder="Contoh: S-1 Administrasi Negara"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-4 mt-4">
                        <ArrayInput
                            label="Diklat Penjenjangan"
                            name="diklat_penjenjangan"
                            defaultItems={data.diklat_penjenjangan ?? []}
                            placeholder="Contoh: PIM IV / PKP"
                        />

                        <ArrayInput
                            label="Diklat Teknis"
                            name="diklat_teknis"
                            defaultItems={data.diklat_teknis ?? []}
                            placeholder="Contoh: Manajemen Proyek Pemerintahan"
                        />

                        <ArrayInput
                            label="Diklat Fungsional"
                            name="diklat_fungsional"
                            defaultItems={data.diklat_fungsional ?? []}
                            placeholder="Contoh: Fungsional Analis Kebijakan"
                        />
                    </div>
                </FormSection>

                <FormSection title="Pengalaman">
                    <ArrayInput
                        label="Pengalaman Kerja"
                        name="pengalaman_kerja"
                        defaultItems={data.pengalaman_kerja ?? []}
                        placeholder="Contoh: Analis kebijakan 2 tahun di ..."
                    />
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
