'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/context/MeContext';
import Button from '@/components/ui/button/Button';
import { AlertIcon, CheckCircleIcon, CloseLineIcon, DownloadIcon, ArrowRightIcon } from '@/icons';
import Swal from 'sweetalert2';

interface SyncResult {
  totalFetched: number;
  totalMatched: number;
  totalUnmatched: number;
  totalInactive: number;
  errors: string[];
  logFilePaths?: {
    json?: string;
    csv?: string;
  };
}

interface SyncHistory {
  id: number;
  sync_type: string;
  total_fetched: number;
  total_matched: number;
  total_unmatched: number;
  total_inactive: number;
  errors: string[] | null;
  log_file_json: string | null;
  log_file_csv: string | null;
  synced_at: string;
  synced_by: string | null;
}

export default function SyncPegawaiPage() {
  const { isAdmin, loading: meLoading } = useMe();
  const router = useRouter();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [lastSync, setLastSync] = useState<SyncHistory | null>(null);
  const [apiConfig, setApiConfig] = useState<{ url: string; perPage: number } | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // Fetch last sync history
  const fetchLastSync = async () => {
    try {
      const res = await fetch('/api/sync/history?limit=1');
      const data = await res.json();
      if (data.ok && data.history.length > 0) {
        setLastSync(data.history[0]);
      }
    } catch (err) {
      console.error('Failed to fetch last sync:', err);
    }
  };

  // Fetch API config from server
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setApiConfig({
          url: data.externalPegawaiApiUrl,
          perPage: data.externalApiPerPage
        });
      })
      .catch(err => console.error('Failed to load API config:', err));
    
    // Fetch last sync history
    fetchLastSync();
  }, []);

  useEffect(() => {
    if (!meLoading && !isAdmin) {
      router.replace('/');
    }
  }, [meLoading, isAdmin, router]);

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

  const startSync = async () => {
    // Show confirmation first
    const confirm = await Swal.fire({
      title: 'Mulai Sinkronisasi?',
      html: `
        <div class="text-left">
          <p class="text-sm text-gray-600 mb-3">Proses ini akan:</p>
          <ul class="text-sm text-gray-700 list-disc list-inside space-y-1">
            <li>Menghapus semua data pegawai yang ada di kolom pejabat</li>
            <li>Mengambil data terbaru dari API eksternal</li>
            <li>Memperbarui data jabatan dengan pegawai terbaru</li>
            <li>Memakan waktu beberapa menit</li>
          </ul>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Mulai Sinkronisasi',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
    });

    if (!confirm.isConfirmed) return;

    // Show loading with SweetAlert2
    Swal.fire({
      title: 'Sinkronisasi Data Pegawai',
      html: `
        <div class="mb-4">
          <p class="text-sm text-gray-600 mb-3">Sedang memproses...</p>
          <div class="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div id="swal-progress-bar" class="bg-blue-600 h-4 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-xs text-gray-500">
            <span id="swal-progress-message">Memulai...</span>
            <span id="swal-progress-percent">0%</span>
          </div>
        </div>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      // Use EventSource for SSE (Server-Sent Events) to get real-time progress
      const eventSource = new EventSource('/api/sync/pegawai');

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
          eventSource.close();
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: data.error,
          });
          return;
        }

        // Update progress bar and message
        if (data.progress !== undefined) {
          const progressBar = document.getElementById('swal-progress-bar');
          const progressPercent = document.getElementById('swal-progress-percent');
          const progressMessage = document.getElementById('swal-progress-message');

          if (progressBar) progressBar.style.width = `${data.progress}%`;
          if (progressPercent) progressPercent.textContent = `${data.progress}%`;
          if (progressMessage && data.message) progressMessage.textContent = data.message;
        }

        if (data.done) {
          eventSource.close();

          // Set result from SSE response
          if (data.result) {
            setResult(data.result);
          }

          // Refresh last sync history
          fetchLastSync();

          Swal.fire({
            icon: 'success',
            title: 'Sinkronisasi Selesai!',
            text: 'Data pegawai berhasil disinkronkan.',
            timer: 2000,
            showConfirmButton: false,
          });
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        eventSource.close();
        Swal.fire({
          icon: 'error',
          title: 'Koneksi Error',
          text: 'Koneksi ke server terputus. Silakan coba lagi.',
        });
      };
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Terjadi kesalahan',
      });
    }
  };

  const downloadLatestCsv = async () => {
    try {
      const res = await fetch('/api/sync/download-csv');
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal mengunduh CSV');
      }
      
      // Create blob and download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Get filename from Content-Disposition header
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'unmatched-pegawai.csv';
      if (contentDisposition) {
        const matches = /filename="?(.+?)"?$/i.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      Swal.fire({
        icon: 'success',
        title: 'Berhasil',
        text: 'File CSV berhasil diunduh',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Gagal mengunduh CSV',
      });
    }
  };

  const clearCache = async () => {
    const confirm = await Swal.fire({
      title: 'Hapus Cache Lama?',
      text: 'File CSV dan JSON lama akan dihapus, kecuali yang terakhir',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
    });

    if (!confirm.isConfirmed) return;

    setClearingCache(true);
    
    try {
      const res = await fetch('/api/sync/clear-cache', {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membersihkan cache');
      }
      
      Swal.fire({
        icon: 'success',
        title: 'Berhasil',
        text: `${data.deletedCount} file berhasil dihapus`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Gagal membersihkan cache',
      });
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div className="pt-6">
      <div className="">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Sinkronisasi Data Pegawai
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sinkronkan data pegawai dari API eksternal ke database Peta Jabatan
          </p>
        </div>

        {/* API Configuration Info */}
        <div className="mb-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <h3 className="mb-2 font-semibold text-blue-light-900 dark:text-blue-light-100">
            Informasi API Data Pegawai
          </h3>
          <div className="space-y-1 text-sm text-blue-light-800 dark:text-blue-light-200">
            <p>
              <strong>API URL:</strong>{' '}
              {apiConfig ? apiConfig.url : 'Memuat...'}
            </p>
            <p>
              <strong>Per Page:</strong> {apiConfig ? apiConfig.perPage : 'Memuat...'}
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
          <AlertIcon className="h-6 w-6 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <p className="font-semibold">Perhatian:</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Proses ini akan menghapus semua data pegawai yang ada di kolom pejabat</li>
              <li>Data akan diganti dengan data terbaru dari API eksternal</li>
              <li>Proses dapat memakan waktu beberapa menit tergantung jumlah data</li>
              <li>Data yang tidak cocok akan dicatat dalam file log</li>
            </ul>
          </div>
        </div>

        {/* Sync Button */}
        <div className="mb-6">
          <Button
            onClick={startSync}
            variant="primary"
            className="w-full sm:w-auto"
          >
            <ArrowRightIcon className="mr-2 h-4 w-4" />
            Mulai Sinkronisasi
          </Button>
        </div>

        {/* Last Sync Info & Action Buttons */}
        {lastSync && (
          <div className="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Terakhir Sinkronisasi
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(lastSync.synced_at).toLocaleString('id-ID', {
                    dateStyle: 'full',
                    timeStyle: 'medium',
                    timeZone: 'Asia/Jakarta'
                  })}
                  {' WIB'}
                  {lastSync.synced_by && ` oleh ${lastSync.synced_by}`}
                </p>
              </div>
              <div className="flex gap-2">
                {lastSync.log_file_csv && (
                  <Button
                    onClick={downloadLatestCsv}
                    size="sm"
                    className="text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    Download CSV Terakhir
                  </Button>
                )}
                <Button
                  onClick={clearCache}
                  size="sm"
                  className="text-xs bg-red-600 hover:bg-red-700 text-white"
                  disabled={clearingCache}
                >
                  {clearingCache ? 'Menghapus...' : 'Hapus Cache Lama'}
                </Button>
              </div>
            </div>
            
            {/* Mini Stats from Last Sync */}
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                <p className="text-xs text-blue-600 dark:text-blue-400">Total Pegawai</p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {lastSync.total_fetched.toLocaleString()}
                </p>
              </div>
              <div className="rounded bg-green-50 px-3 py-2 dark:bg-green-900/20">
                <p className="text-xs text-green-600 dark:text-green-400">Data Sesuai</p>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">
                  {lastSync.total_matched.toLocaleString()}
                </p>
              </div>
              <div className="rounded bg-orange-50 px-3 py-2 dark:bg-orange-900/20">
                <p className="text-xs text-orange-600 dark:text-orange-400">Pegawai Tidak Aktif</p>
                <p className="text-lg font-bold text-orange-900 dark:text-orange-100">
                  {lastSync.total_inactive?.toLocaleString() || 0}
                </p>
              </div>
              <div className="rounded bg-yellow-50 px-3 py-2 dark:bg-yellow-900/20">
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Data Tidak Sesuai</p>
                <p className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                  {lastSync.total_unmatched.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Result Display (Current Sync) */}
        {result && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-4 dark:border-gray-700">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Hasil Sinkronisasi
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <p className="text-sm text-blue-600 dark:text-blue-400">Total Pegawai</p>
                <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {result.totalFetched.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                <p className="text-sm text-green-600 dark:text-green-400">Data Sesuai</p>
                <p className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
                  {result.totalMatched.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
                <p className="text-sm text-orange-600 dark:text-orange-400">Pegawai Tidak Aktif</p>
                <p className="mt-1 text-2xl font-bold text-orange-900 dark:text-orange-100">
                  {result.totalInactive?.toLocaleString() || 0}
                </p>
              </div>

              <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Data Tidak Sesuai</p>
                <p className="mt-1 text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                  {result.totalUnmatched.toLocaleString()}
                </p>
              </div>
            </div>

            {(result.totalUnmatched > 0 || result.totalInactive > 0) && (
              <div className="mt-4 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <div className="flex items-start gap-3">
                  <DownloadIcon className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                      Data Tidak Sesuai & Pegawai Tidak Aktif
                    </p>
                    <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                      Terdapat {result.totalUnmatched} data tidak sesuai dan {result.totalInactive || 0} pegawai tidak aktif.
                      File log telah dibuat di folder <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-800">storage/sync-logs/</code>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                <p className="font-semibold text-red-900 dark:text-red-100">Errors:</p>
                <ul className="mt-2 space-y-1 text-sm text-red-800 dark:text-red-200">
                  {result.errors.map((err, idx) => (
                    <li key={idx} className="list-inside list-disc">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
