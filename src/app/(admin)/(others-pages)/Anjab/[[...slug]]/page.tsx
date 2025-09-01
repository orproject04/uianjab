// src/app/(admin)/(others-pages)/Anjab/[[...slug]]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import WordAbk from "@/components/form/form-elements/WordAbk";

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

    // href ke halaman edit = FULL PATH (semua segmen, pakai "/")
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

    // Empty state untuk /Anjab (tanpa slug)
    if (!id) {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <p>Silakan pilih jabatan untuk ditampilkan.</p>
            </div>
        );
    }

    if (status === "loading") {
        return <p style={{ padding: 20 }}>Loading...</p>;
    }

    if (status === "notfound") {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <p style={{ padding: 20 }}>
                    Data tidak ditemukan untuk <b>{id}</b>
                </p>
                <WordAnjab id={id} />
            </div>
        );
    }

    if (status === "error") {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <p style={{ padding: 20, color: "#b91c1c" }}>
                    Terjadi kesalahan saat memuat data <b>{id}</b>. Coba lagi nanti.
                </p>
                <WordAnjab id={id} />
            </div>
        );
    }

    // === status === "ok" ===
    return (
        <>
            {/* Bar atas sangat tipis, tidak mempengaruhi tinggi iframe 100vh */}
            <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "flex-end" }}>
                <Link
                    href={editHref}
                    className="rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700"
                >
                    Edit Anjab
                </Link>
            </div>

            {/* KEMBALIKAN seperti semula: iframe full viewport height (100vh) */}
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
