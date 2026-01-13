"use client";

import { useParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { SECTION_COMPONENTS_SLUG as SECTION_COMPONENTS, SECTION_LABELS_SLUG } from "../../_sections/registry";
import AnjabBreadcrumb from "@/components/common/AnjabBreadcrumb";
import { slugToTitle } from "@/lib/text-utils";

export default function EditAnySectionPage() {
    const params = useParams() as { section: string; slug?: string[] };
    const rawSlug = useMemo(
        () => (Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : []),
        [params.slug]
    );

    // id untuk DB/API = path lengkap dengan "/"
    const id = useMemo(() => rawSlug.join("/"), [rawSlug]);

    // path viewer sama dengan id
    const viewerPath = useMemo(() => rawSlug.join("/"), [rawSlug]);

    const SectionForm = (SECTION_COMPONENTS as any)[params.section];

    if (!SectionForm) {
        return (
            <div className="p-6">
                <AnjabBreadcrumb
                    currentId={id}
                    currentTitle={`Edit ${params.section} - ${rawSlug.length > 0 ? slugToTitle(rawSlug.join('-')) : 'Unknown'}`}
                    rawSlug={rawSlug}
                />
                <p className="text-red-600">Bagian "{params.section}" tidak dikenali.</p>
                <Link className="underline text-blue-600" href={`/anjab/${viewerPath}?tab=pdf`}>
                    Lihat PDF
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <AnjabBreadcrumb
                currentId={id}
                currentTitle={`Edit ${(SECTION_LABELS_SLUG as any)[params.section] ?? params.section} - ${rawSlug.length > 0 ? slugToTitle(rawSlug.join('-')) : 'Unknown'}`}
                rawSlug={rawSlug}
            />

            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">
                    Edit {(SECTION_LABELS_SLUG as any)[params.section] ?? params.section}
                </h1>
                <div className="flex items-center gap-2">
                    <Link href={`/anjab/${viewerPath}?tab=pdf`} className="rounded border px-3 py-1.5">
                        Lihat PDF
                    </Link>
                    {params.section === "tugas-pokok" && (
                        <ClearAbkButton viewerPath={viewerPath} />
                    )}
                </div>
            </div>

            <SectionForm id={id} viewerPath={viewerPath} />
        </div>
    );
}

function ClearAbkButton({ viewerPath }: { viewerPath: string }) {
    const [petaId, setPetaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const MySwal = withReactContent(Swal);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch(`/api/peta-jabatan/resolve?slug=${encodeURIComponent(viewerPath)}`);
                const j = await res.json().catch(() => ({}));
                if (mounted && j?.success && j?.data?.peta_jabatan_id) setPetaId(j.data.peta_jabatan_id);
                else if (mounted) {
                    const slugKey = viewerPath.split("/").filter(Boolean).slice(-2).join("/");
                    const resolved = localStorage.getItem(slugKey);
                    if (resolved) {
                        // try to fetch peta by jabatan_id
                        const p = await fetch(`/api/peta-jabatan?jabatan_id=${resolved}`);
                        const pj = await p.json().catch(() => ({}));
                        if (pj?.success && Array.isArray(pj.data) && pj.data.length) setPetaId(pj.data[0].id);
                    }
                }
            } catch (e) {}
        })();
        return () => { mounted = false; };
    }, [viewerPath]);

    const handle = async () => {
        if (!petaId) return MySwal.fire({ icon: 'warning', title: 'peta_jabatan_id belum tersedia' });

        const conf = await MySwal.fire({
            icon: 'warning',
            title: 'Hapus semua ABK?',
            text: 'Anda akan menghapus semua ABK untuk jabatan ini.',
            showCancelButton: true,
            confirmButtonText: 'Hapus Semua',
            cancelButtonText: 'Batal',
            confirmButtonColor: "#EF4444",
        });
        if (!conf.isConfirmed) return;

        setLoading(true);
        // show loading dialog but do not await it (avoid blocking execution)
        MySwal.fire({
            title: 'Menghapus...',
            allowOutsideClick: false,
            didOpen: () => MySwal.showLoading(),
        });

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            let res: Response | null = null;
            try {
                res = await fetch('/api/abk/tugas-pokok/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peta_jabatan_id: petaId }), signal: controller.signal });
            } finally {
                clearTimeout(timeout);
            }

            const j = await (res ? res.json().catch(() => ({})) : Promise.resolve({}));
            if (!res || !res.ok || j?.error) throw new Error(j?.error || `HTTP ${res?.status}`);
            MySwal.close();
            await MySwal.fire({ icon: 'success', title: 'Selesai', text: 'Semua ABK telah dihapus.' });
            location.reload();
        } catch (e: any) {
            MySwal.close();
            const msg = e?.name === 'AbortError' ? 'Permintaan dibatalkan (timeout).' : String(e?.message || e);
            await MySwal.fire({ icon: 'error', title: 'Gagal', text: msg });
        } finally { setLoading(false); }
    };

    return (
        <button onClick={handle} disabled={loading} className="rounded border px-3 py-1.5 text-red-600 border-red-200">
            {loading ? 'Menghapus...' : 'Hapus Semua ABK'}
        </button>
    );
}