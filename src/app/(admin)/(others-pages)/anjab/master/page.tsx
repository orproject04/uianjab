"use client";

import React, {useEffect, useState} from "react";
import {apiFetch} from "@/lib/apiFetch";
import {useRouter} from "next/navigation";
import {slugToTitle} from "@/lib/text-utils";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import {useMe} from "@/context/MeContext";
import Swal from "sweetalert2";

type Jabatan = {
    id: string;
    nama_jabatan: string;
    kode_jabatan: string;
    kelas_jabatan?: string;
    created_at: string;
    updated_at: string;
};

export default function AnjabListPage() {
    const router = useRouter();
    const {isAdmin, loading: meLoading} = useMe();
    const [jabatanList, setJabatanList] = useState<Jabatan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [error, setError] = useState<string | null>(null);
    const [showUploadSection, setShowUploadSection] = useState(false);
    const [sortField, setSortField] = useState<"nama_jabatan" | "kode_jabatan" | "kelas_jabatan" | "created_at">("kelas_jabatan");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Redirect if not admin
    useEffect(() => {
        if (!meLoading && !isAdmin) {
            router.push("/");
        }
    }, [isAdmin, meLoading, router]);

    useEffect(() => {
        loadJabatan();
    }, []);

    const loadJabatan = async () => {
        try {
            console.log('Loading jabatan list...');
            const res = await apiFetch("/api/anjab/list", {
                method: "GET",
                cache: "no-store",
            });

            console.log('API response status:', res.status);
            
            if (res.ok) {
                const data = await res.json();
                console.log('Jabatan data received:', data);
                setJabatanList(data || []);
                setError(null);
            } else {
                const errorData = await res.json().catch(() => ({}));
                console.error('API error:', errorData);
                setError(errorData.error || 'Gagal memuat data');
            }
        } catch (error: any) {
            console.error("Error loading jabatan:", error);
            setError(error?.message || 'Terjadi kesalahan');
        } finally {
            setLoading(false);
        }
    };

    const filteredJabatan = jabatanList.filter(j => 
        j.nama_jabatan?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort jabatan
    const sortedJabatan = [...filteredJabatan].sort((a, b) => {
        // Primary sort by kelas_jabatan
        const getRomanValue = (str: string) => {
            if (!str || str.trim() === '') return 0; // Empty values go to end
            
            const romanOrder: { [key: string]: number } = {
                'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
                'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
                'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15,
                'XVI': 16, 'XVII': 17
            };
            
            const strUpper = String(str).toUpperCase().trim();
            
            // Try to find Roman numeral pattern - could be "KELAS IX", "IX", "9", etc
            // First try exact match with Roman numerals
            for (const [roman, value] of Object.entries(romanOrder)) {
                if (strUpper === roman || strUpper.includes(` ${roman}`) || strUpper.includes(`-${roman}`) || strUpper.includes(`.${roman}`)) {
                    return value;
                }
            }
            
            // Try regex pattern to find Roman numerals
            const match = strUpper.match(/\b(XVII|XVI|XV|XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|V|III|II|I)\b/);
            if (match && romanOrder[match[1]]) {
                return romanOrder[match[1]];
            }
            
            // Try to extract numeric value (e.g., "9" -> IX)
            const numMatch = strUpper.match(/\b(\d+)\b/);
            if (numMatch) {
                const num = parseInt(numMatch[1], 10);
                if (num >= 1 && num <= 17) {
                    return num;
                }
            }
            
            return 0; // Unknown values go to end
        };

        const aKelas = getRomanValue(String(a.kelas_jabatan || ""));
        const bKelas = getRomanValue(String(b.kelas_jabatan || ""));

        // Primary sort: kelas_jabatan (always descending for kelas)
        if (aKelas !== bKelas) {
            return bKelas - aKelas; // Descending: higher kelas first
        }

        // Secondary sort: based on sortField if not kelas_jabatan
        if (sortField !== "kelas_jabatan") {
            let aVal: any = a[sortField] || "";
            let bVal: any = b[sortField] || "";

            if (sortField === "created_at") {
                aVal = new Date(aVal || 0).getTime();
                bVal = new Date(bVal || 0).getTime();
            } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
            if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        }

        // Tertiary sort: always by nama_jabatan (ascending)
        const aNama = (a.nama_jabatan || "").toLowerCase();
        const bNama = (b.nama_jabatan || "").toLowerCase();
        
        if (aNama < bNama) return -1;
        if (aNama > bNama) return 1;
        return 0;
    });

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const handleCreateNew = () => {
        router.push("/anjab/create");
    };

    const handleUpload = () => {
        setShowUploadSection(!showUploadSection);
    };

    const handleViewJabatan = (id: string) => {
        // Langsung ke halaman edit section pertama (jabatan) dengan UUID
        router.push(`/anjab/master/edit/jabatan/${id}`);
    };

    const handlePreviewPDF = async (id: string, namaJabatan: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click
        
        try {
            // Fetch PDF with credentials
            const response = await apiFetch(`/api/anjab/${id}/pdf`, {
                method: 'GET',
            });
            
            if (!response.ok) {
                // Try to parse error as JSON first
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const error = await response.json();
                    alert(error.error || 'Gagal memuat PDF');
                } else {
                    alert(`Gagal memuat PDF (${response.status})`);
                }
                
                // If 401, redirect to login
                if (response.status === 401) {
                    window.location.href = '/auth/signin';
                }
                return;
            }
            
            // Convert to blob and open in new tab
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const newWindow = window.open(url, '_blank');
            
            // Clean up the URL after window opens
            if (newWindow) {
                newWindow.onload = () => {
                    URL.revokeObjectURL(url);
                };
            }
        } catch (error) {
            console.error('Error previewing PDF:', error);
            alert('Gagal memuat PDF');
        }
    };

    if (loading) {
        return (
            <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Memuat data...</p>
                </div>
            </div>
        );
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

    // Don't render anything if not admin (redirect will happen)
    if (!isAdmin) {
        return null;
    }

    if (error) {
        return (
            <div className="pt-16 min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-xl mb-4">Error</div>
                    <p className="text-gray-600 dark:text-gray-400">{error}</p>
                    <button 
                        onClick={loadJabatan}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Coba Lagi
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="pt-6 min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                            Analisis Jabatan
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Kelola dokumen analisis jabatan Anda
                        </p>
                    </div>
                    
                    {/* Clear Cache Button */}
                    <button
                        onClick={async () => {
                            const result = await Swal.fire({
                                title: 'Hapus Cache PDF?',
                                text: 'Semua cache PDF akan dihapus. Proses ini tidak dapat dibatalkan.',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: 'Ya, Hapus',
                                cancelButtonText: 'Batal',
                                confirmButtonColor: '#dc2626',
                                cancelButtonColor: '#6b7280',
                            });
                            
                            if (!result.isConfirmed) return;
                            
                            try {
                                const res = await apiFetch('/api/anjab/clear-cache', {
                                    method: 'POST',
                                });
                                
                                if (res.ok) {
                                    const data = await res.json();
                                    await Swal.fire({
                                        icon: 'success',
                                        title: 'Berhasil!',
                                        text: `${data.deleted_count || 0} file cache PDF berhasil dihapus`,
                                    });
                                } else {
                                    const error = await res.json();
                                    await Swal.fire({
                                        icon: 'error',
                                        title: 'Gagal',
                                        text: error.error || 'Gagal menghapus cache',
                                    });
                                }
                            } catch (error) {
                                console.error('Error clearing cache:', error);
                                await Swal.fire({
                                    icon: 'error',
                                    title: 'Error',
                                    text: 'Terjadi kesalahan saat menghapus cache',
                                });
                            }
                        }}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        title="Clear PDF Cache"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">Clear Cache</span>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        {/* Search */}
                        <div className="flex-1 max-w-md">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari anjab..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            {/* View Toggle */}
                            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-2 ${viewMode === "grid" ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}
                                    title="Grid view"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`p-2 ${viewMode === "list" ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}
                                    title="List view"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </button>
                            </div>

                            {/* Upload Button */}
                            <button
                                onClick={handleUpload}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span className="hidden sm:inline">Upload</span>
                            </button>

                            {/* Create New Button */}
                            <button
                                onClick={handleCreateNew}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="hidden sm:inline">Buat Baru</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Upload Section - Collapsible */}
                {showUploadSection && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded">
                                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Upload Dokumen Anjab
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Upload file Word (.doc) untuk membuat anjab baru
                                </p>
                            </div>
                            <button
                                onClick={() => setShowUploadSection(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <WordAnjab id="" />
                    </div>
                )}

                {/* Content */}
                {filteredJabatan.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            {searchQuery ? "Tidak ada hasil" : "Belum ada anjab"}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                            {searchQuery 
                                ? "Coba ubah kata kunci pencarian Anda" 
                                : "Mulai dengan membuat anjab baru atau upload dokumen"}
                        </p>
                    </div>
                ) : viewMode === "grid" ? (
                    /* Grid View */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {sortedJabatan.map((jabatan) => (
                            <div
                                key={jabatan.id}
                                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all group flex flex-col overflow-hidden"
                            >
                                <div 
                                    onClick={() => handleViewJabatan(jabatan.id)}
                                    className="p-5 cursor-pointer flex-1 flex flex-col"
                                >
                                    <div className="flex-1 mb-3">
                                        <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-snug line-clamp-4 min-h-[4.5rem]" title={slugToTitle(jabatan.nama_jabatan)}>
                                            {slugToTitle(jabatan.nama_jabatan)}
                                        </h3>
                                    </div>
                                    <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="truncate">{formatDate(jabatan.updated_at)}</span>
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Action buttons */}
                                <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-2 bg-gradient-to-b from-gray-50/80 to-gray-100/80 dark:from-gray-800/50 dark:to-gray-900/50 backdrop-blur-sm">
                                    <button
                                        onClick={(e) => handlePreviewPDF(jabatan.id, jabatan.nama_jabatan, e)}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 bg-white/80 dark:bg-gray-800/80 border border-purple-200 dark:border-purple-700/50 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:border-purple-300 dark:hover:border-purple-600 transition-all backdrop-blur-sm"
                                        title="Preview PDF"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <span>PDF</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleViewJabatan(jabatan.id); }}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-500 dark:to-blue-600 rounded-lg hover:from-blue-700 hover:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-700 shadow-sm hover:shadow transition-all"
                                        title="Edit Anjab"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        <span>Edit</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* List View */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th 
                                            onClick={() => handleSort("nama_jabatan")}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>Nama Jabatan</span>
                                                {sortField === "nama_jabatan" && (
                                                    <svg className={`w-4 h-4 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSort("kode_jabatan")}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>Kode</span>
                                                {sortField === "kode_jabatan" && (
                                                    <svg className={`w-4 h-4 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSort("kelas_jabatan")}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>Kelas</span>
                                                {sortField === "kelas_jabatan" && (
                                                    <svg className={`w-4 h-4 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSort("created_at")}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>Dibuat</span>
                                                {sortField === "created_at" && (
                                                    <svg className={`w-4 h-4 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {sortedJabatan.map((jabatan) => (
                                        <tr
                                            key={jabatan.id}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div 
                                                    onClick={() => handleViewJabatan(jabatan.id)}
                                                    className="flex items-center gap-3 cursor-pointer"
                                                >
                                                    <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <span className="text-sm font-medium text-gray-900 dark:text-white block" title={slugToTitle(jabatan.nama_jabatan)}>
                                                            {slugToTitle(jabatan.nama_jabatan)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                {jabatan.kode_jabatan || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                {jabatan.kelas_jabatan || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                {formatDate(jabatan.created_at)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={(e) => handlePreviewPDF(jabatan.id, jabatan.nama_jabatan, e)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                                                        title="Preview PDF"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        PDF
                                                    </button>
                                                    <button
                                                        onClick={() => handleViewJabatan(jabatan.id)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                                        title="Edit Anjab"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                        Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Footer Info */}
                {filteredJabatan.length > 0 && (
                    <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                        Menampilkan {filteredJabatan.length} dari {jabatanList.length} anjab
                    </div>
                )}
            </div>
        </div>
    );
}
