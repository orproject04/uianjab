"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import WordAbk from "@/components/form/form-elements/WordAbk";

type Status = "loading" | "ok" | "notfound" | "error";

export default function InformasiJabatanPage() {
    const params = useParams();

    // Ambil 2 segmen terakhir dari route dan join pakai "-"
    const rawSlug = Array.isArray((params as any).slug)
        ? (params as any).slug
        : [(params as any).slug];

    const id = useMemo(() => rawSlug.slice(-2).join("-"), [rawSlug]);
    const encodedId = useMemo(() => encodeURIComponent(id), [id]);

    const [status, setStatus] = useState<Status>("loading");
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    // cegah efek ganda di dev
    const didRunRef = useRef(false);

    useEffect(() => {
        setStatus("loading");
        setPdfUrl(null);
        didRunRef.current = false;
    }, [encodedId]);

    useEffect(() => {
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
    }, [encodedId]);

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

    // status === "ok"
    return (
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
            <WordAbk id={id} />
        </div>
    );
}
