'use client';

import {useRef, useState} from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import {FileJson, Loader2} from 'lucide-react';
import {apiFetch} from "@/lib/apiFetch";
import {usePathname} from 'next/navigation';

const MySwal = withReactContent(Swal);

// Endpoint backend Anda
const UPLOAD_ENDPOINT = '/api/anjab/docs';

// Accept yang robust: ekstensi + MIME
const DEFAULT_ACCEPT =
    ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface WordAnjabProps {
    id: string; // disimpan untuk kebutuhan lain
    /** Batasi ekstensi yang boleh diunggah. Default termasuk .doc, .docx dan MIME terkait. */
    acceptExt?: string;
}

export default function WordAnjab({id, acceptExt = DEFAULT_ACCEPT}: WordAnjabProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pathname = usePathname();

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

    // --- Helpers to get jabatan_id from localStorage based on peta slug path ---
    const getSlugPathFromUrl = (): string | null => {
        try {
            const path = String(pathname || "");
            const parts = path.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p.toLowerCase() === 'anjab');
            const tail = idx >= 0 ? parts.slice(idx + 1) : [];
            if (tail.length === 0) return null;
            // Join all segments after 'anjab' dengan dash (misal: "setjen-depmin" atau "setjen")
            const slugDash = tail
                .map(s => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, ''))
                .filter(Boolean)
                .join('-')
                .replace(/-+/g, '-');
            return slugDash || null;
        } catch {
            return null;
        }
    };

    const getJabatanIdFromLocalStorage = (): string | null => {
        try {
            const slugPath = getSlugPathFromUrl();
            if (!slugPath) return null;
            // Konversi dash ke slash untuk key localStorage
            const slugForUrl = slugPath.replace(/-/g, '/');
            const key = `anjab:${slugForUrl}`;
            const v = localStorage.getItem(key);
            return (typeof v === 'string' && v.trim()) ? v.trim() : null;
        } catch {
            return null;
        }
    };

    // --- Validasi .doc / .docx yang robust ---
    const parseAccept = (accept: string) => {
        const items = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const exts = new Set<string>();
        const mimes = new Set<string>();
        for (const it of items) {
            if (it.startsWith('.')) exts.add(it);
            else if (it.includes('/')) mimes.add(it);
        }
        // pastikan keduanya ada walaupun caller hanya memberi ekstensi
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
        if (i < 0) return ''; // tidak ada ekstensi
        return filename.slice(i).toLowerCase();
    };

    const isAllowedWordFile = (f: File, exts: Set<string>, mimes: Set<string>) => {
        const ext = getExt(f.name);
        const mime = (f.type || '').toLowerCase(); // bisa kosong di beberapa browser
        // lolos jika: ekstensinya cocok ATAU MIME cocok
        return (exts.has(ext)) || (mime && mimes.has(mime));
    };

    // --- Handler upload ---
    const handleFileUploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        await processFiles(files);
    };

    // --- Handler drag & drop ---
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

    // --- Process files (shared by input & drop) ---
    const processFiles = async (files: FileList) => {

        // Maks 1 file
        if (files.length > 1) {
            await MySwal.fire({
                icon: "error",
                title: "Maksimal 1 file",
                text: "Silakan pilih hanya satu file untuk diunggah.",
            });
            clearFileInput();
            return;
        }

        // Validasi ekstensi/MIME
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

        // jabatan_id: ambil dari localStorage atau generate UUID baru
        let jabatan_id = getJabatanIdFromLocalStorage();
        
        if (!jabatan_id) {
            // Generate UUID baru untuk jabatan baru
            jabatan_id = crypto.randomUUID();
        }

        // Kirim FormData dengan jabatan_id (wajib)
        const formData = new FormData();
        formData.append('file', f);
        formData.append('jabatan_id', jabatan_id); // API expects 'jabatan_id' parameter

        setIsLoading(true);
        try {
            const res = await apiFetch(UPLOAD_ENDPOINT, {method: 'POST', body: formData});
            const result = await res.json().catch(() => ({} as any));

            if (res.ok) {
                await showResultModal(true, result.message || 'Upload berhasil', '');
            } else {
                await showResultModal(false, result.error || `Gagal mengunggah (${res.status})`);
            }
        } catch (err) {
            await showResultModal(false, 'Gagal mengirim ke server.');
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
                    {isDragging ? 'Lepaskan file di sini' : 'Klik atau seret file ke sini'}
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
