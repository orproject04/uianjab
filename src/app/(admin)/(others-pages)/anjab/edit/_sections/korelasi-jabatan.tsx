// src/app/(admin)/(others-pages)/AnjabEdit/_sections/korelasi-jabatan.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

type KJRow = {
    id: number;                 // SERIAL
    jabatan_id: string;         // UUID
    jabatan_terkait: string;    // TEXT
    unit_kerja_instansi: string;// TEXT
    dalam_hal: string[];        // TEXT[]
    _tmpKey?: string;           // key lokal React
};

function ListInput({
                       value,
                       onChange,
                       placeholder,
                       title,
                   }: {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    title: string;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);

    const sync = (n: string[]) => { setItems(n); onChange(n); };
    
    const add = () => {
        const n = [...items, ""];
        sync(n);
        setTimeout(() => refs.current[items.length]?.focus(), 0);
    };
    
    const remove = (i: number) => {
        if (items.length <= 1) return; // Minimal 1 item
        sync(items.filter((_, x) => x !== i));
    };
    
    const update = (i: number, v: string) => { 
        const n = [...items]; 
        n[i] = v; 
        sync(n); 
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        // Enter: tambah item baru di bawah
        if (e.key === "Enter") {
            e.preventDefault();
            const n = [...items];
            n.splice(i + 1, 0, "");
            sync(n);
            setTimeout(() => refs.current[i + 1]?.focus(), 0);
        }
        // Ctrl+Backspace: hapus item kosong
        if (e.key === "Backspace" && e.ctrlKey && items[i] === "" && items.length > 1) {
            e.preventDefault();
            remove(i);
            setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 0);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{title}</label>
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            ref={(el) => { refs.current[i] = el; }}
                            type="text"
                            value={item ?? ""}
                            onChange={(e) => update(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            placeholder={placeholder}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            disabled={items.length <= 1}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Hapus item (atau tekan Ctrl+Backspace pada item kosong)"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={add}
                className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 dark:hover:border-brand-400 dark:hover:text-brand-400 transition-colors flex items-center justify-center gap-2 text-sm"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah {title}
            </button>
        </div>
    );
}

export default function KorelasiJabatanForm({
                                                id,            // TIDAK dipakai (compat), kita pakai UUID dari localStorage
                                                viewerPath,    // contoh: "setjen/depmin/okk"
                                            }: {
    id: string;
    viewerPath: string;
}) {
    const [storageKey, setStorageKey] = useState<string>("");
    const [resolvedId, setResolvedId] = useState<string>("");
    const [hasKey, setHasKey] = useState<boolean>(true);

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<KJRow[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const firstRef = useRef<HTMLInputElement>(null);

    function resolveFromStorage(vpath: string) {
        const key = vpath.split("/").filter(Boolean).slice(-2).join("/");
        setStorageKey(key);
        try {
            const val = localStorage.getItem(key);
            if (!val) {
                setHasKey(false);
                setResolvedId("");
            } else {
                setHasKey(true);
                setResolvedId(val);
            }
        } catch {
            setHasKey(false);
            setResolvedId("");
        }
    }

    useEffect(() => { resolveFromStorage(viewerPath); }, [viewerPath]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!hasKey || !resolvedId) {
                setLoading(false);
                setRows([]);
                return;
            }
            try {
                setLoading(true);
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/korelasi-jabatan`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const data: KJRow[] = Array.isArray(json)
                    ? json.map((r: any, i: number) => ({
                        id: Number(r?.id) || 0,
                        jabatan_id: String(r?.jabatan_id ?? resolvedId),
                        jabatan_terkait: String(r?.jabatan_terkait ?? ""),
                        unit_kerja_instansi: String(r?.unit_kerja_instansi ?? ""),
                        dalam_hal: Array.isArray(r?.dalam_hal) ? r.dalam_hal : [],
                        _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`
                    }))
                    : [];
                setRows(data);
                setTimeout(() => firstRef.current?.focus(), 0);
            } catch {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Korelasi Jabatan." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [hasKey, resolvedId]);

    const retry = () => resolveFromStorage(viewerPath);

    function addRow() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [...prev, {
            id: 0,
            jabatan_id: resolvedId,
            jabatan_terkait: "",
            unit_kerja_instansi: "",
            dalam_hal: [],
            _tmpKey: tmpKey,
        }]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    function updateLocal(idx: number, patch: Partial<KJRow>) {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }

    async function saveRow(idx: number) {
        const it = rows[idx];
        const payload = {
            jabatan_terkait: String(it.jabatan_terkait ?? "").trim(),
            unit_kerja_instansi: String(it.unit_kerja_instansi ?? "").trim(),
            dalam_hal: (it.dalam_hal ?? []).map(s => String(s ?? "").trim()).filter(Boolean),
        };
        if (!payload.jabatan_terkait) {
            await MySwal.fire({ icon: "warning", title: "Validasi", text: "Jabatan terkait wajib diisi." });
            return;
        }

        setSaving(it.id > 0 ? it.id : "new");
        try {
            let res: Response;
            if (it.id > 0) {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/korelasi-jabatan/${it.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/korelasi-jabatan`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            updateLocal(idx, {
                id: Number(json.data?.id) ?? it.id,
                jabatan_id: String(json.data?.jabatan_id ?? resolvedId),
                jabatan_terkait: String(json.data?.jabatan_terkait ?? ""),
                unit_kerja_instansi: String(json.data?.unit_kerja_instansi ?? ""),
                dalam_hal: Array.isArray(json.data?.dalam_hal) ? json.data.dalam_hal : [],
            });
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Korelasi Jabatan disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(null);
        }
    }

    async function deleteRow(idx: number) {
        const it = rows[idx];
        const ok = await MySwal.fire({
            icon: "warning",
            title: "Hapus Korelasi Jabatan?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/korelasi-jabatan/${it.id}`, { method: "DELETE" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Korelasi Jabatan dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // Pesan "key tidak ditemukan di localStorage" â†’ sama seperti modul lain
    if (!hasKey || !resolvedId) {
        return (
            <EditSectionWrapper
                title="Korelasi Jabatan"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <div className="text-red-600 mb-4">
                        <p>ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                        <p className="text-sm text-gray-600 mt-2">
                            Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan,
                            lalu kembali ke halaman ini.
                        </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                            onClick={retry}
                        >
                            Coba lagi
                        </button>
                        <Link 
                            href={`/anjab/${viewerPath}`} 
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Kembali
                        </Link>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    if (loading) {
        return (
            <EditSectionWrapper
                title="Korelasi Jabatan"
                description="Memuat data korelasi jabatan..."
                icon={
                    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                }
            >
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Memuat data...</p>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            title="Korelasi Jabatan"
            description="Kelola korelasi jabatan dengan jabatan lain dalam organisasi"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            }
        >
            {rows.length === 0 ? (
                <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 mb-4 text-gray-400">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Belum ada korelasi jabatan yang ditambahkan
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Mulai dengan menambahkan korelasi jabatan pertama
                    </p>
                    <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Korelasi Jabatan
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {rows.map((row, idx) => {
                        const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                        const isSaving = saving === row.id || saving === "new";

                        return (
                            <FormSection key={key} title={`Korelasi Jabatan ${idx + 1}`}>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Jabatan Terkait <span className="text-red-600">*</span>
                                            </label>
                                            <input
                                                ref={idx === rows.length - 1 ? firstRef : undefined}
                                                type="text"
                                                value={row.jabatan_terkait ?? ""}
                                                onChange={(e) => updateLocal(idx, { jabatan_terkait: e.target.value })}
                                                placeholder="Contoh: Analis Kebijakan Madya"
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Unit Kerja/Instansi
                                            </label>
                                            <input
                                                type="text"
                                                value={row.unit_kerja_instansi ?? ""}
                                                onChange={(e) => updateLocal(idx, { unit_kerja_instansi: e.target.value })}
                                                placeholder="Contoh: Biro Perencanaan"
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <ListInput
                                        title="Dalam Hal"
                                        value={row.dalam_hal ?? []}
                                        onChange={(v) => updateLocal(idx, { dalam_hal: v })}
                                        placeholder="Contoh: Koordinasi penyusunan data dan pelaporan"
                                    />

                                    <div className="flex items-center gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => saveRow(idx)}
                                            disabled={isSaving}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSaving ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                                    Menyimpan...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Simpan
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(idx)}
                                            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                            </FormSection>
                        );
                    })}

                    <button
                        type="button"
                        onClick={addRow}
                        className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 dark:hover:border-brand-400 dark:hover:text-brand-400 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah Korelasi Jabatan Baru
                    </button>
                </div>
            )}

        </EditSectionWrapper>
    );
}
