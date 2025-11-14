"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useMe } from "@/context/MeContext";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

type PetaJabatan = {
    id: string;
    nama_jabatan: string;
    jabatan_id: string | null;
    matched_anjab?: string;
};

type MasterAnjab = {
    id: string;
    nama_jabatan: string;
};

type MatchSuggestion = {
    peta_id: string;
    peta_nama: string;
    anjab_id: string;
    anjab_nama: string;
    similarity: number;
};

export default function AnjabMatchPage() {
    const router = useRouter();
    const { isAdmin, loading: meLoading } = useMe();
    const [petaJabatanList, setPetaJabatanList] = useState<PetaJabatan[]>([]);
    const [masterAnjabList, setMasterAnjabList] = useState<MasterAnjab[]>([]);
    const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!meLoading && !isAdmin) {
            router.push("/");
        }
    }, [isAdmin, meLoading, router]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load peta jabatan yang belum punya anjab
            const petaRes = await apiFetch("/api/peta-jabatan/unmatched", {
                method: "GET",
            });
            
            // Load master anjab
            const anjabRes = await apiFetch("/api/anjab/list", {
                method: "GET",
            });

            if (petaRes.ok && anjabRes.ok) {
                const petaData = await petaRes.json();
                const anjabData = await anjabRes.json();
                
                setPetaJabatanList(petaData || []);
                setMasterAnjabList(anjabData || []);

                // Generate suggestions
                await generateSuggestions(petaData, anjabData);
            }
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const generateSuggestions = async (petaList: PetaJabatan[], anjabList: MasterAnjab[]) => {
        try {
            const res = await apiFetch("/api/anjab/match-suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    peta_jabatan: petaList.map(p => ({ id: p.id, nama: p.nama_jabatan })),
                    master_anjab: anjabList.map(a => ({ id: a.id, nama: a.nama_jabatan }))
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.suggestions || []);
            }
        } catch (error) {
            console.error("Error generating suggestions:", error);
        }
    };

    const handleAutoMatch = async () => {
        const perfectMatches = suggestions.filter(s => s.similarity === 1.0);
        
        if (perfectMatches.length === 0) {
            await Swal.fire({
                icon: "info",
                title: "Tidak Ada Match 100%",
                text: "Tidak ada peta jabatan yang cocok 100% dengan master anjab. Silakan gunakan tombol Pasangkan untuk matching manual.",
            });
            return;
        }
        
        const result = await Swal.fire({
            title: "Auto Match Anjab?",
            html: `Sistem akan otomatis memasangkan <b>${perfectMatches.length}</b> peta jabatan dengan master anjab yang cocok 100%.<br/><br/>Proses ini dapat diubah nanti.`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Ya, Auto Match",
            cancelButtonText: "Batal",
            confirmButtonColor: "#10B981",
            cancelButtonColor: "#EF4444",
        });

        if (!result.isConfirmed) return;

        setProcessing(true);
        try {
            const res = await apiFetch("/api/anjab/auto-match", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggestions }),
            });

            if (res.ok) {
                const data = await res.json();
                await Swal.fire({
                    icon: "success",
                    title: "Berhasil!",
                    text: `${data.matched_count} peta jabatan berhasil dipasangkan dengan anjab`,
                });
                loadData();
            } else {
                const error = await res.json();
                await Swal.fire({
                    icon: "error",
                    title: "Gagal",
                    text: error.error || "Terjadi kesalahan",
                });
            }
        } catch (error) {
            console.error("Error auto matching:", error);
            await Swal.fire({
                icon: "error",
                title: "Gagal",
                text: "Terjadi kesalahan saat auto matching",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleManualMatch = async (petaId: string, anjabId: string) => {
        setProcessing(true);
        try {
            const res = await apiFetch(`/api/peta-jabatan/${petaId}/match`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jabatan_id: anjabId }),
            });

            if (res.ok) {
                await Swal.fire({
                    icon: "success",
                    title: "Berhasil!",
                    text: "Peta jabatan berhasil dipasangkan",
                    timer: 1500,
                    showConfirmButton: false,
                });
                loadData();
            }
        } catch (error) {
            console.error("Error manual matching:", error);
        } finally {
            setProcessing(false);
        }
    };

    if (meLoading || loading) {
        return (
            <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Memuat...</p>
                </div>
            </div>
        );
    }

    if (!isAdmin) return null;

    return (
        <div className="pt-6 min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="p-6 max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Match Peta Jabatan dengan Master Anjab
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Pasangkan peta jabatan yang belum memiliki anjab dengan master anjab yang sesuai
                    </p>
                </div>

                {/* Stats & Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-6">
                            <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Peta Jabatan Belum Match</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{petaJabatanList.length}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Master Anjab Tersedia</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{masterAnjabList.length}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Saran Auto Match</div>
                                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{suggestions.length}</div>
                            </div>
                        </div>
                        <button
                            onClick={handleAutoMatch}
                            disabled={processing || suggestions.length === 0}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Auto Match Semua
                        </button>
                    </div>
                </div>

                {/* Suggestions List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Saran Matching ({suggestions.length})
                        </h2>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Peta Jabatan
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Master Anjab
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Similarity
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {suggestions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                            Tidak ada saran matching. Semua peta jabatan sudah memiliki anjab.
                                        </td>
                                    </tr>
                                ) : (
                                    suggestions.map((sug, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                                {sug.peta_nama}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                                {sug.anjab_nama}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    sug.similarity > 0.8 
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                        : sug.similarity > 0.5
                                                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {Math.round(sug.similarity * 100)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => handleManualMatch(sug.peta_id, sug.anjab_id)}
                                                    disabled={processing}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Pasangkan
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
