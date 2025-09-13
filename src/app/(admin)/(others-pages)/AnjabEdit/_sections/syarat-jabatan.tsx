"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type SJRow = {
    id: number | null;       // SERIAL (boleh null saat belum ada)
    jabatan_id: string;      // UUID

    keterampilan_kerja: string[];
    bakat_kerja: string[];
    temperamen_kerja: string[];
    minat_kerja: string[];
    upaya_fisik: string[];
    fungsi_pekerja: string[];

    kondisi_fisik_jenkel: string;
    kondisi_fisik_umur: string;
    kondisi_fisik_tb: string;
    kondisi_fisik_bb: string;
    kondisi_fisik_pb: string;
    kondisi_fisik_tampilan: string;
    kondisi_fisik_keadaan: string;
};

function ListInput({
                       title,
                       placeholder,
                       value,
                       onChange,
                   }: {
    title: string;
    placeholder: string;
    value: string[];
    onChange: (next: string[]) => void;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);

    function sync(n: string[]) { setItems(n); onChange(n); }
    function add(after?: number) {
        const n = [...items];
        const idx = typeof after === "number" ? after + 1 : items.length;
        n.splice(idx, 0, "");
        sync(n);
        setTimeout(() => refs.current[idx]?.focus(), 0);
    }
    function remove(i: number) { sync(items.filter((_, x) => x !== i)); }
    function update(i: number, v: string) { const n = [...items]; n[i] = v; sync(n); }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">{title}</label>
            {items.map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        ref={(el) => (refs.current[i] = el)}
                        type="text"
                        value={items[i] ?? ""}
                        onChange={(e) => update(i, e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 rounded border px-3 py-2"
                    />
                    <button
                        type="button"
                        onClick={() => add(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-green-600 text-white hover:bg-green-700"
                        title="Tambah item di bawah"
                    >+</button>
                    <button
                        type="button"
                        onClick={() => remove(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                        title="Hapus item ini"
                    >✕</button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => add()}
                className="rounded px-3 py-2 bg-green-600 text-white hover:bg-green-700"
            >
                + Tambah {title}
            </button>
        </div>
    );
}

export default function SyaratJabatanForm({
                                              id,           // tidak dipakai lagi; UUID di-resolve dari localStorage
                                              viewerPath,   // contoh: "setjen/depmin-okk"
                                          }: {
    id: string;
    viewerPath: string;
}) {
    const [storageKey, setStorageKey] = useState<string>("");
    const [resolvedId, setResolvedId] = useState<string>("");
    const [hasKey, setHasKey] = useState<boolean>(true);

    const [loading, setLoading] = useState(true);
    const [row, setRow] = useState<SJRow | null>(null);
    const [saving, setSaving] = useState(false);

    function resolveFromStorage(vpath: string) {
        const key = vpath.split("/").filter(Boolean).slice(-2).join("/");
        setStorageKey(key);
        try {
            const val = localStorage.getItem(key);
            if (!val) { setHasKey(false); setResolvedId(""); }
            else { setHasKey(true); setResolvedId(val); }
        } catch { setHasKey(false); setResolvedId(""); }
    }

    useEffect(() => { resolveFromStorage(viewerPath); }, [viewerPath]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!hasKey || !resolvedId) {
                setLoading(false);
                setRow(null);
                return;
            }
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/syarat-jabatan`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();

                const def: SJRow = {
                    id: json?.id ?? null,
                    jabatan_id: json?.jabatan_id ?? resolvedId,

                    keterampilan_kerja: Array.isArray(json?.keterampilan_kerja) ? json.keterampilan_kerja : [],
                    bakat_kerja: Array.isArray(json?.bakat_kerja) ? json.bakat_kerja : [],
                    temperamen_kerja: Array.isArray(json?.temperamen_kerja) ? json.temperamen_kerja : [],
                    minat_kerja: Array.isArray(json?.minat_kerja) ? json.minat_kerja : [],
                    upaya_fisik: Array.isArray(json?.upaya_fisik) ? json.upaya_fisik : [],
                    fungsi_pekerja: Array.isArray(json?.fungsi_pekerja) ? json.fungsi_pekerja : [],

                    kondisi_fisik_jenkel: String(json?.kondisi_fisik_jenkel ?? ""),
                    kondisi_fisik_umur: String(json?.kondisi_fisik_umur ?? ""),
                    kondisi_fisik_tb: String(json?.kondisi_fisik_tb ?? ""),
                    kondisi_fisik_bb: String(json?.kondisi_fisik_bb ?? ""),
                    kondisi_fisik_pb: String(json?.kondisi_fisik_pb ?? ""),
                    kondisi_fisik_tampilan: String(json?.kondisi_fisik_tampilan ?? ""),
                    kondisi_fisik_keadaan: String(json?.kondisi_fisik_keadaan ?? ""),
                };
                setRow(def);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Syarat Jabatan." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [hasKey, resolvedId]);

    const retry = () => resolveFromStorage(viewerPath);

    async function onSave() {
        if (!row) return;
        const payload = {
            keterampilan_kerja: (row.keterampilan_kerja ?? []).map(s => s.trim()).filter(Boolean),
            bakat_kerja: (row.bakat_kerja ?? []).map(s => s.trim()).filter(Boolean),
            temperamen_kerja: (row.temperamen_kerja ?? []).map(s => s.trim()).filter(Boolean),
            minat_kerja: (row.minat_kerja ?? []).map(s => s.trim()).filter(Boolean),
            upaya_fisik: (row.upaya_fisik ?? []).map(s => s.trim()).filter(Boolean),
            fungsi_pekerja: (row.fungsi_pekerja ?? []).map(s => s.trim()).filter(Boolean),

            kondisi_fisik_jenkel: (row.kondisi_fisik_jenkel ?? "").trim(),
            kondisi_fisik_umur: (row.kondisi_fisik_umur ?? "").trim(),
            kondisi_fisik_tb: (row.kondisi_fisik_tb ?? "").trim(),
            kondisi_fisik_bb: (row.kondisi_fisik_bb ?? "").trim(),
            kondisi_fisik_pb: (row.kondisi_fisik_pb ?? "").trim(),
            kondisi_fisik_tampilan: (row.kondisi_fisik_tampilan ?? "").trim(),
            kondisi_fisik_keadaan: (row.kondisi_fisik_keadaan ?? "").trim(),

            upsert: true,
        };

        setSaving(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/syarat-jabatan`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);

            const d = json.data ?? {};
            setRow(prev => prev ? {
                ...prev,
                id: d?.id ?? prev.id,
                jabatan_id: d?.jabatan_id ?? resolvedId,
                keterampilan_kerja: d?.keterampilan_kerja ?? prev.keterampilan_kerja,
                bakat_kerja: d?.bakat_kerja ?? prev.bakat_kerja,
                temperamen_kerja: d?.temperamen_kerja ?? prev.temperamen_kerja,
                minat_kerja: d?.minat_kerja ?? prev.minat_kerja,
                upaya_fisik: d?.upaya_fisik ?? prev.upaya_fisik,
                fungsi_pekerja: d?.fungsi_pekerja ?? prev.fungsi_pekerja,
                kondisi_fisik_jenkel: d?.kondisi_fisik_jenkel ?? prev.kondisi_fisik_jenkel,
                kondisi_fisik_umur: d?.kondisi_fisik_umur ?? prev.kondisi_fisik_umur,
                kondisi_fisik_tb: d?.kondisi_fisik_tb ?? prev.kondisi_fisik_tb,
                kondisi_fisik_bb: d?.kondisi_fisik_bb ?? prev.kondisi_fisik_bb,
                kondisi_fisik_pb: d?.kondisi_fisik_pb ?? prev.kondisi_fisik_pb,
                kondisi_fisik_tampilan: d?.kondisi_fisik_tampilan ?? prev.kondisi_fisik_tampilan,
                kondisi_fisik_keadaan: d?.kondisi_fisik_keadaan ?? prev.kondisi_fisik_keadaan,
            } : null);

            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Syarat Jabatan disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(false);
        }
    }

    if (!hasKey || !resolvedId) {
        return (
            <div className="p-6 space-y-3">
                <p className="text-red-600">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                <p className="text-sm text-gray-600">
                    Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                    lalu kembali ke halaman ini.
                </p>
                <div className="flex items-center gap-3">
                    <button className="rounded border px-3 py-1.5" onClick={retry}>Coba lagi</button>
                    <Link href={`/Anjab/${viewerPath}`} className="rounded border px-3 py-1.5">Kembali</Link>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-6">Memuat…</div>;
    if (!row) return <div className="p-6 text-red-600">Data tidak tersedia.</div>;

    return (
        <div className="space-y-8">
            <div className="flex justify-end">
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">Kembali</Link>
            </div>

            {/* Kolom array */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ListInput title="Keterampilan Kerja" placeholder="Mis. Menyusun laporan, Analisis data"
                           value={row.keterampilan_kerja}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), keterampilan_kerja: v }))}/>
                <ListInput title="Bakat Kerja" placeholder="Mis. Kecermatan, Ketelitian"
                           value={row.bakat_kerja}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), bakat_kerja: v }))}/>
                <ListInput title="Temperamen Kerja" placeholder="Mis. Stabil, Tegas"
                           value={row.temperamen_kerja}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), temperamen_kerja: v }))}/>
                <ListInput title="Minat Kerja" placeholder="Mis. Administrasi, Pelayanan publik"
                           value={row.minat_kerja}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), minat_kerja: v }))}/>
                <ListInput title="Upaya Fisik" placeholder="Mis. Berjalan, Duduk lama"
                           value={row.upaya_fisik}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), upaya_fisik: v }))}/>
                <ListInput title="Fungsi Pekerja" placeholder="Mis. Koordinasi, Pengawasan"
                           value={row.fungsi_pekerja}
                           onChange={(v) => setRow(r => ({ ...(r as SJRow), fungsi_pekerja: v }))}/>
            </div>

            {/* Kolom scalar (kondisi fisik) */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">Jenis Kelamin</label>
                        <input type="text" value={row.kondisi_fisik_jenkel}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_jenkel: e.target.value }))}
                               placeholder="Mis. L/P" className="w-full rounded border px-3 py-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Umur</label>
                        <input type="text" value={row.kondisi_fisik_umur}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_umur: e.target.value }))}
                               placeholder="Mis. 25–50 th" className="w-full rounded border px-3 py-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Postur Badan</label>
                        <input type="text" value={row.kondisi_fisik_pb}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_pb: e.target.value }))}
                               placeholder="Mis. Proporsional" className="w-full rounded border px-3 py-2"/>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">TB</label>
                        <input type="text" value={row.kondisi_fisik_tb}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_tb: e.target.value }))}
                               placeholder="Mis. ≥160 cm" className="w-full rounded border px-3 py-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">BB</label>
                        <input type="text" value={row.kondisi_fisik_bb}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_bb: e.target.value }))}
                               placeholder="Mis. 50–80 kg" className="w-full rounded border px-3 py-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Tampilan</label>
                        <input type="text" value={row.kondisi_fisik_tampilan}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_tampilan: e.target.value }))}
                               placeholder="Mis. Rapi" className="w-full rounded border px-3 py-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Keadaan Fisik</label>
                        <input type="text" value={row.kondisi_fisik_keadaan}
                               onChange={(e) => setRow(r => ({ ...(r as SJRow), kondisi_fisik_keadaan: e.target.value }))}
                               placeholder="Mis. Sehat jasmani & rohani" className="w-full rounded border px-3 py-2"/>
                    </div>
                </div>
            </div>

            <div className="pt-2">
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {saving ? "Menyimpan…" : "Simpan"}
                </button>
            </div>
        </div>
    );
}
