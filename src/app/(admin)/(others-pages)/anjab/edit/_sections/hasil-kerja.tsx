// src/app/(admin)/(others-pages)/AnjabEdit/_sections/hasil-kerja.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection, FormActions } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

/** ====== Types ====== */
type HKNode = {
    text: string;
    children: HKNode[]; // only one-level used by the editor (no grand-children)
};

type HasilKerjaItem = {
    id: number;             // SERIAL int; 0 = baris baru
    jabatan_id: string;     // UUID
    hasil_kerja: HKNode[];  // NESTED
    satuan_hasil: string[]; // TEXT[]
    _tmpKey?: string;
};

/** ===== Small list input for string[] (used for satuan_hasil) ===== */
function StringList({
                        label,
                        value,
                        onChange,
                        placeholder,
                        inputRef,
                    }: {
    label: string;
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    inputRef?: React.RefObject<HTMLInputElement>;
}) {
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);

    const setAndEmit = (next: string[]) => { setItems(next); onChange(next); };

    const add = (after?: number) => {
        const idx = typeof after === "number" ? after + 1 : items.length;
        const next = [...items];
        next.splice(idx, 0, "");
        setAndEmit(next);
        setTimeout(() => refs.current[idx]?.focus(), 0);
    };

    const remove = (i: number) => {
        if (items.length <= 1) return; // minimal 1 item agar UX tidak “kosong total”
        setAndEmit(items.filter((_, x) => x !== i));
    };

    const update = (i: number, v: string) => {
        const next = [...items]; next[i] = v; setAndEmit(next);
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(i); }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && items[i] === "" && items.length > 1) {
            e.preventDefault(); remove(i);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <div className="space-y-2">
                {items.map((v, i) => (
                    <div key={i} className="flex gap-2">
                        <input
                            ref={(el) => {
                                refs.current[i] = el;
                                if (i === 0 && inputRef && !inputRef.current) {
                                    // optional: hook first input to external ref for auto-focus
                                    (inputRef as any).current = el;
                                }
                            }}
                            type="text"
                            value={v ?? ""}
                            onChange={(e) => update(i, e.target.value)}
                            onKeyDown={(e) => onKey(e, i)}
                            placeholder={placeholder}
                            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                        />
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            disabled={items.length <= 1}
                            title="Hapus baris"
                            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={() => add()}
                className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Tambah
            </button>
        </div>
    );
}

/** ===== Nested editor for hasil_kerja: HKNode[] ===== */
function NestedHasilKerjaEditor({
                                    value,
                                    onChange,
                                    firstInputRef,
                                }: {
    value: HKNode[];
    onChange: (v: HKNode[]) => void;
    firstInputRef?: React.RefObject<HTMLInputElement>;
}) {
    const [items, setItems] = useState<HKNode[]>(value ?? []);
    const parentRefs = useRef<Array<HTMLInputElement | null>>([]);
    const childRefs = useRef<Record<string, Array<HTMLInputElement | null>>>({});

    useEffect(() => { setItems(value ?? []); }, [value]);

    const setAndEmit = (next: HKNode[]) => { setItems(next); onChange(next); };

    const newParent = (): HKNode => ({ text: "", children: [] });
    const newChild = (): HKNode => ({ text: "", children: [] });

    const addParent = (after?: number) => {
        const idx = typeof after === "number" ? after + 1 : items.length;
        const next = [...items];
        next.splice(idx, 0, newParent());
        setAndEmit(next);
        setTimeout(() => parentRefs.current[idx]?.focus(), 0);
    };
    const removeParent = (i: number) => {
        const next = items.filter((_, x) => x !== i);
        setAndEmit(next.length ? next : [newParent()]); // jangan kosong total
    };
    const updateParentText = (i: number, text: string) => {
        const next = [...items];
        next[i] = { ...next[i], text };
        setAndEmit(next);
    };

    const addChild = (pi: number, after?: number) => {
        const next = [...items];
        const kids = [...(next[pi]?.children ?? [])];
        const idx = typeof after === "number" ? after + 1 : kids.length;
        kids.splice(idx, 0, newChild());
        next[pi] = { ...next[pi], children: kids };
        setAndEmit(next);
        const key = `p${pi}`;
        if (!childRefs.current[key]) childRefs.current[key] = [];
        setTimeout(() => childRefs.current[key][idx]?.focus(), 0);
    };
    const removeChild = (pi: number, ci: number) => {
        const next = [...items];
        const kids = [...(next[pi]?.children ?? [])].filter((_, x) => x !== ci);
        next[pi] = { ...next[pi], children: kids };
        setAndEmit(next);
    };
    const updateChildText = (pi: number, ci: number, text: string) => {
        const next = [...items];
        const kids = [...(next[pi]?.children ?? [])];
        kids[ci] = { ...kids[ci], text };
        next[pi] = { ...next[pi], children: kids };
        setAndEmit(next);
    };

    const onParentKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addParent(i); }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && items[i].text === "") {
            e.preventDefault(); removeParent(i);
        }
    };
    const onChildKey = (e: React.KeyboardEvent<HTMLInputElement>, pi: number, ci: number) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addChild(pi, ci); }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && (items[pi].children[ci].text ?? "") === "") {
            e.preventDefault(); removeChild(pi, ci);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Hasil Kerja (Nested)
                </label>
                <button
                    type="button"
                    onClick={() => addParent()}
                    className="rounded px-3 py-1 bg-brand-500 text-white hover:bg-brand-600 active:scale-95 transition-transform flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Tambah Item
                </button>
            </div>

            {items.length === 0 && (
                <div className="text-center py-6 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada item hasil kerja.</p>
                </div>
            )}

            {items.map((p, pi) => (
                <div key={`p-${pi}`} className="rounded border p-3 space-y-3 bg-gray-50 dark:bg-gray-800">
                    {/* Parent text */}
                    <div className="flex gap-2">
                        <input
                            ref={(el) => {
                                parentRefs.current[pi] = el;
                                if (pi === 0 && firstInputRef && !firstInputRef.current) {
                                    (firstInputRef as any).current = el;
                                }
                            }}
                            type="text"
                            value={p.text ?? ""}
                            onChange={(e) => updateParentText(pi, e.target.value)}
                            onKeyDown={(e) => onParentKey(e, pi)}
                            placeholder="Contoh: Dokumen Rencana Strategis ..."
                            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="button"
                            onClick={() => removeParent(pi)}
                            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700"
                            title="Hapus parent"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Children list (satu level) */}
                    <div className="space-y-2">
                        <label className="block text-xs text-gray-600 dark:text-gray-300">Rincian (children)</label>
                        {(p.children ?? []).map((c, ci) => (
                            <div key={`p-${pi}-c-${ci}`} className="flex gap-2 pl-0 md:pl-4">
                                <input
                                    ref={(el) => {
                                        const key = `p${pi}`;
                                        if (!childRefs.current[key]) childRefs.current[key] = [];
                                        childRefs.current[key][ci] = el;
                                    }}
                                    type="text"
                                    value={c.text ?? ""}
                                    onChange={(e) => updateChildText(pi, ci, e.target.value)}
                                    onKeyDown={(e) => onChildKey(e, pi, ci)}
                                    placeholder="Contoh: 9 (sembilan) draft ..."
                                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeChild(pi, ci)}
                                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700"
                                    title="Hapus child"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => addChild(pi)}
                            className="w-full md:w-auto px-3 py-1 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                            </svg>
                            Tambah Rincian
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** ===== Section: Hasil Kerja ===== */
export default function HasilKerjaForm({ viewerPath }: { viewerPath: string }) {
    const [resolvedId, setResolvedId] = useState<string>("");
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<HasilKerjaItem[]>([]);
    const [saving, setSaving] = useState<number | "new" | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const firstRefParent = useRef<HTMLInputElement>(null); // auto-focus parent text pertama
    const firstRefSatuan = useRef<HTMLInputElement>(null);

    // Resolve key localStorage
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    const fetchAll = async (jabatanId: string) => {
        if (!jabatanId) { setLoading(false); return; }
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(jabatanId)}/hasil-kerja`, { cache: "no-store" });
            if (!res.ok) {
                setRows([]); setLastError(`Gagal memuat Hasil Kerja (HTTP ${res.status}).`); return;
            }
            const raw = await res.json();
            const normalized: HasilKerjaItem[] = Array.isArray(raw)
                ? raw.map((r: any, i: number) => ({
                    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
                    jabatan_id: typeof r?.jabatan_id === "string" ? r.jabatan_id : jabatanId,
                    hasil_kerja: Array.isArray(r?.hasil_kerja)
                        ? r.hasil_kerja.map((n: any) => ({
                            text: typeof n?.text === "string" ? n.text : "",
                            children: Array.isArray(n?.children)
                                ? n.children.map((c: any) => ({
                                    text: typeof c?.text === "string" ? c.text : "",
                                    children: [], // editor satu level saja
                                }))
                                : [],
                        }))
                        : [],
                    satuan_hasil: Array.isArray(r?.satuan_hasil) ? r.satuan_hasil : [],
                    _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`,
                }))
                : [];
            setRows(normalized);
            setTimeout(() => (firstRefParent.current?.focus() || firstRefSatuan.current?.focus()), 0);
        } catch {
            setRows([]); setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                setLoading(false); setRows([]); setLastError("__NOT_FOUND_KEY__"); return;
            }
            if (!resolvedId) { setLoading(false); return; }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedId, storageInfo.exists]);

    // Helpers
    const addRow = () => {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setRows(prev => [
            ...prev,
            {
                id: 0,
                jabatan_id: resolvedId,
                hasil_kerja: [{ text: "", children: [] }],
                satuan_hasil: [""],
                _tmpKey: tmpKey,
            },
        ]);
        setTimeout(() => (firstRefParent.current?.focus() || firstRefSatuan.current?.focus()), 0);
    };

    const updateLocal = (idx: number, patch: Partial<HasilKerjaItem>) => {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    };

    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    // Save/Delete
    async function saveRow(idx: number) {
        const it = rows[idx];

        // bersihkan node: drop parent tanpa text & child tanpa text
        const cleanedHK: HKNode[] = (it.hasil_kerja ?? []).map(p => ({
            text: (p.text ?? "").trim(),
            children: (p.children ?? []).map(c => ({ text: (c.text ?? "").trim(), children: [] })).filter(c => c.text),
        })).filter(p => p.text);

        const payload = {
            hasil_kerja: cleanedHK,                 // kirim nested ke API
            satuan_hasil: (it.satuan_hasil ?? []).map(s => String(s).trim()).filter(Boolean),
        };

        setSaving(it.id > 0 ? it.id : "new");
        try {
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja/${it.id}`,
                    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? it.id,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    hasil_kerja: Array.isArray(json.data?.hasil_kerja) ? json.data.hasil_kerja : [],
                    satuan_hasil: Array.isArray(json.data?.satuan_hasil) ? json.data.satuan_hasil : [],
                });
            } else {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
                );
                const json = await res.json();
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
                updateLocal(idx, {
                    id: Number(json.data?.id) ?? 0,
                    jabatan_id: json.data?.jabatan_id ?? resolvedId,
                    hasil_kerja: Array.isArray(json.data?.hasil_kerja) ? json.data.hasil_kerja : [],
                    satuan_hasil: Array.isArray(json.data?.satuan_hasil) ? json.data.satuan_hasil : [],
                });
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Hasil Kerja disimpan." });
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
            title: "Hapus Hasil Kerja?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (it.id > 0) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/hasil-kerja/${it.id}`,
                    { method: "DELETE" }
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setRows(prev => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Hasil Kerja dihapus." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e) });
        }
    }

    // ===== UI: key localStorage tidak ada =====
    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <EditSectionWrapper
                title="Hasil Kerja"
                description="ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal"
                icon={
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                }
            >
                <div className="text-center py-12">
                    <div className="text-red-600 mb-4">
                        <p>ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                        <p className="text-sm text-gray-600 mt-2">
                            Buka halaman create terlebih dahulu atau pastikan hasil kerja pernah dibuat sehingga ID tersimpan,
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
                title="Hasil Kerja"
                description="Memuat data hasil kerja..."
                icon={
                    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
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
            title="Hasil Kerja"
            description="Edit hasil kerja (nested) dan satuan hasil untuk jabatan ini"
            icon={
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
            }
        >
            <div className="space-y-6">
                {rows.length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Belum ada hasil kerja yang ditambahkan</p>
                        <button
                            type="button"
                            onClick={addRow}
                            className="px-6 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors inline-flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                            </svg>
                            Tambah
                        </button>
                    </div>
                ) : (
                    <>
                        {rows.map((row, idx) => {
                            const key = (row.id > 0 ? `row-${row.id}` : row._tmpKey) || `row-${idx}`;
                            return (
                                <FormSection key={key} title={`Hasil Kerja ${idx + 1}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                        {/* LEFT: nested hasil_kerja */}
                                        <div className="md:col-span-7">
                                            <NestedHasilKerjaEditor
                                                value={row.hasil_kerja ?? []}
                                                onChange={(v) => updateLocal(idx, { hasil_kerja: v })}
                                                firstInputRef={firstRefParent}
                                            />
                                        </div>

                                        {/* RIGHT: satuan_hasil */}
                                        <div className="md:col-span-5">
                                            <StringList
                                                label="Satuan Hasil"
                                                value={row.satuan_hasil ?? []}
                                                onChange={(v) => updateLocal(idx, { satuan_hasil: v })}
                                                placeholder="Contoh: Dokumen, Laporan"
                                                inputRef={firstRefSatuan}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                                        <button
                                            type="button"
                                            onClick={() => saveRow(idx)}
                                            disabled={saving === row.id || saving === "new"}
                                            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                        >
                                            {saving === row.id || saving === "new" ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                                    </svg>
                                                    Menyimpan...
                                                </>
                                            ) : (
                                                "Simpan"
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(idx)}
                                            className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </FormSection>
                            );
                        })}
                        <button
                            type="button"
                            onClick={addRow}
                            className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                            </svg>
                            Tambah
                        </button>
                    </>
                )}

                <FormActions>
                    <Link
                        href={`/anjab/${viewerPath}`}
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Kembali
                    </Link>
                </FormActions>
            </div>
        </EditSectionWrapper>
    );
}
