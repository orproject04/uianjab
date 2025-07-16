'use client';

import { useState } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { FileJson, Loader2 } from 'lucide-react';

const MySwal = withReactContent(Swal);

export default function JsonAnjab() {
    const [isLoading, setIsLoading] = useState(false);

    const showConfirmModal = async (fileNames: string[]): Promise<boolean> => {
        const htmlList = `<ul class="text-left text-sm">${fileNames.map(f => `<li>📄 ${f}</li>`).join('')}</ul>`;

        const result = await MySwal.fire({
            title: 'Konfirmasi Upload',
            html: `
        <p class="mb-2">Berikut file yang akan diupload:</p>
        ${htmlList}
      `,
            icon: 'question',
            width: '450px',
            showCancelButton: true,
            confirmButtonText: 'Upload',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#10B981',
            cancelButtonColor: '#EF4444',
        });

        return result.isConfirmed;
    };

    const showResultModal = (success: boolean, message: string) => {
        Swal.fire({
            title: success ? 'Berhasil' : 'Gagal',
            text: message,
            icon: success ? 'success' : 'error',
            confirmButtonColor: success ? '#10B981' : '#EF4444',
            width: '450px',
        });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const validDataList: any[] = [];
        const validFileNames: string[] = [];

        // Validate files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type !== 'application/json') continue;

            try {
                const content = await file.text();
                const json = JSON.parse(content);

                if (json.data && json.data['NAMA JABATAN'] && json.data['UNIT KERJA']) {
                    validDataList.push(json.data);
                    validFileNames.push(file.name);
                }
            } catch (_) {
                continue;
            }
        }

        if (validDataList.length === 0) {
            showResultModal(false, 'File JSON tidak valid.');
            return;
        }

        // Tampilkan modal konfirmasi sebelum upload
        const confirm = await showConfirmModal(validFileNames);
        if (!confirm) return;

        // Upload
        setIsLoading(true);
        try {
            const res = await fetch('/api/upload-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: validDataList }),
            });

            const result = await res.json();
            if (!res.ok) {
                // Gagal → tampilkan pesan error dari response
                showResultModal(false, 'Terjadi kesalahan saat upload');
            } else {
                // Berhasil → tampilkan pesan sukses
                showResultModal(true, result.message || 'Upload berhasil');
            }
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
                Upload Beberapa File JSON
            </h2>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-500 transition">
                {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
                ) : (
                    <FileJson className="w-10 h-10 text-purple-500 mb-2" />
                )}
                <p className="text-gray-600 font-medium">Pilih file JSON</p>
                <input
                    type="file"
                    accept=".json"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                />
            </label>
        </div>
    );
}
