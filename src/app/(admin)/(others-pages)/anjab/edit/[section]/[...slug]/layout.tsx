"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { SECTION_ORDER, SECTION_LABELS } from "../../_sections/registry";

export default function Layout({ children }: { children: React.ReactNode }) {
    const params = useParams() as { section: string; slug?: string[] };
    const rawSlug = useMemo(
        () => (Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : []),
        [params.slug]
    );
    const viewerPath = useMemo(() => rawSlug.join("/"), [rawSlug]);

    const currentIndex = SECTION_ORDER.indexOf(params.section as any);
    const prevSection = currentIndex > 0 ? SECTION_ORDER[currentIndex - 1] : null;
    const nextSection =
        currentIndex >= 0 && currentIndex < SECTION_ORDER.length - 1
            ? SECTION_ORDER[currentIndex + 1]
            : null;

    return (
        <div className="space-y-4">
            {/* Navigasi Next/Prev */}
            <div className="flex justify-between">
                {prevSection ? (
                    <Link
                        href={`/anjab/edit/${prevSection}/${viewerPath}`}
                        className="px-4 py-2 rounded border bg-gray-50 hover:bg-gray-100"
                    >
                        ← {SECTION_LABELS[prevSection]}
                    </Link>
                ) : <div />}

                {nextSection ? (
                    <Link
                        href={`/anjab/edit/${nextSection}/${viewerPath}`}
                        className="px-4 py-2 rounded border bg-gray-50 hover:bg-gray-100"
                    >
                        {SECTION_LABELS[nextSection]} →
                    </Link>
                ) : <div />}
            </div>

            {/* Konten section */}
            {children}
        </div>
    );
}
