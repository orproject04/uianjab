'use client';

import {useRef, useState} from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import {FileJson, Loader2} from 'lucide-react';
import {apiFetch} from "@/lib/apiFetch";
import {usePathname} from 'next/navigation';

const MySwal = withReactContent(Swal);

// Ganti sesuai rute backend barumu
const UPLOAD_ENDPOINT = '/api/anjab/docs';

interface WordAnjabProps {
    id: string; // (tidak dipakai untuk upload tunggal ini, disimpan saja jika dibutuhkan nanti)
    /** Batasi ekstensi yang boleh diunggah. Default ".doc,.docx". */
    acceptExt?: string;
}

export default function WordAnjab({id, acceptExt = ".doc,.docx"}: WordAnjabProps) {
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

    // Ambil 2 segmen terakhir setelah "/anjab/..." → gabung '-' → jadi slug
    const getSlugFromPath = (): string | null => {
        try {
            const path = String(pathname || "");
            const parts = path.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p.toLowerCase() === 'anjab');
            const tail = idx >= 0 ? parts.slice(idx + 1) : [];
            const lastTwo = tail.slice(-2);
            if (lastTwo.length === 0) return null;
            // normalisasi sederhana
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

    // Ambil struktur_id yang kamu simpan di localStorage (key: so:<slug-join>)
    const getStrukturIdFromLocalStorage = (): string | null => {
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

    const handleFileUploadWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Batasi maksimal 1 file
        if (files.length > 1) {
            await MySwal.fire({
                icon: "error",
                title: "Maksimal 1 file",
                text: "Silakan pilih hanya satu file untuk diunggah.",
            });
            clearFileInput();
            return;
        }

        // Validasi ekstensi
        const allowed = acceptExt.split(",").map(s => s.trim().toLowerCase());
        const bad = Array.from(files).filter(f => {
            const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
            return !allowed.includes(ext);
        });
        if (bad.length) {
            await MySwal.fire({
                icon: "error",
                title: "Ekstensi tidak didukung",
                html: `<p>File berikut tidak didukung: </p>
               <ul class="text-left list-disc pl-5">${bad.map(b => `<li>${b.name}</li>`).join("")}</ul>
               <p class="mt-2">Hanya ${allowed.join(" ")} yang diperbolehkan.</p>`,
            });
            clearFileInput();
            return;
        }

        const confirmed = await showConfirmModal(Array.from(files).map(f => f.name));
        if (!confirmed) {
            clearFileInput();
            return;
        }

        // Wajib: struktur_id harus ada
        const struktur_id = getStrukturIdFromLocalStorage();
        if (!struktur_id) {
            await MySwal.fire({
                icon: "error",
                title: "Gagal",
                text: "Jabatan dan Dokumen Anjab Gagal Terhubung, Silakan Hapus Jabatan dan Buat Ulang",
            });
            clearFileInput();
            return;
        }

        // Wajib: slug untuk backend (dipakai deteksi duplikat)
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

        // Siapkan FormData untuk 1 file
        const formData = new FormData();
        formData.append('file', files[0]);      // ✅ hanya satu file
        formData.append('slug', slug);          // ✅ wajib untuk backend
        formData.append('struktur_id', struktur_id); // ✅ opsional, tapi kita kirim

        setIsLoading(true);
        try {
            const res = await apiFetch(UPLOAD_ENDPOINT, {method: 'POST', body: formData});
            const result = await res.json().catch(() => ({} as any));

            if (res.ok) {
                // Backend sukses → tampilkan detail jabatan_id, slug, struktur_id
                const details = `
          <ul class="list-disc pl-5">
            ${result.jabatan_id ? `<li><b>jabatan_id:</b> <code>${result.jabatan_id}</code></li>` : ''}
            ${result.slug ? `<li><b>slug:</b> <code>${result.slug}</code></li>` : ''}
            ${result.struktur_id ? `<li><b>struktur_id:</b> <code>${result.struktur_id}</code></li>` : ''}
          </ul>
        `;
                await showResultModal(true, result.message || 'Upload berhasil', details);
            } else {
                // Tampilkan pesan error dari server, termasuk 409 "Slug sudah pernah dipakai"
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
                <p className="text-xs text-gray-500 mt-1">Hanya {acceptExt} yang diperbolehkan</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptExt}
                    multiple={false}              // ✅ hanya 1 file
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </label>
        </div>
    );
}
