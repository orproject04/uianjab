'use client';

import { useState } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { FileJson, Loader2 } from 'lucide-react';

const MySwal = withReactContent(Swal);

interface WordAbkProps {
    id: string;
}

export default function WordAbk({ id }: WordAbkProps) {
    const [isLoading, setIsLoading] = useState(false);

    const showConfirmModal = async (fileNames: string[]): Promise<boolean> => {
        const htmlList = `<ol class="text-left text-sm list-decimal pl-5">
            ${fileNames.map(f => `<li>📄 ${f}</li>`).join('')}
        </ol>`;

        const result = await MySwal.fire({
            title: 'Konfirmasi Upload',
            html: `
                <p class="mb-2">Berikut file yang akan diupload:</p>
                ${htmlList}
            `,
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

    const showResultModal = (success: boolean, message: string, detailsHtml: string = '') => {
        Swal.fire({
            title: success ? 'Berhasil' : 'Gagal',
            html: `
                <p>${message}</p>
                ${detailsHtml ? `<hr class="my-2" /><div class="text-left">${detailsHtml}</div>` : ''}
            `,
            icon: success ? 'success' : 'error',
            confirmButtonColor: success ? '#10B981' : '#EF4444',
            width: '520px',
        });
    };

    const handleFileUploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const confirm = await showConfirmModal(Array.from(files).map(f => f.name));
        if (!confirm) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        formData.append("id_jabatan", id); // kirim id ke API

        setIsLoading(true);
        try {
            const res = await fetch('/api/abk/upload-doc', {
                method: 'POST',
                body: formData,
            });

            const result = await res.json();
            console.log(result);
            showResultModal(res.ok, result.message || (res.ok ? 'Upload berhasil' : 'Gagal'));
        } catch (err) {
            console.error(err);
            showResultModal(false, 'Gagal mengirim ke server.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto mt-10 p-6 bg-white shadow-lg rounded-2xl border">
            <h2 className="text-2xl font-semibold mb-4 text-center text-gray-800">
                Unggah Dokumen Analisis Beban Kerja
            </h2>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-500 transition">
                {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
                ) : (
                    <FileJson className="w-10 h-10 text-purple-500 mb-2" />
                )}
                <p className="text-gray-600 font-medium">Pilih file Word</p>

                <input
                    type="file"
                    accept=".doc,.docx"
                    multiple
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </label>
        </div>
    );
}

