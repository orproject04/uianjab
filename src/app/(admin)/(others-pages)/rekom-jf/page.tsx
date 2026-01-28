"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/context/MeContext";
import Swal from "sweetalert2";
import { CustomSelect } from "@/components/form/CustomSelect";
import { FileJson, Loader2 } from 'lucide-react';

type RekomJF = {
  id: string;
  nama: string;
  kemenpan_path: string | null;
  instansi_pembina_path: string | null;
  created_at: string;
  updated_at: string;
};

type TabType = "kemenpan" | "instansi_pembina";

export default function RekomJFPage() {
  const router = useRouter();
  const { me, isAdmin, isAdminJf, loading: meLoading } = useMe();
  const [activeTab, setActiveTab] = useState<TabType>("kemenpan");
  const [data, setData] = useState<RekomJF[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [formData, setFormData] = useState({
    nama: "",
    kemenpan: null as File | null,
    instansi_pembina: null as File | null,
  });

  const [fungsionalList, setFungsionalList] = useState<string[]>([]);

  const kemenpanInputRef = useRef<HTMLInputElement | null>(null);
  const instansiInputRef = useRef<HTMLInputElement | null>(null);
  const [dragKemenpan, setDragKemenpan] = useState(false);
  const [dragInstansi, setDragInstansi] = useState(false);

  // Redirect if not admin or admin-jf
  useEffect(() => {
    if (!meLoading && !isAdmin && !isAdminJf) {
      router.replace("/");
    }
  }, [meLoading, isAdmin, isAdminJf, router]);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/rekom-jf");
      if (res.status === 401) {
        // Unauthorized -> show message and treat as empty
        setData([]);
        return;
      }

      if (res.status === 204 || res.status === 404) {
        setData([]);
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to fetch data");
      }

      const json = await res.json();
      setData(json?.data || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      Swal.fire("Error", error.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isAdminJf) {
      loadData();
    }
  }, [isAdmin, isAdminJf]);

  // Load jenis_jabatan list and filter for fungsional entries
  useEffect(() => {
    let mounted = true;
    const loadJenis = async () => {
      try {
        const res = await fetch("/api/dashboard/jabatan", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        // Prefer API-provided per-jenis name lists (byJenis_names) which includes
        // specific fungsional job names (e.g., Pranata Komputer, Arsiparis)
        const byJenisNames: any[] = json?.byJenis_names || [];
        const fObj = byJenisNames.find((r: any) => /fungsional/i.test(String(r.jenis || '')));
        let fungsional: string[] = [];
        if (fObj && Array.isArray(fObj.names) && fObj.names.length > 0) {
          fungsional = fObj.names;
        } else {
          // Fallback: filter generic jenisList for entries containing 'fungsional'
          const jenisList: string[] = (json?.filters?.jenisList) || [];
          fungsional = jenisList.filter((j) => /fungsional/i.test(String(j || "")));
        }
        if (mounted) setFungsionalList(fungsional);
      } catch (e) {
        // ignore
      }
    };
    loadJenis();
    return () => { mounted = false };
  }, []);

  // Open add modal
  const handleAdd = () => {
    setFormData({ nama: "", kemenpan: null, instansi_pembina: null });
    setShowModal(true);
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama.trim()) {
      Swal.fire("Error", "Nama harus diisi", "error");
      return;
    }

    const form = new FormData();
    form.append("nama", formData.nama.trim());
    if (formData.kemenpan) form.append("kemenpan", formData.kemenpan);
    if (formData.instansi_pembina) form.append("instansi_pembina", formData.instansi_pembina);

    setUploadLoading(true);
    setShowModal(false);
    
    Swal.fire({
      title: 'Mengunggah dokumen...',
      html: 'Mohon tunggu, file sedang diunggah',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch("/api/rekom-jf", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        Swal.fire("Error", json.error || "Failed to save", "error");
        return;
      }

      Swal.fire("Success", json.message || "Saved successfully", "success");
      loadData();
    } catch (error: any) {
      console.error("Error saving:", error);
      Swal.fire("Error", error.message || "Failed to save", "error");
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string, nama: string) => {
    const tabName = activeTab === "kemenpan" ? "KEMENPAN" : "Instansi Pembina";
    const result = await Swal.fire({
      title: "Hapus Surat Rekomendasi?",
      text: `Yakin ingin menghapus surat rekomendasi ${tabName} untuk "${nama}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) return;

    setDeleteLoading(id);
    Swal.fire({
      title: 'Menghapus dokumen...',
      html: 'Mohon tunggu',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch(`/api/rekom-jf/${id}?type=${activeTab}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        Swal.fire("Error", json.error || "Failed to delete", "error");
        return;
      }

      Swal.fire("Berhasil", json.message || "Deleted successfully", "success");
      loadData();
    } catch (error: any) {
      console.error("Error deleting:", error);
      Swal.fire("Error", error.message || "Failed to delete", "error");
    } finally {
      setDeleteLoading(null);
    }
  };

  // Filter data by active tab and search
  const filteredData = data.filter((item) => {
    const matchesTab = activeTab === "kemenpan" ? item.kemenpan_path : item.instansi_pembina_path;
    const matchesSearch = item.nama.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  // Capitalize function
  const toCapitalize = (str: string) => {
    return str
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin && !isAdminJf) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">
            Akses Ditolak
          </h3>
          <p className="text-red-600 dark:text-red-300 text-sm">
            Halaman ini hanya dapat diakses oleh Admin atau Admin JF
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 pt-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Surat Rekomendasi JF
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            Kelola surat rekomendasi KEMENPAN dan Instansi Pembina
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-gradient-to-b from-brand-25 via-white to-blue-light-25 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cari surat rekomendasi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Toggle */}
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 ${viewMode === "grid" ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}
                title="Grid view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 ${viewMode === "list" ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}
                title="List view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Upload Button */}
            <button
              onClick={handleAdd}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-2 sm:space-x-8">
          <button
            onClick={() => setActiveTab("kemenpan")}
            className={`${
              activeTab === "kemenpan"
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
          >
            <span className="hidden sm:inline">Surat Rekomendasi KEMENPAN</span>
            <span className="sm:hidden">KEMENPAN</span>
          </button>
          <button
            onClick={() => setActiveTab("instansi_pembina")}
            className={`${
              activeTab === "instansi_pembina"
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
          >
            <span className="hidden sm:inline">Surat Rekomendasi Instansi Pembina</span>
            <span className="sm:hidden">Instansi Pembina</span>
          </button>
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {searchQuery ? "Tidak ada hasil" : "Belum ada surat rekomendasi"}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery
              ? "Coba ubah kata kunci pencarian Anda"
              : `Belum ada surat rekomendasi yang di-upload untuk ${activeTab === "kemenpan" ? "KEMENPAN" : "Instansi Pembina"}`}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedData.map((item) => {
              const pdfPath = activeTab === "kemenpan" ? item.kemenpan_path : item.instansi_pembina_path;
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

              return (
                <div
                  key={item.id}
                  onClick={() => pdfPath && window.open(pdfPath, '_blank')}
                  className="bg-gradient-to-b from-brand-25 via-white to-blue-light-25 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-brand-500 dark:hover:border-brand-400 transition-all group flex flex-col overflow-hidden cursor-pointer"
                >
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex-1 mb-3">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-snug line-clamp-4 min-h-[4.5rem]" title={toCapitalize(item.nama)}>
                        {toCapitalize(item.nama)}
                      </h3>
                    </div>
                    <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="truncate">{formatDate(item.created_at)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-2 bg-gradient-to-b from-gray-50/80 to-gray-100/80 dark:from-gray-800/50 dark:to-gray-900/50 backdrop-blur-sm">
                    {pdfPath && (
                      <a
                        href={pdfPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-brand-600 dark:text-brand-400 bg-white/80 dark:bg-gray-800/80 border border-brand-200 dark:border-brand-700/50 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:border-brand-300 dark:hover:border-brand-600 transition-all backdrop-blur-sm"
                        title="Preview PDF"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>PDF</span>
                      </a>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.nama); }}
                      disabled={deleteLoading === item.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-red-500 dark:from-red-500 dark:to-red-600 rounded-lg hover:from-red-700 hover:to-red-600 dark:hover:from-red-600 dark:hover:to-red-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Hapus Surat Rekomendasi"
                    >
                      {deleteLoading === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                      <span>{deleteLoading === item.id ? 'Menghapus...' : 'Hapus'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls for Grid */}
          {totalPages > 1 && (
            <div className="mt-6 mb-6 sm:mb-0 flex flex-col sm:flex-row items-center sm:justify-between gap-3">
              <div className="w-full sm:w-auto text-center sm:text-left text-sm text-gray-600 dark:text-gray-400">
                Halaman {currentPage} dari {totalPages} ({filteredData.length} total)
              </div>
              <div className="flex items-center gap-2 justify-center sm:justify-end">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="flex items-center gap-1 overflow-x-auto py-1 whitespace-nowrap">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (page === 1 || page === totalPages) return true;
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
                          className={`flex-none min-w-[44px] px-3 py-2 text-sm text-center rounded-lg transition-colors ${currentPage === page
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
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* List View */
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nama Surat Rekomendasi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tanggal Upload
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.map((item) => {
                    const pdfPath = activeTab === "kemenpan" ? item.kemenpan_path : item.instansi_pembina_path;
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

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-gray-900 dark:text-white block" title={toCapitalize(item.nama)}>
                                {toCapitalize(item.nama)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {pdfPath && (
                              <a
                                href={pdfPath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                title="Preview PDF"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>PDF</span>
                              </a>
                            )}
                            <button
                              onClick={() => handleDelete(item.id, item.nama)}
                              disabled={deleteLoading === item.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Hapus"
                            >
                              {deleteLoading === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                              <span>{deleteLoading === item.id ? 'Menghapus...' : 'Hapus'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination for List View */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Halaman {currentPage} dari {totalPages} ({filteredData.length} total)
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
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (page === 1 || page === totalPages) return true;
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
                          className={`px-3 py-2 text-sm text-center rounded-lg transition-colors ${currentPage === page
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
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-light-100 dark:bg-blue-light-900/30 rounded">
                  <svg className="w-6 h-6 text-blue-light-600 dark:text-blue-light-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Upload Surat Rekomendasi Baru
                  </h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nama / Judul <span className="text-red-500">*</span>
                  </label>
                  {/* Build options with capitalized labels and preserve existing value in edit mode */}
                  {(() => {
                    const toTitle = (s: string) =>
                      s
                        .toLowerCase()
                        .split(/\s+/)
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ");
                    const opts = (fungsionalList || []).map((j) => ({ value: j, label: toTitle(String(j || "")) }));
                    if (formData.nama && !opts.find((o) => o.value === formData.nama)) {
                      opts.push({ value: formData.nama, label: toTitle(formData.nama) });
                    }

                    return (
                      <CustomSelect
                        value={formData.nama}
                        onChange={(val) => setFormData({ ...formData, nama: val })}
                        options={[{ value: "", label: "(Pilih Jabatan Fungsional)" }, ...opts]}
                        placeholder="-- Pilih Jabatan Fungsional --"
                        searchable={true}
                      />
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Surat Rekomendasi KEMENPAN (PDF)
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragKemenpan(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragKemenpan(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragKemenpan(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setFormData({ ...formData, kemenpan: f });
                      }}
                      onClick={() => kemenpanInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                        dragKemenpan ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-105' : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 dark:hover:border-brand-500'
                      }`}
                    >
                      <div className="mb-3">
                        <FileJson className="w-10 h-10 text-brand-500" />
                      </div>
                      <p className="text-gray-700 dark:text-gray-200 font-medium text-center">
                        {dragKemenpan ? 'Lepaskan file di sini' : (formData.kemenpan ? formData.kemenpan.name : 'Klik atau seret file PDF ke sini')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">Hanya PDF yang diperbolehkan</p>
                      <input
                        ref={kemenpanInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => setFormData({ ...formData, kemenpan: e.target.files?.[0] || null })}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Surat Rekomendasi Instansi Pembina (PDF)
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragInstansi(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragInstansi(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragInstansi(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setFormData({ ...formData, instansi_pembina: f });
                      }}
                      onClick={() => instansiInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                        dragInstansi ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-105' : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 dark:hover:border-brand-500'
                      }`}
                    >
                      <div className="mb-3">
                        <FileJson className="w-10 h-10 text-brand-500" />
                      </div>
                      <p className="text-gray-700 dark:text-gray-200 font-medium text-center">
                        {dragInstansi ? 'Lepaskan file di sini' : (formData.instansi_pembina ? formData.instansi_pembina.name : 'Klik atau seret file PDF ke sini')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">Hanya PDF yang diperbolehkan</p>
                      <input
                        ref={instansiInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => setFormData({ ...formData, instansi_pembina: e.target.files?.[0] || null })}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={uploadLoading}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={uploadLoading}
                    className="flex-1 px-4 py-2 bg-blue-light-500 text-white rounded-lg hover:bg-blue-light-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {uploadLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <span>Upload</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
