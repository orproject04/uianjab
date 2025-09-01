// src/app/(admin)/(others-pages)/Anjab/[[...slug]]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
// (Opsional) kalau perlu juga ABK di layar ini, tinggal un-comment import & komponen
// import WordAbk from "@/components/form/form-elements/WordAbk";

type Status = "loading" | "ok" | "notfound" | "error";

export default function InformasiJabatanPage() {
    const params = useParams();

    // slug bisa undefined (saat /Anjab)
    const rawSlug = useMemo<string[]>(() => {
        const s = (params as any)?.slug;
        if (!s) return [];
        return Array.isArray(s) ? s : [String(s)];
    }, [params]);

    // id untuk DB/API = join 2 segmen terakhir pakai "-"
    const id = useMemo(() => {
        if (rawSlug.length === 0) return "";
        if (rawSlug.length === 1) return rawSlug[0];
        return rawSlug.slice(-2).join("-");
    }, [rawSlug]);

    const encodedId = useMemo(() => (id ? encodeURIComponent(id) : ""), [id]);

    // href ke halaman edit = FULL PATH (semua segmen, pakai "/") → **tetap pakai gaya lama**
    const editHref = useMemo(() => {
        if (rawSlug.length === 0) return "#";
        const fullPath = rawSlug.join("/"); // contoh: "A/B/C/D"
        return `/AnjabEdit/jabatan/${fullPath}`;
    }, [rawSlug]);

    const [status, setStatus] = useState<Status>("loading");
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    // cegah efek ganda di dev
    const didRunRef = useRef(false);

    useEffect(() => {
        if (!id) {
            setStatus("notfound");
            setPdfUrl(null);
            return;
        }
        setStatus("loading");
        setPdfUrl(null);
        didRunRef.current = false;
    }, [id, encodedId]);

    useEffect(() => {
        if (!id) return;
        if (didRunRef.current) return;
        didRunRef.current = true;

        let alive = true;
        let tmpUrl: string | null = null;

        (async () => {
            try {
                const res = await fetch(`/api/anjab/${encodedId}/pdf`, { cache: "no-store" });
                if (!alive) return;

                if (!res.ok) {
                    setStatus(res.status === 404 ? "notfound" : "error");
                    return;
                }

                const blob = await res.blob();
                if (blob.type && blob.type !== "application/pdf") {
                    setStatus("error");
                    return;
                }

                tmpUrl = URL.createObjectURL(blob);
                setPdfUrl(tmpUrl);
                setStatus("ok");
            } catch {
                if (alive) setStatus("error");
            }
        })();

        return () => {
            alive = false;
            if (tmpUrl) URL.revokeObjectURL(tmpUrl);
        };
    }, [id, encodedId]);

    // === Empty state untuk /Anjab (tanpa slug) ===
    if (!id) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center space-y-4">
                <p className="text-gray-700">Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading") {
        return <p style={{ padding: 20 }}>Loading...</p>;
    }

    if (status === "notfound" || status === "error") {
        const isNotFound = status === "notfound";
        return (
            <div className="p-8 max-w-5xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                    <p className={isNotFound ? "text-gray-800" : "text-red-700"}>
                        {isNotFound
                            ? <>Data tidak ditemukan untuk <b>{id}</b>.</>
                            : <>Terjadi kesalahan saat memuat data <b>{id}</b>. Coba lagi nanti.</>}
                    </p>
                    <p className="text-sm text-gray-600">
                        Silakan memilih antara <b>mengunggah dokumen Anjab berformat .doc</b> (tidak mendukung .docx)
                        atau <b>membuat Anjab secara manual</b>.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Upload Word (.doc saja) */}
                    <div className="border rounded-lg p-4">
                        <h3 className="font-medium mb-2 text-center">Upload Dokumen Anjab (.doc)</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            Ekstrak otomatis dari dokumen Word <b>.doc</b> untuk ID: <b>{id}</b>. <i>.docx tidak didukung.</i>
                        </p>
                        {/* ⬇️ Lewatkan prop acceptExt=".doc" agar hanya .doc yang diterima */}
                        <WordAnjab id={id} acceptExt=".doc" />
                    </div>

                    {/* Buat Manual (center tombolnya) */}
                    <div className="border rounded-lg p-4 flex">
                        <div className="m-auto text-center space-y-3">
                            <h3 className="font-medium">Buat Anjab Manual</h3>
                            <p className="text-sm text-gray-600">
                                Mulai dari form kosong. ID akan dikunci: <b>{id}</b>.
                            </p>
                            <Link
                                href={`/AnjabCreate/${encodeURIComponent(id)}`}
                                className="inline-block rounded bg-green-600 text-white px-4 py-2 hover:bg-green-700"
                            >
                                + Buat Anjab Manual
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // === status === "ok" ===
    return (
        <>
            {/* Bar atas sangat tipis, tidak mempengaruhi tinggi iframe 100vh */}
            <div
                style={{
                    padding: 12,
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                }}
            >
                <Link
                    href={editHref} // (pastikan tetap pakai fullPath lama)
                    className="rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700"
                >
                    Edit Anjab
                </Link>
            </div>

            {/* iframe full viewport height (100vh) */}
            <div style={{ width: "100%", height: "100vh" }}>
                {pdfUrl ? (
                    <iframe
                        src={pdfUrl}
                        style={{ width: "100%", height: "100%", border: "none" }}
                        title={`Preview PDF - ${id}`}
                    />
                ) : (
                    <p style={{ padding: 20 }}>Menyiapkan dokumen…</p>
                )}
            </div>
        </>
    );
}
