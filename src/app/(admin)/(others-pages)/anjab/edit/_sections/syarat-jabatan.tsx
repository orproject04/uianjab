"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type SJRow = {
    id: number | null;       // SERIAL (boleh null saat belum ada)
    jabatan_id: string;      // UUID

    keterampilan_kerja: string[];
    bakat_kerja: string[];
    temperamen_kerja: string[];
    minat_kerja: string[];
    upaya_fisik: string[];
    fungsi_pekerja: string[];

    kondisi_fisik_jenkel: string;
    kondisi_fisik_umur: string;
    kondisi_fisik_tb: string;
    kondisi_fisik_bb: string;
    kondisi_fisik_pb: string;
    kondisi_fisik_tampilan: string;
    kondisi_fisik_keadaan: string;
};

function ListInput({
                       title,
                       placeholder,
                       value,
                       onChange,
                   }: {
    title: string;
    placeholder: string;
    value: string[];
    onChange: (next: string[]) => void;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);

    const sync = (n: string[]) => { setItems(n); onChange(n); };
    
    const add = () => {
        const n = [...items, ""];
        sync(n);
        setTimeout(() => refs.current[items.length]?.focus(), 0);
    };
    
    const remove = (i: number) => {
        if (items.length <= 1) return; // Minimal 1 item
        sync(items.filter((_, x) => x !== i));
    };
    
    const update = (i: number, v: string) => { 
        const n = [...items]; 
        n[i] = v; 
        sync(n); 
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        // Enter: tambah item baru di bawah
        if (e.key === "Enter") {
            e.preventDefault();
            const n = [...items];
            n.splice(i + 1, 0, "");
            sync(n);
            setTimeout(() => refs.current[i + 1]?.focus(), 0);
        }
        // Ctrl+Backspace: hapus item kosong
        if (e.key === "Backspace" && e.ctrlKey && items[i] === "" && items.length > 1) {
            e.preventDefault();
            remove(i);
            setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 0);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{title}</label>
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            ref={(el) => { refs.current[i] = el; }}
                            type="text"
                            value={item ?? ""}
                            onChange={(e) => update(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            placeholder={placeholder}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            disabled={items.length <= 1}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Hapus item (atau tekan Ctrl+Backspace pada item kosong)"
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
                onClick={add}
                className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 dark:hover:border-brand-400 dark:hover:text-brand-400 transition-colors flex items-center justify-center gap-2 text-sm"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah {title}
            </button>
        </div>
    );
}

export default function SyaratJabatanForm({
                                              id,           // tidak dipakai lagi; UUID di-resolve dari localStorage
                                              viewerPath,   // contoh: "setjen/depmin-okk"
                                          }: {
    id: string;
    viewerPath: string;
}) {
    const [storageKey, setStorageKey] = useState<string>("");
    const [resolvedId, setResolvedId] = useState<string>("");
    const [hasKey, setHasKey] = useState<boolean>(true);

    const [loading, setLoading] = useState(true);
    const [row, setRow] = useState<SJRow | null>(null);
    const [saving, setSaving] = useState(false);

    function resolveFromStorage(vpath: string) {
        const key = vpath.split("/").filter(Boolean).slice(-2).join("/");
        setStorageKey(key);
        try {
            const val = localStorage.getItem(key);
            if (!val) { setHasKey(false); setResolvedId(""); }
            else { setHasKey(true); setResolvedId(val); }
        } catch { setHasKey(false); setResolvedId(""); }
    }

    useEffect(() => { resolveFromStorage(viewerPath); }, [viewerPath]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!hasKey || !resolvedId) {
                setLoading(false);
                setRow(null);
                return;
            }
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/syarat-jabatan`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();

                const def: SJRow = {
                    id: json?.id ?? null,
                    jabatan_id: json?.jabatan_id ?? resolvedId,

                    keterampilan_kerja: Array.isArray(json?.keterampilan_kerja) ? json.keterampilan_kerja : [],
                    bakat_kerja: Array.isArray(json?.bakat_kerja) ? json.bakat_kerja : [],
                    temperamen_kerja: Array.isArray(json?.temperamen_kerja) ? json.temperamen_kerja : [],
                    minat_kerja: Array.isArray(json?.minat_kerja) ? json.minat_kerja : [],
                    upaya_fisik: Array.isArray(json?.upaya_fisik) ? json.upaya_fisik : [],
                    fungsi_pekerja: Array.isArray(json?.fungsi_pekerja) ? json.fungsi_pekerja : [],

                    kondisi_fisik_jenkel: String(json?.kondisi_fisik_jenkel ?? ""),
                    kondisi_fisik_umur: String(json?.kondisi_fisik_umur ?? ""),
                    kondisi_fisik_tb: String(json?.kondisi_fisik_tb ?? ""),
                    kondisi_fisik_bb: String(json?.kondisi_fisik_bb ?? ""),
                    kondisi_fisik_pb: String(json?.kondisi_fisik_pb ?? ""),
                    kondisi_fisik_tampilan: String(json?.kondisi_fisik_tampilan ?? ""),
                    kondisi_fisik_keadaan: String(json?.kondisi_fisik_keadaan ?? ""),
                };
                setRow(def);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Syarat Jabatan." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [hasKey, resolvedId]);

    const retry = () => resolveFromStorage(viewerPath);

    async function onSave() {
        if (!row) return;
        const payload = {
            keterampilan_kerja: (row.keterampilan_kerja ?? []).map(s => s.trim()).filter(Boolean),
            bakat_kerja: (row.bakat_kerja ?? []).map(s => s.trim()).filter(Boolean),
            temperamen_kerja: (row.temperamen_kerja ?? []).map(s => s.trim()).filter(Boolean),
            minat_kerja: (row.minat_kerja ?? []).map(s => s.trim()).filter(Boolean),
            upaya_fisik: (row.upaya_fisik ?? []).map(s => s.trim()).filter(Boolean),
            fungsi_pekerja: (row.fungsi_pekerja ?? []).map(s => s.trim()).filter(Boolean),

            kondisi_fisik_jenkel: (row.kondisi_fisik_jenkel ?? "").trim(),
            kondisi_fisik_umur: (row.kondisi_fisik_umur ?? "").trim(),
            kondisi_fisik_tb: (row.kondisi_fisik_tb ?? "").trim(),
            kondisi_fisik_bb: (row.kondisi_fisik_bb ?? "").trim(),
            kondisi_fisik_pb: (row.kondisi_fisik_pb ?? "").trim(),
            kondisi_fisik_tampilan: (row.kondisi_fisik_tampilan ?? "").trim(),
            kondisi_fisik_keadaan: (row.kondisi_fisik_keadaan ?? "").trim(),

            upsert: true,
        };

        setSaving(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/syarat-jabatan`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);

            const d = json.data ?? {};
            setRow(prev => prev ? {
                ...prev,
                id: d?.id ?? prev.id,
                jabatan_id: d?.jabatan_id ?? resolvedId,
                keterampilan_kerja: d?.keterampilan_kerja ?? prev.keterampilan_kerja,
                bakat_kerja: d?.bakat_kerja ?? prev.bakat_kerja,
                temperamen_kerja: d?.temperamen_kerja ?? prev.temperamen_kerja,
                minat_kerja: d?.minat_kerja ?? prev.minat_kerja,
                upaya_fisik: d?.upaya_fisik ?? prev.upaya_fisik,
                fungsi_pekerja: d?.fungsi_pekerja ?? prev.fungsi_pekerja,
                kondisi_fisik_jenkel: d?.kondisi_fisik_jenkel ?? prev.kondisi_fisik_jenkel,
                kondisi_fisik_umur: d?.kondisi_fisik_umur ?? prev.kondisi_fisik_umur,
                kondisi_fisik_tb: d?.kondisi_fisik_tb ?? prev.kondisi_fisik_tb,
                kondisi_fisik_bb: d?.kondisi_fisik_bb ?? prev.kondisi_fisik_bb,
                kondisi_fisik_pb: d?.kondisi_fisik_pb ?? prev.kondisi_fisik_pb,
                kondisi_fisik_tampilan: d?.kondisi_fisik_tampilan ?? prev.kondisi_fisik_tampilan,
                kondisi_fisik_keadaan: d?.kondisi_fisik_keadaan ?? prev.kondisi_fisik_keadaan,
            } : null);

            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Syarat Jabatan disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(false);
        }
    }

    if (!hasKey || !resolvedId) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                }
                title="Syarat Jabatan"
                description="ID (UUID) untuk path ini belum ditemukan. Buka halaman create terlebih dahulu."
            >
                <div className="text-center py-8">
                    <p className="text-red-600 dark:text-red-400 mb-4">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                        lalu kembali ke halaman ini.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        <button 
                            onClick={retry}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Coba lagi
                        </button>
                        <Link 
                            href={`/anjab/${viewerPath}`} 
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                }
                title="Syarat Jabatan"
                description="Memuat data syarat jabatan..."
            >
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Memuat data...</p>
                </div>
            </EditSectionWrapper>
        );
    }
    
    

    if (!row) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                }
                title="Syarat Jabatan"
                description="Data tidak tersedia"
            >
                <div className="text-center py-8">
                    <p className="text-red-600 dark:text-red-400 mb-4">Data tidak tersedia.</p>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            }
            title="Syarat Jabatan"
            description="Kelola syarat dan kompetensi yang diperlukan untuk jabatan ini"
        >
            <div className="space-y-8">
                {/* Kolom array */}
                <FormSection title="Kompetensi Kerja">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ListInput 
                            title="Keterampilan Kerja" 
                            placeholder="Mis. Menyusun laporan, Analisis data"
                            value={row.keterampilan_kerja}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), keterampilan_kerja: v }))}
                        />
                        <ListInput 
                            title="Bakat Kerja" 
                            placeholder="Mis. Kecermatan, Ketelitian"
                            value={row.bakat_kerja}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), bakat_kerja: v }))}
                        />
                        <ListInput 
                            title="Temperamen Kerja" 
                            placeholder="Mis. Stabil, Tegas"
                            value={row.temperamen_kerja}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), temperamen_kerja: v }))}
                        />
                        <ListInput 
                            title="Minat Kerja" 
                            placeholder="Mis. Administrasi, Pelayanan publik"
                            value={row.minat_kerja}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), minat_kerja: v }))}
                        />
                        <ListInput 
                            title="Upaya Fisik" 
                            placeholder="Mis. Berjalan, Duduk lama"
                            value={row.upaya_fisik}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), upaya_fisik: v }))}
                        />
                        <ListInput 
                            title="Fungsi Pekerja" 
                            placeholder="Mis. Koordinasi, Pengawasan"
                            value={row.fungsi_pekerja}
                            onChange={(v) => setRow(r => ({ ...(r as SJRow), fungsi_pekerja: v }))}
                        />
                    </div>
                </FormSection>

                {/* Kolom scalar (kondisi fisik) */}
                <FormSection title="Kondisi Fisik">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Jenis Kelamin</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_jenkel}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_jenkel: e.target.value }))}
                                    placeholder="Mis. L/P" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Umur</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_umur}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_umur: e.target.value }))}
                                    placeholder="Mis. 25-50 th" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Postur Badan</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_pb}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_pb: e.target.value }))}
                                    placeholder="Mis. Proporsional" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tinggi Badan</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_tb}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_tb: e.target.value }))}
                                    placeholder="Mis. 160 cm" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Berat Badan</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_bb}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_bb: e.target.value }))}
                                    placeholder="Mis. 50-80 kg" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tampilan</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_tampilan}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_tampilan: e.target.value }))}
                                    placeholder="Mis. Rapi" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keadaan Fisik</label>
                                <input 
                                    type="text" 
                                    value={row.kondisi_fisik_keadaan}
                                    onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_keadaan: e.target.value }))}
                                    placeholder="Mis. Sehat jasmani & rohani" 
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                </FormSection>

                <div className="flex items-center gap-3 pt-4">
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Menyimpan...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Simpan
                            </>
                        )}
                    </button>
                </div>
            </div>

        </EditSectionWrapper>
    );
}
