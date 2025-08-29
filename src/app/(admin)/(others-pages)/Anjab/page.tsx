"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import WordAnjab from "@/components/form/form-elements/WordAnjab";
import WordAbk from "@/components/form/form-elements/WordAbk";

export default function InformasiJabatanPage() {
    const params = useParams();
    const slugArray = Array.isArray(params.slug) ? params.slug : [params.slug];
    const id = slugArray.slice(-2).join("/"); // ambil 2 terakhir

    const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");

    useEffect(() => {
        async function check() {
            try {
                const res = await fetch(`/api/anjab/preview-anjab?id=${id}`, { method: "HEAD" });
                if (res.ok) {
                    setStatus("ok");
                } else if (res.status === 404) {
                    setStatus("notfound");
                } else {
                    setStatus("notfound");
                }
            } catch (err) {
                setStatus("notfound");
            }
        }
        check();
    }, [id]);

    if (status === "loading") {
        return <p style={{ padding: 20 }}>Loading...</p>;
    }

    if (status === "notfound") {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <p style={{ padding: 20}}>Data tidak ditemukan untuk <b>{id}</b></p>
                <WordAnjab id={id} />
            </div>
        );
    }

    return (
        <div style={{ width: "100%", height: "100vh" }}>
            <iframe
                src={`/api/anjab/preview-anjab?id=${id}&output=pdf`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Preview PDF"
            />
            <WordAbk id={id} />
        </div>
    );
}
