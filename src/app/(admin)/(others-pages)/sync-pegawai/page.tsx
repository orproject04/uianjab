'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { AlertIcon, CheckCircleIcon, CloseLineIcon, DownloadIcon, ArrowRightIcon } from '@/icons';
import Swal from 'sweetalert2';

interface SyncResult {
  totalFetched: number;
  totalMatched: number;
  totalUpdated: number;
  totalUnmatched: number;
  errors: string[];
}

export default function SyncPegawaiPage() {
  const router = useRouter();
  const [result, setResult] = useState<SyncResult | null>(null);

  const startSync = async () => {
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

  return (
    <div className="pt-6 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
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
        <h3 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
          Informasi API
        </h3>
        <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
          <p>
            <strong>API URL:</strong>{' '}
            {process.env.NEXT_PUBLIC_EXTERNAL_PEGAWAI_API_URL || 'https://cmb.tail91813a.ts.net/api/pegawai'}
          </p>
          <p>
            <strong>Per Page:</strong> {process.env.NEXT_PUBLIC_EXTERNAL_API_PER_PAGE || '100'}
          </p>
        </div>
      </div>

      {/* Warning */}
      <div className="mb-6 flex items-start gap-3 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
        <AlertIcon className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div className="text-sm text-yellow-800 dark:text-yellow-200">
          <p className="font-semibold">Perhatian:</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Proses ini akan menghapus semua data pegawai yang ada di kolom nama_pejabat</li>
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

      {/* Result Display */}
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
              <p className="text-sm text-blue-600 dark:text-blue-400">Total Data Diambil</p>
              <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                {result.totalFetched.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm text-green-600 dark:text-green-400">Data Cocok</p>
              <p className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
                {result.totalMatched.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
              <p className="text-sm text-purple-600 dark:text-purple-400">Jabatan Diupdate</p>
              <p className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                {result.totalUpdated.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">Data Tidak Cocok</p>
              <p className="mt-1 text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                {result.totalUnmatched.toLocaleString()}
              </p>
            </div>
          </div>

          {result.totalUnmatched > 0 && (
            <div className="mt-4 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
              <div className="flex items-start gap-3">
                <DownloadIcon className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                    Data Tidak Cocok
                  </p>
                  <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                    Terdapat {result.totalUnmatched} data yang tidak cocok dengan jabatan di database.
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
