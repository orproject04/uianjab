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

    // --- Helpers slug & peta_id (tetap) ---
    const getSlugFromPath = (): string | null => {
        try {
            const path = String(pathname || "");
            const parts = path.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p.toLowerCase() === 'anjab');
            const tail = idx >= 0 ? parts.slice(idx + 1) : [];
            const lastTwo = tail.slice(-2);
            if (lastTwo.length === 0) return null;
            const slugDash = lastTwo
                .map(s => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, ''))
                .filter(Boolean)
                .join('-')
                .replace(/-+/g, '-');
            return slugDash || null;
        } catch {
            return null;
        }
    };

    const getPetaIdFromLocalStorage = (): string | null => {
        try {
            const path = String(pathname || "");
            const parts = path.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p.toLowerCase() === 'anjab');
            const tail = idx >= 0 ? parts.slice(idx + 1) : [];
            const lastTwo = tail.slice(-2);
            if (lastTwo.length === 0) return null;
            const slugDash = lastTwo.join('-');
            const key = `so:${slugDash}`;
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

        // Wajib: peta_id harus ada
        const peta_id = getPetaIdFromLocalStorage();
        if (!peta_id) {
            await MySwal.fire({
                icon: "error",
                title: "Gagal",
                text: "Jabatan dan Dokumen Anjab Gagal Terhubung, Silakan Hapus Jabatan dan Buat Ulang",
            });
            clearFileInput();
            return;
        }

        // Wajib: slug untuk backend (deteksi duplikat)
        const slug = getSlugFromPath();
        if (!slug) {
            await MySwal.fire({
                icon: "error",
                title: "Gagal",
                text: "Slug tidak bisa ditentukan dari URL.",
            });
            clearFileInput();
            return;
        }

        // Kirim FormData
        const formData = new FormData();
        formData.append('file', f);
        formData.append('slug', slug);
        formData.append('peta_id', peta_id);

        setIsLoading(true);
        try {
            const res = await apiFetch(UPLOAD_ENDPOINT, {method: 'POST', body: formData});
            const result = await res.json().catch(() => ({} as any));

            if (res.ok) {
                const details = `
          <ul class="list-disc pl-5">
            ${result.jabatan_id ? `<li><b>jabatan_id:</b> <code>${result.jabatan_id}</code></li>` : ''}
            ${result.slug ? `<li><b>slug:</b> <code>${result.slug}</code></li>` : ''}
            ${result.peta_id ? `<li><b>peta_id:</b> <code>${result.peta_id}</code></li>` : ''}
          </ul>
        `;
                await showResultModal(true, result.message || 'Upload berhasil', details);
            } else {
                await showResultModal(false, result.error || `Gagal mengunggah (${res.status})`);
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
        <div className="mx-auto p-4 bg-white rounded-xl border">
            <label
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-500 transition">
                {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2"/>
                ) : (
                    <FileJson className="w-10 h-10 text-purple-500 mb-2"/>
                )}
                <p className="text-gray-600 font-medium">Pilih file Word</p>
                <p className="text-xs text-gray-500 mt-1">Hanya .doc / .docx yang diperbolehkan</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptExt}          // ← ekstensinya + MIME
                    multiple={false}
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </label>
        </div>
    );
}
