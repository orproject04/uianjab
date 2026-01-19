'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/context/MeContext';
import Swal from 'sweetalert2';
import { ChevronDownIcon, ChevronUpIcon, ArrowRightIcon } from '@/icons';

interface Feedback {
  id: string;
  user_id: string;
  nama_jabatan: string;
  unit_kerja: string;
  usulan_perbaikan: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

type TabType = 'submit' | 'history';

export default function FeedbackPage() {
  const { me, isAdmin, isAdminJf, loading: meLoading } = useMe();
  const router = useRouter();
  // Admin-JF is treated as regular user for feedback
  const isActualAdmin = isAdmin && !isAdminJf;
  const [activeTab, setActiveTab] = useState<TabType>('submit');
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [formData, setFormData] = useState({
    nama_jabatan: '',
    unit_kerja: '',
    usulan_perbaikan: '',
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!meLoading && !me) {
      router.replace('/auth/signin');
    }
  }, [meLoading, me, router]);

  // Load feedback data
  const loadFeedback = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/feedback');
      
      if (res.status === 401) {
        setFeedbackList([]);
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Failed to fetch feedback');
      }

      const json = await res.json();
      setFeedbackList(json?.data || []);
    } catch (error: any) {
      console.error('Error loading feedback:', error);
      Swal.fire('Error', error.message || 'Failed to load feedback', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (me && (activeTab === 'history' || isActualAdmin)) {
      loadFeedback();
    }
  }, [me, activeTab, isActualAdmin]);

  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama_jabatan.trim()) {
      Swal.fire('Error', 'Nama jabatan harus diisi', 'error');
      return;
    }

    if (!formData.unit_kerja.trim()) {
      Swal.fire('Error', 'Unit kerja harus diisi', 'error');
      return;
    }

    if (!formData.usulan_perbaikan.trim()) {
      Swal.fire('Error', 'Usulan perbaikan harus diisi', 'error');
      return;
    }

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        Swal.fire('Error', json.error || 'Failed to submit feedback', 'error');
        return;
      }

      await Swal.fire('Berhasil', 'Usulan perbaikan berhasil dikirim', 'success');
      
      // Reset form
      setFormData({
        nama_jabatan: '',
        unit_kerja: '',
        usulan_perbaikan: '',
      });

      // Reload data if on history tab
      if (activeTab === 'history') {
        loadFeedback();
      }

      // Reset to page 1
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      Swal.fire('Error', error.message || 'Failed to submit feedback', 'error');
    }
  };

  // Toggle expanded state
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Pagination
  const totalPages = Math.ceil(feedbackList.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFeedback = feedbackList.slice(startIndex, endIndex);

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

  if (!me) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Akses Ditolak</h3>
          <p className="text-red-600 dark:text-red-300 text-sm">
            Anda harus login untuk mengakses halaman ini
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 pt-6">
      {/* Header */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Usulan Perbaikan Dokumen Anjab
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            {isActualAdmin
              ? 'Lihat dan kelola usulan perbaikan dokumen anjab dari pengguna'
              : 'Kirim usulan perbaikan dokumen anjab dan lihat riwayat usulan Anda'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-2 sm:space-x-8">
          {isActualAdmin ? (
            // Admin only sees "Usulan Masuk" tab
            <button
              className="border-brand-500 text-brand-600 dark:text-brand-400 flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm"
            >
              Usulan Masuk
            </button>
          ) : (
            // Regular users see both tabs
            <>
              <button
                onClick={() => setActiveTab('submit')}
                className={`${
                  activeTab === 'submit'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
              >
                Kirim Usulan
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`${
                  activeTab === 'history'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
              >
                Riwayat Usulan
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'submit' && !isActualAdmin ? (
        /* Submit Form */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nama Jabatan */}
            <div>
              <label
                htmlFor="nama_jabatan"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Nama Jabatan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="nama_jabatan"
                value={formData.nama_jabatan}
                onChange={(e) => setFormData({ ...formData, nama_jabatan: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder="Contoh: Penata Kelola Sistem dan Teknologi Informasi"
              />
            </div>

            {/* Unit Kerja */}
            <div>
              <label
                htmlFor="unit_kerja"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Unit Kerja <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="unit_kerja"
                value={formData.unit_kerja}
                onChange={(e) => setFormData({ ...formData, unit_kerja: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder="Contoh: Subbagian Organisasi, Bagian Organisasi dan Ketatalaksanaan"
              />
            </div>

            {/* Usulan Perbaikan */}
            <div>
              <label
                htmlFor="usulan_perbaikan"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Usulan Perbaikan Dokumen Anjab <span className="text-red-500">*</span>
              </label>
              <textarea
                id="usulan_perbaikan"
                value={formData.usulan_perbaikan}
                onChange={(e) => setFormData({ ...formData, usulan_perbaikan: e.target.value })}
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-y"
                placeholder="Jelaskan usulan perbaikan dokumen anjab secara detail..."
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Jelaskan secara detail usulan perbaikan yang Anda inginkan
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
              >
                Kirim Usulan
                <ArrowRightIcon className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* History / Admin View - List View */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : feedbackList.length === 0 ? (
            <div className="p-12 text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Belum ada usulan perbaikan
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {isActualAdmin
                  ? 'Belum ada usulan perbaikan anjab yang dikirim oleh pengguna'
                  : 'Anda belum mengirim usulan perbaikan anjab'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedFeedback.map((item) => (
                <div
                  key={item.id}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header Info */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white sm:truncate">
                          {item.nama_jabatan}
                        </h3>
                        <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                          •
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 sm:truncate">
                          {item.unit_kerja}
                        </span>
                      </div>

                      {/* User info (for admin) */}
                      {/* {isActualAdmin && (
                        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <svg
                            className="w-4 h-4 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          <span className="truncate">
                            {item.user_name || 'Unknown'} ({item.user_email || '-'})
                          </span>
                        </div>
                      )} */}

                      {/* Date */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-3">
                        <svg
                          className="w-3.5 h-3.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>{formatDate(item.created_at)}</span>
                      </p>

                      {/* Expandable Usulan Perbaikan */}
                      {expandedIds.has(item.id) && (
                        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Usulan Perbaikan:
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            {item.usulan_perbaikan}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Toggle Button */}
                    <button
                      onClick={() => toggleExpanded(item.id)}
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={expandedIds.has(item.id) ? 'Sembunyikan' : 'Tampilkan usulan'}
                    >
                      {expandedIds.has(item.id) ? (
                        <ChevronUpIcon className="w-5 h-5" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && feedbackList.length > 0 && totalPages > 1 && (
            <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Page Info */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Menampilkan {startIndex + 1} - {Math.min(endIndex, feedbackList.length)} dari {feedbackList.length} usulan
                </div>

                {/* Pagination Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first page, last page, current page, and pages around current
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-brand-600 text-white'
                                : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <span key={page} className="px-2 text-gray-500">
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
