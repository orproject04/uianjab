"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import Link from "next/link";
import { SECTION_COMPONENTS, SECTION_LABELS } from "../../_sections/registry";

export default function EditAnySectionPage() {
    const params = useParams() as { section: string; slug?: string[] };
    const rawSlug = useMemo(
        () => (Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : []),
        [params.slug]
    );

    // id untuk DB/API = dua segmen terakhir digabung dengan "-"
    const id = useMemo(() => {
        if (rawSlug.length === 0) return "";
        if (rawSlug.length === 1) return rawSlug[0];
        return rawSlug.slice(-2).join("-");
    }, [rawSlug]);

    // path viewer pakai "/"
    const viewerPath = useMemo(() => rawSlug.join("/"), [rawSlug]);

    const SectionForm = SECTION_COMPONENTS[params.section];

    if (!SectionForm) {
        return (
            <div className="p-6">
                <p className="text-red-600">Bagian “{params.section}” tidak dikenali.</p>
                <Link className="underline text-blue-600" href={`/Anjab/${viewerPath}`}>
                    Lihat PDF
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">
                    Edit {SECTION_LABELS[params.section] ?? params.section}
                </h1>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-3 py-1.5">
                    Lihat PDF
                </Link>
            </div>

            <SectionForm id={id} viewerPath={viewerPath} />
        </div>
    );
}
