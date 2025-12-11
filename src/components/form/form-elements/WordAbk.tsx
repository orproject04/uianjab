'use client';

import {useRef, useState} from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import {FileJson, Loader2} from 'lucide-react';
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

const DEFAULT_ACCEPT = ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface WordAbkProps {
    id: string; // jabatan_id (UUID)
    petaJabatanId: string; // peta_jabatan_id (UUID) - spesifik untuk posisi ini
    viewerPath: string; // untuk redirect setelah berhasil
    acceptExt?: string;
}

export default function WordAbk({id, petaJabatanId, viewerPath, acceptExt = DEFAULT_ACCEPT}: WordAbkProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
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

    const parseAccept = (accept: string) => {
        const items = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const exts = new Set<string>();
        const mimes = new Set<string>();
        for (const it of items) {
            if (it.startsWith('.')) exts.add(it);
            else if (it.includes('/')) mimes.add(it);
        }
        if (!exts.size) {
            exts.add('.doc');
            exts.add('.docx');
        }
        if (!mimes.size) {
            mimes.add('application/msword');
            mimes.add('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        }
        return {exts, mimes};
    };

    const getExt = (filename: string): string => {
        const i = filename.lastIndexOf('.');
        if (i < 0) return '';
        return filename.slice(i).toLowerCase();
    };

    const isAllowedWordFile = (f: File, exts: Set<string>, mimes: Set<string>) => {
        const ext = getExt(f.name);
        const mime = (f.type || '').toLowerCase();
        return (exts.has(ext)) || (mime && mimes.has(mime));
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        await processFiles(files);
    };

    const handleFileUploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        await processFiles(files);
    };

    const processFiles = async (files: FileList) => {
        if (files.length > 1) {
            await MySwal.fire({
                icon: "error",
                title: "Maksimal 1 file",
                text: "Silakan pilih hanya satu file untuk diunggah.",
            });
            clearFileInput();
            return;
        }

        const {exts, mimes} = parseAccept(acceptExt);
        const f = files[0];
        if (!isAllowedWordFile(f, exts, mimes)) {
            await MySwal.fire({
                icon: "error",
                title: "Ekstensi/MIME tidak didukung",
                html: `
          <p>File: <b>${f.name}</b></p>
          <p class="mt-2">Hanya <code>.doc</code> / <code>.docx</code> yang diperbolehkan.</p>
        `,
            });
            clearFileInput();
            return;
        }

        const confirmed = await showConfirmModal([f.name]);
        if (!confirmed) {
            clearFileInput();
            return;
        }

        const formData = new FormData();
        formData.append('file', f);
        formData.append('jabatan_id', id);
        formData.append('peta_jabatan_id', petaJabatanId);

        setIsLoading(true);
        try {
            const res = await apiFetch('/api/abk/docs', {method: 'POST', body: formData});
            const result = await res.json().catch(() => ({} as any));

            if (res.ok) {
                await MySwal.fire({
                    title: "Berhasil",
                    html: `
                        <div class="text-left">
                            <p class="mb-2">Dokumen ABK berhasil diproses!</p>
                            ${result.inserted ? `<p class="text-sm text-green-600">✓ ${result.inserted} data berhasil diimpor</p>` : ''}
                            ${result.skipped ? `<p class="text-sm text-gray-600">⊘ ${result.skipped} data dilewati (duplikat)</p>` : ''}
                        </div>
                    `,
                    icon: "success",
                    confirmButtonColor: "#10B981",
                    didClose: () => {
                        // Redirect ke viewerPath dengan tab PDF
                        window.location.href = `/anjab/${viewerPath}?tab=pdf`;
                    },
                });
            } else {
                await MySwal.fire({
                    title: "Gagal",
                    text: result.error || result.message || `Gagal mengunggah (${res.status})`,
                    icon: "error",
                    confirmButtonColor: "#EF4444",
                });
            }
        } catch (err) {
            await MySwal.fire({
                title: "Gagal",
                text: 'Gagal mengirim ke server.',
                icon: "error",
                confirmButtonColor: "#EF4444",
            });
        } finally {
            setIsLoading(false);
            clearFileInput();
        }
    };

    return (
        <div className="mx-auto p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    isDragging
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 scale-105'
                        : 'border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500'
                }`}
            >
                {isLoading ? (
                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mb-3"/>
                ) : (
                    <FileJson className="w-12 h-12 text-purple-500 mb-3"/>
                )}
                <p className="text-gray-700 dark:text-gray-200 font-medium text-center">
                    {isDragging ? 'Lepaskan file di sini' : 'Klik atau seret file ABK ke sini'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    Hanya .doc / .docx yang diperbolehkan
                </p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptExt}
                    multiple={false}
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </div>
        </div>
    );
}
