"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useMe } from "@/context/MeContext";
import { useSotk } from "@/context/SotkContext";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

type PetaJabatan = {
    id: string;
    nama_jabatan: string;
    jabatan_id: string | null;
    unit_kerja?: string;
    matched_anjab?: string;
    versi_id?: string;
    nama_versi?: string;
    versi_status?: string;
};

type MasterAnjab = {
    id: string;
    nama_jabatan: string;
};

type MatchSuggestion = {
    peta_id: string;
    peta_nama: string;
    versi_id?: string;
    nama_versi?: string;
    anjab_id: string;
    anjab_nama: string;
    similarity: number;
};

type TabType = "unmatched" | "matched";

export default function AnjabMatchPage() {
    const router = useRouter();
    const { isAdmin, loading: meLoading } = useMe();
    const { activeVersion, versions } = useSotk();

    const [selectedVersion, setSelectedVersion] = useState<string>("AKTIF");
    const [activeTab, setActiveTab] = useState<TabType>("unmatched");
    const [petaJabatanList, setPetaJabatanList] = useState<PetaJabatan[]>([]);
    const [matchedPetaJabatanList, setMatchedPetaJabatanList] = useState<PetaJabatan[]>([]);
    const [masterAnjabList, setMasterAnjabList] = useState<MasterAnjab[]>([]);
    const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);

    useEffect(() => {
        if (!meLoading && !isAdmin) {
            const t = setTimeout(() => router.replace('/'), 1400);
            return () => clearTimeout(t);
        }
    }, [isAdmin, meLoading, router]);

    // Sinkronkan versi awal dengan activeVersion dari context jika belum pernah diset manual
    useEffect(() => {
        if (activeVersion && selectedVersion === "AKTIF" && activeVersion !== "AKTIF") {
            setSelectedVersion(activeVersion);
        }
    }, [activeVersion, selectedVersion]);

    const generateSuggestions = useCallback(async (petaList: PetaJabatan[], anjabList: MasterAnjab[]) => {
        try {
            const res = await apiFetch("/api/anjab/match-suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    peta_jabatan: petaList.map(p => ({ 
                        id: p.id, 
                        nama: p.nama_jabatan,
                        versi_id: p.versi_id,
                        nama_versi: p.nama_versi
                    })),
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
    }, []);

    const loadData = useCallback(async (verId: string = selectedVersion) => {
        setLoading(true);
        try {
            const queryParam = `?versi_id=${encodeURIComponent(verId)}`;

            // Load peta jabatan yang belum punya anjab (unmatched)
            const petaRes = await apiFetch(`/api/peta-jabatan/unmatched${queryParam}`, {
                method: "GET",
                cache: "no-store",
            });

            // Load peta jabatan yang sudah punya anjab (matched)
            const matchedRes = await apiFetch(`/api/peta-jabatan/matched${queryParam}`, {
                method: "GET",
                cache: "no-store",
            });

            // Load master anjab
            const anjabRes = await apiFetch("/api/anjab/list", {
                method: "GET",
                cache: "no-store",
            });

            if (petaRes.ok && matchedRes.ok && anjabRes.ok) {
                const petaData = await petaRes.json();
                const matchedData = await matchedRes.json();
                const anjabData = await anjabRes.json();

                setPetaJabatanList(petaData || []);
                setMatchedPetaJabatanList(matchedData || []);
                setMasterAnjabList(anjabData || []);

                // Generate suggestions for unmatched only
                await generateSuggestions(petaData, anjabData);
            }
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedVersion, generateSuggestions]);

    useEffect(() => {
        loadData(selectedVersion);
    }, [selectedVersion, loadData]);

    // Reset search when tab changes
    useEffect(() => {
        setSearchQuery("");
    }, [activeTab]);

    // Reset to page 1 when search or tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeTab, selectedVersion]);

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

        const currentVersiObj = versions.find(v => v.id === selectedVersion);
        const versiLabel = currentVersiObj?.nama_versi || "Versi Terpilih";

        const result = await Swal.fire({
            title: "Auto Match Anjab?",
            html: `Sistem akan otomatis memasangkan <b>${perfectMatches.length}</b> peta jabatan dengan master anjab yang cocok 100% pada <b>${versiLabel}</b>.<br/><br/>Proses ini dapat diubah nanti.`,
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
                body: JSON.stringify({ suggestions, versi_id: selectedVersion }),
            });

            if (res.ok) {
                const data = await res.json();
                await Swal.fire({
                    icon: "success",
                    title: "Berhasil!",
                    text: `${data.matched_count} peta jabatan berhasil dipasangkan dengan anjab`,
                });
                loadData(selectedVersion);
            } else {
                const error = await res.json();
                await Swal.fire({
                    icon: "error",
                    title: "Gagal",
                    text: error.error || "Terjadi kesalahan",
                });
            }
        } catch (error) {
            await Swal.fire({
                icon: "error",
                title: "Gagal",
                text: "Terjadi kesalahan saat auto matching",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleManualMatch = async (petaId: string, anjabId: string, itemVersiId?: string) => {
        setProcessing(true);
        try {
            const res = await apiFetch(`/api/peta-jabatan/${petaId}/match`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    jabatan_id: anjabId, 
                    versi_id: itemVersiId || selectedVersion 
                }),
            });

            if (res.ok) {
                await Swal.fire({
                    icon: "success",
                    title: "Berhasil!",
                    text: "Peta jabatan berhasil dipasangkan",
                    timer: 1500,
                    showConfirmButton: false,
                });
                await loadData(selectedVersion);
            } else {
                const error = await res.json();
                await Swal.fire({
                    icon: "error",
                    title: "Gagal",
                    text: error.error || "Gagal memasangkan jabatan",
                });
            }
        } catch (error) {
            await Swal.fire({
                icon: "error",
                title: "Gagal",
                text: "Terjadi kesalahan sistem",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleUnmatch = async (petaId: string, namaJabatan: string, itemVersiId?: string) => {
        const result = await Swal.fire({
            title: "Lepas Pasangan?",
            html: `Yakin ingin melepas pasangan anjab untuk "<b>${namaJabatan}</b>"?<br/><br/>Anda dapat memasangkan kembali nanti.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Ya, Lepas",
            cancelButtonText: "Batal",
            confirmButtonColor: "#EF4444",
            cancelButtonColor: "#6B7280",
        });

        if (!result.isConfirmed) return;

        setProcessing(true);
        try {
            const res = await apiFetch(`/api/peta-jabatan/${petaId}/unmatch`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    versi_id: itemVersiId || selectedVersion 
                }),
            });

            if (res.ok) {
                await Swal.fire({
                    icon: "success",
                    title: "Berhasil!",
                    text: "Pasangan anjab berhasil dilepas",
                    timer: 1500,
                    showConfirmButton: false,
                });
                await loadData(selectedVersion);
            } else {
                const error = await res.json();
                await Swal.fire({
                    icon: "error",
                    title: "Gagal",
                    text: error.error || "Terjadi kesalahan",
                });
            }
        } catch (error) {
            await Swal.fire({
                icon: "error",
                title: "Gagal",
                text: "Terjadi kesalahan saat melepas pasangan",
            });
        } finally {
            setProcessing(false);
        }
    };

    // Filter data based on search query
    const filteredUnmatched = suggestions.filter((sug) =>
        sug.peta_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sug.anjab_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sug.nama_versi && sug.nama_versi.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const filteredMatched = matchedPetaJabatanList.filter((item) =>
        item.nama_jabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.matched_anjab && item.matched_anjab.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.unit_kerja && item.unit_kerja.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.nama_versi && item.nama_versi.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Pagination logic
    const totalPagesUnmatched = Math.ceil(filteredUnmatched.length / itemsPerPage);
    const totalPagesMatched = Math.ceil(filteredMatched.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedUnmatched = filteredUnmatched.slice(startIndex, endIndex);
    const paginatedMatched = filteredMatched.slice(startIndex, endIndex);

    const currentVersiObj = versions.find(v => v.id === selectedVersion) || versions.find(v => v.status === 'AKTIF');

    if (meLoading || loading) {
        return (
            <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Memuat Data Match...</p>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md text-center">
                    <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Akses Ditolak</h3>
                    <p className="text-red-600 dark:text-red-300 text-sm">Halaman ini hanya dapat diakses oleh Admin</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8 pt-6">
            <div className="">
                <div className="mb-4 sm:mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Match Peta Jabatan dengan Master Anjab
                    </h1>
                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                        Pasangkan peta jabatan dengan master anjab yang sesuai per versi SOTK / Peta Jabatan
                    </p>
                </div>

                {/* Stats & Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-6">
                    {/* Selector Versi Peta Jabatan */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-5 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Versi Peta Jabatan:
                            </span>
                            <select
                                value={selectedVersion}
                                onChange={(e) => setSelectedVersion(e.target.value)}
                                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
                            >
                                {versions.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.status === 'AKTIF' ? '⭐ ' : ''}{v.nama_versi} ({v.status})
                                    </option>
                                ))}
                            </select>
                            {currentVersiObj && (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    currentVersiObj.status === 'AKTIF'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        : currentVersiObj.status === 'DRAFT'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {currentVersiObj.status === 'AKTIF' ? 'Status: Aktif Publik' : `Status: ${currentVersiObj.status}`}
                                </span>
                            )}
                        </div>

                        {currentVersiObj && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Menampilkan data spesifik: <b className="text-gray-800 dark:text-gray-200">{currentVersiObj.nama_versi}</b>
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid grid-cols-3 gap-3 sm:gap-6">
                            <div>
                                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Belum Match</div>
                                <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{petaJabatanList.length}</div>
                            </div>
                            <div>
                                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Sudah Match</div>
                                <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{matchedPetaJabatanList.length}</div>
                            </div>
                            <div>
                                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Saran</div>
                                <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{suggestions.length}</div>
                            </div>
                        </div>
                        {activeTab === "unmatched" && (
                            <button
                                onClick={handleAutoMatch}
                                disabled={processing || suggestions.length === 0}
                                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-brand-600 text-white text-sm sm:text-base rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shadow-sm"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="hidden sm:inline">Auto Match Semua (100%)</span>
                                <span className="sm:hidden">Auto Match</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="bg-gradient-to-b from-brand-25 via-white to-blue-light-25 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari peta jabatan, unit kerja, versi, atau master anjab..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-2 sm:space-x-8">
                        <button
                            onClick={() => setActiveTab("unmatched")}
                            className={`${
                                activeTab === "unmatched"
                                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                            } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
                        >
                            <span className="hidden sm:inline">Belum Match ({petaJabatanList.length})</span>
                            <span className="sm:hidden">Belum Match</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("matched")}
                            className={`${
                                activeTab === "matched"
                                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                            } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
                        >
                            <span className="hidden sm:inline">Sudah Match ({matchedPetaJabatanList.length})</span>
                            <span className="sm:hidden">Sudah Match</span>
                        </button>
                    </nav>
                </div>

                {/* Content */}
                {activeTab === "unmatched" ? (
                    /* Unmatched Tab - Suggestions List */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                                Saran Matching ({filteredUnmatched.length})
                            </h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px]">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Peta Jabatan
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Versi SOTK
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Master Anjab
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Match
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredUnmatched.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 sm:px-6 py-8 sm:py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                                                {searchQuery
                                                    ? "Tidak ada hasil yang cocok dengan pencarian."
                                                    : "Tidak ada saran matching. Semua peta jabatan pada versi ini sudah memiliki anjab."}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedUnmatched.map((sug, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                                                    {sug.peta_nama}
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                        {sug.nama_versi || sug.versi_id || "Versi Aktif"}
                                                    </span>
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-900 dark:text-white">
                                                    {sug.anjab_nama}
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                                                    <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        sug.similarity > 0.8
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                            : sug.similarity > 0.5
                                                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                            : 'bg-gray-50 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                    }`}>
                                                        {Math.round(sug.similarity * 100)}%
                                                    </span>
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                                                    <button
                                                        onClick={() => handleManualMatch(sug.peta_id, sug.anjab_id, sug.versi_id)}
                                                        disabled={processing}
                                                        className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 transition-colors disabled:opacity-50"
                                                    >
                                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        <span className="hidden sm:inline">Pasangkan</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls for Unmatched */}
                        {totalPagesUnmatched > 1 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center sm:justify-between gap-3 px-4 sm:px-6 pb-4">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    Halaman {currentPage} dari {totalPagesUnmatched} ({filteredUnmatched.length} total)
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPagesUnmatched }, (_, i) => i + 1)
                                            .filter(page => {
                                                if (page === 1 || page === totalPagesUnmatched) return true;
                                                if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                                                return false;
                                            })
                                            .map((page, idx, arr) => (
                                                <React.Fragment key={page}>
                                                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                                                        <span className="px-2 text-gray-400">...</span>
                                                    )}
                                                    <button
                                                        onClick={() => setCurrentPage(page)}
                                                        className={`px-3 py-2 text-sm text-center rounded-lg transition-colors ${
                                                            currentPage === page
                                                                ? 'bg-brand-600 text-white'
                                                                : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        {page}
                                                    </button>
                                                </React.Fragment>
                                            ))
                                        }
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPagesUnmatched, prev + 1))}
                                        disabled={currentPage === totalPagesUnmatched}
                                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Matched Tab - List of Matched Items */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                                Peta Jabatan yang Sudah Match ({filteredMatched.length})
                            </h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px]">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Peta Jabatan
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Versi SOTK
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Unit Kerja
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Master Anjab
                                        </th>
                                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredMatched.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 sm:px-6 py-8 sm:py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                                                {searchQuery
                                                    ? "Tidak ada hasil yang cocok dengan pencarian."
                                                    : "Belum ada peta jabatan yang di-match pada versi ini."}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedMatched.map((item) => (
                                            <tr key={`${item.id}-${item.versi_id || 'v'}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                                                    {item.nama_jabatan}
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                                                        item.versi_status === 'AKTIF'
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                                            : item.versi_status === 'DRAFT'
                                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                                            : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                                    }`}>
                                                        {item.nama_versi || item.versi_id || "Versi Aktif"}
                                                    </span>
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                                    {item.unit_kerja || "-"}
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-900 dark:text-white">
                                                    {item.matched_anjab || "-"}
                                                </td>
                                                <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                                                    <button
                                                        onClick={() => handleUnmatch(item.id, item.nama_jabatan, item.versi_id)}
                                                        disabled={processing}
                                                        className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                                                    >
                                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                        <span className="hidden sm:inline">Lepas</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls for Matched */}
                        {totalPagesMatched > 1 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center sm:justify-between gap-3 px-4 sm:px-6 pb-4">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    Halaman {currentPage} dari {totalPagesMatched} ({filteredMatched.length} total)
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPagesMatched }, (_, i) => i + 1)
                                            .filter(page => {
                                                if (page === 1 || page === totalPagesMatched) return true;
                                                if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                                                return false;
                                            })
                                            .map((page, idx, arr) => (
                                                <React.Fragment key={page}>
                                                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                                                        <span className="px-2 text-gray-400">...</span>
                                                    )}
                                                    <button
                                                        onClick={() => setCurrentPage(page)}
                                                        className={`px-3 py-2 text-sm text-center rounded-lg transition-colors ${
                                                            currentPage === page
                                                                ? 'bg-brand-600 text-white'
                                                                : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        {page}
                                                    </button>
                                                </React.Fragment>
                                            ))
                                        }
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPagesMatched, prev + 1))}
                                        disabled={currentPage === totalPagesMatched}
                                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
