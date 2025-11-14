"use client";

import { useParams } from "next/navigation";
import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { SECTION_COMPONENTS, SECTION_LABELS } from "../../../../edit/_sections/registry";
import AnjabBreadcrumb from "@/components/common/AnjabBreadcrumb";

export default function EditMasterSectionPage() {
    const params = useParams() as { section: string; id: string };
    const [jabatanName, setJabatanName] = useState("");
    const [isReady, setIsReady] = useState(false);

    // Untuk master edit, id langsung dari parameter (UUID)
    const id = params.id;
    
    // Buat viewerPath sederhana yang akan dicari di localStorage
    // Form components mencari dengan pattern: viewerPath.split("/").slice(-2).join("/")
    // Untuk UUID, kita buat path dummy yang ketika di-slice(-2) menghasilkan key yang benar
    const viewerPath = `master/${id}`;

    // Set localStorage SEBELUM component render
    useEffect(() => {
        // Simpan UUID ke localStorage dengan key yang akan dicari form components
        // Form mencari: viewerPath.split("/").slice(-2).join("/") = "master/${id}"
        localStorage.setItem(`master/${id}`, id);
        setIsReady(true);
    }, [id]);

    // Load nama jabatan untuk display
    useEffect(() => {
        const loadJabatan = async () => {
            try {
                const response = await fetch(`/api/anjab/detail?id=${id}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data) {
                        setJabatanName(data.data.nama_jabatan || "");
                    }
                }
            } catch (error) {
                console.error("Error loading jabatan:", error);
            }
        };
        
        if (isReady) {
            loadJabatan();
        }
    }, [id, isReady]);

    const SectionForm = (SECTION_COMPONENTS as any)[params.section];

    if (!SectionForm) {
        return (
            <div className="p-6">
                <p className="text-red-600">Bagian "{params.section}" tidak dikenali.</p>
                <Link className="underline text-blue-600" href={`/anjab/master`}>
                    Kembali ke Master Anjab
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            {jabatanName && (
                <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                    Editing: <span className="font-semibold">{jabatanName}</span>
                </div>
            )}
            
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">
                    Edit {(SECTION_LABELS as any)[params.section] ?? params.section}
                </h1>
                <Link href={`/anjab/master`} className="rounded border px-3 py-1.5">
                    Kembali ke Daftar
                </Link>
            </div>

            {isReady && <SectionForm id={id} viewerPath={viewerPath} />}
        </div>
    );
}
