"use client";

import { useEffect, useState, useMemo } from "react";
import EditSectionWrapper, { FormSection } from "@/components/form/EditSectionWrapper";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import WordAbk from "@/components/form/form-elements/WordAbk";

const MySwal = withReactContent(Swal);

type TugasPokokABK = {
    id: string;
    peta_jabatan_id: string;
    tugas_pokok_id: number;
    jumlah_hasil: number | null;
    waktu_penyelesaian_jam: number | null;
    waktu_efektif: number | null;
    kebutuhan_pegawai: number | null;
    uraian: string;
    hasil_kerja: any;
    tp_jumlah_hasil: number | null;
    satuan_hasil: string | null;
    tp_waktu_penyelesaian: number | null;
};

export default function TugasPokokABKSection({
    id,
    viewerPath,
}: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [petaJabatanId, setPetaJabatanId] = useState<string>("");
    const [tugasList, setTugasList] = useState<TugasPokokABK[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [jabatanId, setJabatanId] = useState<string>("");

    // 1. Resolve peta_jabatan_id dari slug path atau fallback ke jabatan_id
    useEffect(() => {
        const resolvePetaId = async () => {
            try {
                // Coba resolve dari peta_jabatan dulu
                const response = await fetch(`/api/peta-resolve?slug=${encodeURIComponent(viewerPath)}`);
                const res = await response.json();
                
                if (res.success && res.data?.peta_jabatan_id) {
                    setPetaJabatanId(res.data.peta_jabatan_id);
                    if (res.data?.jabatan_id) {
                        setJabatanId(res.data.jabatan_id);
                    }
                } else {
                    // Fallback: coba ambil peta_jabatan_id berdasarkan jabatan_id
                    // Ambil jabatan_id dari localStorage (disimpan oleh resolveIdFromStorage)
                    const slugKey = viewerPath.split("/").filter(Boolean).slice(-2).join("/");
                    const resolvedJabatanId = localStorage.getItem(slugKey);
                    
                    if (resolvedJabatanId) {
                        setJabatanId(resolvedJabatanId);
                        // Query peta_jabatan berdasarkan jabatan_id
                        const petaResponse = await fetch(`/api/peta-jabatan?jabatan_id=${resolvedJabatanId}`);
                        const petaRes = await petaResponse.json();
                        console.log("Peta response:", petaRes);
                        
                        if (petaRes.success && petaRes.data && Array.isArray(petaRes.data) && petaRes.data.length > 0) {
                            setPetaJabatanId(petaRes.data[0].id);
                        } else if (Array.isArray(petaRes) && petaRes.length > 0) {
                            // Fallback jika response langsung array tanpa wrapper
                            setPetaJabatanId(petaRes[0].id);
                        } else {
                            setError("Data peta jabatan belum dibuat untuk jabatan ini");
                            setLoading(false);
                        }
                    } else {
                        setError("Peta jabatan tidak ditemukan untuk path ini");
                        setLoading(false);
                    }
                }
            } catch (err: any) {
                console.error("Error resolving peta_jabatan_id:", err);
                setError(err.message || "Gagal resolve peta jabatan");
                setLoading(false);
            }
        };

        resolvePetaId();
    }, [viewerPath]);

    // 2. Load data tugas_pokok_abk
    useEffect(() => {
        if (!petaJabatanId) return;

        const loadData = async () => {
            setLoading(true);
            setError(null);
            
            try {
                const response = await fetch(`/api/tugas-pokok-abk?peta_jabatan_id=${petaJabatanId}`);
                const res = await response.json();
                
                if (res.success) {
                    // Konversi string ke number dan hitung ulang kebutuhan_pegawai
                    const dataWithCalculation = (res.data || []).map((item: TugasPokokABK) => {
                        // Convert string to number
                        const jumlahHasil = typeof item.jumlah_hasil === 'string' ? parseFloat(item.jumlah_hasil) : item.jumlah_hasil;
                        const waktuPenyelesaian = typeof item.waktu_penyelesaian_jam === 'string' ? parseFloat(item.waktu_penyelesaian_jam) : item.waktu_penyelesaian_jam;
                        const waktuEfektif = typeof item.waktu_efektif === 'string' ? parseFloat(item.waktu_efektif) : item.waktu_efektif;
                        
                        // Selalu hitung ulang kebutuhan_pegawai (jangan pakai nilai dari DB yang mungkin salah)
                        const calculated = computeKebutuhanPegawai(
                            jumlahHasil,
                            waktuPenyelesaian,
                            waktuEfektif
                        );
                        
                        return {
                            ...item,
                            jumlah_hasil: jumlahHasil,
                            waktu_penyelesaian_jam: waktuPenyelesaian,
                            waktu_efektif: waktuEfektif,
                            kebutuhan_pegawai: calculated // Gunakan hasil perhitungan, bukan dari DB
                        };
                    });
                    console.log('Loaded ABK data:', dataWithCalculation);
                    setTugasList(dataWithCalculation);
                } else {
                    setError(res.error || "Gagal load data");
                }
            } catch (err: any) {
                console.error("Error loading tugas_pokok_abk:", err);
                setError(err.message || "Gagal load data");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [petaJabatanId]);

    // 3. Hitung kebutuhan pegawai otomatis
    function computeKebutuhanPegawai(jumlah_hasil: number | null, waktu_penyelesaian_jam: number | null, waktu_efektif: number | null): number {
        const j = Number(jumlah_hasil ?? 0);
        const w = Number(waktu_penyelesaian_jam ?? 0);
        const e = Number(waktu_efektif ?? 0);
        if (!Number.isFinite(j) || !Number.isFinite(w) || !Number.isFinite(e) || e <= 0) return 0;
        return (j * w) / e;
    }

    // 4. Update ABK data
    const updateABK = (index: number, field: keyof TugasPokokABK, value: any) => {
        setTugasList((prev) => {
            const next = [...prev];
            const before = next[index];
            const willTrigger =
                field === "jumlah_hasil" ||
                field === "waktu_penyelesaian_jam" ||
                field === "waktu_efektif";
            
            const merged = { ...before, [field]: value };
            
            if (willTrigger) {
                merged.kebutuhan_pegawai = computeKebutuhanPegawai(
                    merged.jumlah_hasil,
                    merged.waktu_penyelesaian_jam,
                    merged.waktu_efektif
                );
            }
            
            next[index] = merged;
            return next;
        });
    };

    // 5. Save ABK data
    const saveABK = async (index: number) => {
        const tugas = tugasList[index];
        setSaving(true);
        
        try {
            const kp = computeKebutuhanPegawai(
                tugas.jumlah_hasil,
                tugas.waktu_penyelesaian_jam,
                tugas.waktu_efektif
            );

            const payload = {
                peta_jabatan_id: petaJabatanId,
                tugas_pokok_id: tugas.tugas_pokok_id,
                jumlah_hasil: tugas.jumlah_hasil,
                waktu_penyelesaian_jam: tugas.waktu_penyelesaian_jam,
                waktu_efektif: tugas.waktu_efektif,
                kebutuhan_pegawai: kp,
            };

            const method = tugas.id ? "PUT" : "POST";
            const body = tugas.id ? { ...payload, id: tugas.id } : payload;
            
            const response = await fetch("/api/tugas-pokok-abk", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const res = await response.json();

            if (res.success) {
                // Reload data
                const reloadResponse = await fetch(`/api/tugas-pokok-abk?peta_jabatan_id=${petaJabatanId}`);
                const reloadRes = await reloadResponse.json();
                
                if (reloadRes.success) {
                    // Konversi dan hitung ulang
                    const dataWithCalculation = (reloadRes.data || []).map((item: TugasPokokABK) => {
                        const jumlahHasil = typeof item.jumlah_hasil === 'string' ? parseFloat(item.jumlah_hasil) : item.jumlah_hasil;
                        const waktuPenyelesaian = typeof item.waktu_penyelesaian_jam === 'string' ? parseFloat(item.waktu_penyelesaian_jam) : item.waktu_penyelesaian_jam;
                        const waktuEfektif = typeof item.waktu_efektif === 'string' ? parseFloat(item.waktu_efektif) : item.waktu_efektif;
                        const calculated = computeKebutuhanPegawai(jumlahHasil, waktuPenyelesaian, waktuEfektif);
                        
                        return {
                            ...item,
                            jumlah_hasil: jumlahHasil,
                            waktu_penyelesaian_jam: waktuPenyelesaian,
                            waktu_efektif: waktuEfektif,
                            kebutuhan_pegawai: calculated
                        };
                    });
                    setTugasList(dataWithCalculation);
                    
                    // Hitung total dan update peta_jabatan
                    const newTotal = dataWithCalculation.reduce((sum, r) => sum + (Number.isFinite(r.kebutuhan_pegawai) ? r.kebutuhan_pegawai : 0), 0);
                    const newPembulatan = Math.ceil(newTotal);
                    
                    // Update peta_jabatan.kebutuhan_pegawai
                    await fetch("/api/peta-jabatan/update-kebutuhan", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            peta_jabatan_id: petaJabatanId, 
                            kebutuhan_pegawai: newPembulatan 
                        })
                    });
                }
                
                await MySwal.fire({
                    icon: "success",
                    title: "Tersimpan",
                    text: "Data ABK berhasil disimpan dan total kebutuhan pegawai telah diperbarui."
                });
            } else {
                await MySwal.fire({
                    icon: "error",
                    title: "Gagal",
                    text: res.error || "Gagal menyimpan data"
                });
            }
        } catch (err: any) {
            console.error("Error saving ABK:", err);
            await MySwal.fire({
                icon: "error",
                title: "Error",
                text: err.message || "Gagal menyimpan data"
            });
        } finally {
            setSaving(false);
        }
    };

    // 6. Hitung total dan pembulatan
    const totalKebutuhan = useMemo(
        () => (tugasList ?? []).reduce((sum, r) => sum + (Number.isFinite(r.kebutuhan_pegawai as any) ? (r.kebutuhan_pegawai as number) : 0), 0),
        [tugasList]
    );
    const pembulatan = useMemo(() => Math.ceil(totalKebutuhan), [totalKebutuhan]);

    if (loading) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    </svg>
                }
                title="Beban Kerja"
                description="Memuat data beban kerja..."
            >
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Memuat data...</p>
                </div>
            </EditSectionWrapper>
        );
    }

    if (error) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                }
                title="Beban Kerja"
                description={error}
            >
                <div className="text-center py-12">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
            </EditSectionWrapper>
        );
    }

    if (tugasList.length === 0) {
        return (
            <EditSectionWrapper
                icon={
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                }
                title="Beban Kerja"
                description="Belum ada data ABK untuk jabatan ini"
            >
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-4">
                        <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L4.168 15.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div className="flex-1">
                            <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                                Sebagian kolom pada Tugas Pokok belum terisi
                            </h4>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                                Unggah dokumen ABK untuk melengkapi secara otomatis.
                            </p>
                        </div>
                    </div>
                    <WordAbk id={jabatanId} petaJabatanId={petaJabatanId} viewerPath={viewerPath} />
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
            }
            title="Beban Kerja"
            description="Kelola data Analisis Beban Kerja untuk setiap tugas pokok"
        >
            <div className="space-y-6">
                {/* Summary - Total Kebutuhan Pegawai */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">Jumlah Pegawai Yang Dibutuhkan</label>
                        <input
                            type="number"
                            value={Number.isFinite(totalKebutuhan) ? totalKebutuhan.toFixed(4) : 0}
                            readOnly
                            disabled
                            className="w-full rounded border px-3 py-2 bg-gray-100 dark:bg-gray-800"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Pembulatan</label>
                        <input
                            type="number"
                            value={pembulatan}
                            readOnly
                            disabled
                            className="w-full rounded border px-3 py-2 bg-gray-100 dark:bg-gray-800"
                        />
                    </div>
                </div>

                {/* List Tugas Pokok */}
                <div className="space-y-6">
                    {tugasList.map((tugas, idx) => (
                        <FormSection key={tugas.tugas_pokok_id} title={`Tugas Pokok ${idx + 1}`}>
                            <div className="space-y-4">
                                {/* Uraian Tugas - Read Only */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">Uraian Tugas</label>
                                    <div className="w-full px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                                        {tugas.uraian || "-"}
                                    </div>
                                </div>

                                {/* Field ABK - Editable */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold mb-1">Jumlah Hasil</label>
                                        <input
                                            type="number"
                                            value={tugas.jumlah_hasil ?? ""}
                                            onChange={(e) => updateABK(idx, "jumlah_hasil", e.target.value === "" ? null : Number(e.target.value))}
                                            className="w-full rounded border px-3 py-2"
                                            inputMode="numeric"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-bold mb-1">Waktu Penyelesaian (jam)</label>
                                        <input
                                            type="number"
                                            value={tugas.waktu_penyelesaian_jam ?? ""}
                                            onChange={(e) => updateABK(idx, "waktu_penyelesaian_jam", e.target.value === "" ? null : Number(e.target.value))}
                                            className="w-full rounded border px-3 py-2"
                                            inputMode="numeric"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-bold mb-1">Waktu Efektif</label>
                                        <input
                                            type="number"
                                            value={tugas.waktu_efektif ?? ""}
                                            onChange={(e) => updateABK(idx, "waktu_efektif", e.target.value === "" ? null : Number(e.target.value))}
                                            className="w-full rounded border px-3 py-2"
                                            inputMode="numeric"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-bold mb-1">Kebutuhan Pegawai</label>
                                        <input
                                            type="text"
                                            value={tugas.kebutuhan_pegawai != null && typeof tugas.kebutuhan_pegawai === 'number' ? tugas.kebutuhan_pegawai.toFixed(4) : '0.0000'}
                                            readOnly
                                            disabled
                                            className="w-full rounded border px-3 py-2 bg-gray-100 dark:bg-gray-800"
                                        />
                                    </div>
                                </div>

                                {/* Save Button */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => saveABK(idx)}
                                        disabled={saving}
                                        className="px-4 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50"
                                    >
                                        {saving ? "Menyimpan..." : "Simpan"}
                                    </button>
                                </div>
                            </div>
                        </FormSection>
                    ))}
                </div>
            </div>
        </EditSectionWrapper>
    );
}

// Helper component untuk NumberInput consistency
function NumberInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
    return (
        <div>
            <label className="block text-sm font-bold mb-1">{label}</label>
            <input
                type="number"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full rounded border px-3 py-2"
                inputMode="numeric"
                pattern="[0-9]*"
            />
        </div>
    );
}
