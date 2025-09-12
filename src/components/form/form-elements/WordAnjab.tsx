'use client';

import { useRef, useState } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { FileJson, Loader2 } from 'lucide-react';
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

interface WordAnjabProps {
    id: string;
    /** Batasi ekstensi yang boleh diunggah. Default ".doc,.docx". */
    acceptExt?: string;
}

export default function WordAnjab({ id, acceptExt = ".doc,.docx" }: WordAnjabProps) {
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

        // ⬇️ Validasi ekstensi sesuai acceptExt
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

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
        formData.append('id_jabatan', id);

        setIsLoading(true);
        try {
            const res = await apiFetch('/api/anjab/docs', { method: 'POST', body: formData });
            const result = await res.json();
            await showResultModal(res.ok, result.message || (res.ok ? 'Upload berhasil' : 'Gagal'));
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
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-500 transition">
                {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
                ) : (
                    <FileJson className="w-10 h-10 text-purple-500 mb-2" />
                )}
                <p className="text-gray-600 font-medium">Pilih file Word</p>
                <p className="text-xs text-gray-500 mt-1">Hanya {acceptExt} yang diperbolehkan</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptExt}
                    multiple
                    onChange={handleFileUploadWord}
                    className="hidden"
                />
            </label>
        </div>
    );
}
