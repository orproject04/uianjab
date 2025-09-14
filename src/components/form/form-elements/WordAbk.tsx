'use client';

import {useRef, useState} from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import {FileJson, Loader2} from 'lucide-react';
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

interface WordAbkProps {
    id: string; // jabatan_id (UUID)
}

export default function WordAbk({id}: WordAbkProps) {
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const clearFileInput = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const showConfirmModal = async (fileNames: string[]): Promise<boolean> => {
        const htmlList = `<ol class="text-left text-sm list-decimal pl-5">
      ${fileNames.map(f => `<li>📄 ${f}</li>`).join('')}
    </ol>`;

        const result = await MySwal.fire({
            title: 'Konfirmasi Upload',
            html: `<p class="mb-2">Berikut file yang akan diupload:</p>${htmlList}`,
            icon: 'question',
            width: '480px',
            showCancelButton: true,
            confirmButtonText: 'Upload',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#10B981',
            cancelButtonColor: '#EF4444',
        });

        return result.isConfirmed;
    };

    const showResultModal = async (success: boolean, message: string, detailsHtml = "") => {
        await Swal.fire({
            title: success ? "Berhasil" : "Gagal",
            html: `
        <p>${message}</p>
        ${detailsHtml ? `<hr class="my-2" /><div class="text-left">${detailsHtml}</div>` : ""}
      `,
            icon: success ? "success" : "error",
            confirmButtonColor: success ? "#10B981" : "#EF4444",
            width: "520px",
            allowOutsideClick: true,
            allowEscapeKey: true,
            didClose: () => {
                if (success) window.location.reload();
            },
        });
    };

    const handleFileUploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Batasi 1 file saja
        if (files.length > 1) {
            await MySwal.fire({
                icon: "error",
                title: "Maksimal 1 file",
                text: "Silakan pilih hanya satu file untuk diunggah.",
            });
            clearFileInput();
            return;
        }

        // Konfirmasi (tetap tampilkan nama file)
        const confirmed = await showConfirmModal(Array.from(files).map(f => f.name));
        if (!confirmed) {
            clearFileInput();
            return;
        }

        const formData = new FormData();
        formData.append('file', files[0]); // hanya 1 file
        formData.append('id', id);         // jabatan_id

        setIsLoading(true);
        try {
            const res = await apiFetch('/api/abk/docs', {method: 'POST', body: formData});
            const result = await res.json().catch(() => ({} as any));

            if (res.ok) {
                const details = `
          <ul class="list-disc pl-5">
            ${result.jabatan_id ? `<li><b>jabatan_id:</b> <code>${result.jabatan_id}</code></li>` : ''}
            ${result.file ? `<li><b>file:</b> <code>${result.file}</code></li>` : ''}
          </ul>
        `;
                await showResultModal(true, result.message || 'Upload berhasil', details);
            } else {
                const serverMsg = result?.message || result?.error || `Gagal mengunggah (${res.status})`;
                const serverDetail = result?.detail ? `<pre class="mt-2 p-2 bg-gray-100 rounded">${String(result.detail)}</pre>` : "";
                await showResultModal(false, serverMsg, serverDetail);
            }
        } catch (err) {
            console.error(err);
            await showResultModal(false, 'Gagal mengirim ke server.');
        } finally {
            setIsLoading(false);
            clearFileInput();
        }
    };

    return (
        <div className="mx-auto mt-10 p-6 bg-white shadow-lg rounded-2xl border">
            <h2 className="text-2xl font-semibold mb-4 text-center text-gray-800">
                Unggah Dokumen Analisis Beban Kerja
            </h2>

            <label
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-500 transition">
                {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2"/>
                ) : (
                    <FileJson className="w-10 h-10 text-purple-500 mb-2"/>
                )}
                <p className="text-gray-600 font-medium">Pilih file Word</p>

                {/* hanya 1 file */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".doc,.docx"
                    multiple={false}
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </label>
        </div>
    );
}
