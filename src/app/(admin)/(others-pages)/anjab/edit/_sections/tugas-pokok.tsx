"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import {apiFetch} from "@/lib/apiFetch";
import EditSectionWrapper, { FormSection } from "@/components/form/EditSectionWrapper";

const MySwal = withReactContent(Swal);

/** ================= Types ================= */
type HasilNode = { text: string; children: HasilNode[] };

type TahapanDetail = {
    nomor_tahapan: number | null;
    tahapan: string;
    detail_tahapan: string[];
};

type TugasPokok = {
    id: string;
    jabatan_id: string;
    nomor_tugas: number | null;
    uraian_tugas: string;
    hasil_kerja: HasilNode[];              // ⬅ berubah: nested
    jumlah_hasil: number | null;
    waktu_penyelesaian_jam: number | null;
    waktu_efektif: number | null;
    kebutuhan_pegawai: number | null;
    detail_uraian_tugas: TahapanDetail[];  // ⬅ tetap ADA (dipertahankan)
    _tmpKey?: string;
};

/** ================= Normalizer hasil_kerja (idempotent) ================= */
function normalizeHasil(input: any): HasilNode[] {
    const tryParse = (s: any) => {
        if (typeof s !== "string") return s;
        const t = s.trim();
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            try { return JSON.parse(t); } catch { return s; }
        }
        return s;
    };
    const unwrapTextIfJson = (node: any) => {
        if (!node || typeof node !== "object") return node;
        const parsedText = tryParse(node.text);
        if (parsedText && typeof parsedText === "object" && ("text" in parsedText || "children" in parsedText)) {
            const merged: any = {
                text: typeof (parsedText as any).text === "string" ? (parsedText as any).text : "",
                children: Array.isArray((parsedText as any).children) ? (parsedText as any).children : [],
            };
            if (Array.isArray(node.children) && node.children.length) {
                merged.children = [...merged.children, ...node.children];
            }
            return merged;
        }
        return node;
    };
    const walk = (x: any): HasilNode[] => {
        x = tryParse(x);
        if (Array.isArray(x)) return x.flatMap(walk);
        if (typeof x === "string") return [{ text: x, children: [] }];
        if (x && typeof x === "object") {
            const unwrapped = unwrapTextIfJson(x);
            const text = typeof unwrapped.text === "string" ? unwrapped.text : "";
            const children = walk(unwrapped.children ?? []);
            return [{ text, children }];
        }
        return [{ text: String(x), children: [] }];
    };
    return walk(input);
}

/** ================= Normalizer dari API ================= */
function normalizeFromApi(raw: any, fallbackJabatanId: string): TugasPokok {
    const asString = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const toNum = (v: any) => (v == null || v === "" ? null : Number(v));
    const asTahapanDetail = (arr: any): TahapanDetail[] =>
        Array.isArray(arr)
            ? arr.map((x: any, i: number): TahapanDetail => ({
                nomor_tahapan: x?.nomor_tahapan == null || x.nomor_tahapan === "" ? i + 1 : Number(x.nomor_tahapan),
                tahapan: typeof x?.tahapan === "string" ? x.tahapan : "",
                detail_tahapan: Array.isArray(x?.detail_tahapan) ? x.detail_tahapan : [],
            }))
            : [];

    return {
        id: raw?.id ? asString(raw.id) : "",
        jabatan_id: raw?.jabatan_id ? asString(raw.jabatan_id) : fallbackJabatanId,
        nomor_tugas: toNum(raw?.nomor_tugas),
        uraian_tugas: typeof raw?.uraian_tugas === "string" ? raw.uraian_tugas : "",
        hasil_kerja: normalizeHasil(raw?.hasil_kerja ?? []), // ⬅ hasil dari BE (objek)
        jumlah_hasil: toNum(raw?.jumlah_hasil),
        waktu_penyelesaian_jam: toNum(raw?.waktu_penyelesaian_jam),
        waktu_efektif: toNum(raw?.waktu_efektif),
        kebutuhan_pegawai: raw?.kebutuhan_pegawai == null ? null : Number(raw.kebutuhan_pegawai),
        detail_uraian_tugas: asTahapanDetail(raw?.detail_uraian_tugas),
    };
}

/** Reusable ArrayInput (string[]) — versi yang mengizinkan array kosong */
function ArrayInput({
                        label,
                        value,
                        onChange,
                        placeholder,
                        autoFocus = false,
                    }: {
    label: string;
    value: string[];
    onChange: (v: string[]) => void;
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const [items, setItems] = useState<string[]>(Array.isArray(value) ? value : []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        setItems(Array.isArray(value) ? value : []);
    }, [value]);

    function setAndEmit(next: string[]) {
        setItems(next);
        onChange(next);
    }

    function update(i: number, v: string) {
        const next = [...items];
        next[i] = v;
        setAndEmit(next);
    }

    function add() {
        const next = [...items, ""];
        setAndEmit(next);
        // fokus ke item baru
        setTimeout(() => refs.current[next.length - 1]?.focus(), 0);
    }

    function remove(i: number) {
        const next = items.filter((_, idx) => idx !== i); // ⬅ tak dibatasi; bisa jadi []
        setAndEmit(next);
        // fokus ke item sebelumnya jika ada
        setTimeout(() => {
            const targetIndex = Math.min(i - 1, next.length - 1);
            if (targetIndex >= 0) refs.current[targetIndex]?.focus();
        }, 0);
    }

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const next = [...items];
            next.splice(i + 1, 0, "");
            setAndEmit(next);
            setTimeout(() => refs.current[i + 1]?.focus(), 0);
        }
        // ctrl+Backspace untuk hapus item kosong (termasuk yang terakhir)
        if (e.key === "Backspace" && e.ctrlKey && items[i] === "") {
            e.preventDefault();
            remove(i);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
            </label>

            <div className="space-y-2">
                {items.map((v, i) => (
                    <div key={i} className="flex gap-2">
                        <input
                            ref={(el) => { refs.current[i] = el; }}
                            type="text"
                            value={v}
                            onChange={(e) => update(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                            placeholder={placeholder}
                            autoFocus={autoFocus && i === 0}
                        />
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            // ⬇ tombol tidak lagi disabled saat hanya 1 item
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            title="Hapus item"
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
                className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-colors flex items-center justify-center gap-2 text-sm"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah
            </button>

            {/* Opsional: tampilkan info saat kosong */}
            {items.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Belum ada detail. Klik "Tambah" untuk menambahkan.
                </p>
            )}
        </div>
    );
}

/** ================== Detail Uraian Tugas (dipertahankan) ================== */
function DetailUraianTugasEditor({
                                     value, onChange,
                                 }: { value: TahapanDetail[]; onChange: (v: TahapanDetail[]) => void; }) {
    const [items, setItems] = useState<TahapanDetail[]>(value ?? []);
    const tahapanRefs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => { setItems(value ?? []); }, [value]);
    function setAndEmit(next: TahapanDetail[]) { setItems(next); onChange(next); }
    function renumber(arr: TahapanDetail[]) { return arr.map((x, i) => ({ ...x, nomor_tahapan: i + 1 })); }

    function addNew() {
        const next = renumber([ ...items, { nomor_tahapan: items.length + 1, tahapan: "", detail_tahapan: [] } ]);
        setAndEmit(next);
        setTimeout(() => tahapanRefs.current[next.length - 1]?.focus(), 100);
    }
    function remove(i: number) {
        const next = renumber(items.filter((_, idx) => idx !== i));
        setAndEmit(next);
    }
    function update(i: number, patch: Partial<TahapanDetail>) {
        const next = [...items]; next[i] = { ...next[i], ...patch }; setAndEmit(next);
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Detail Uraian Tugas (Tahapan &amp; Rincian)
                    </label>
                    {items.length > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {items.length} tahapan
            </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={addNew}
                    className="rounded px-3 py-1 bg-brand-500 text-white hover:bg-green-700 transition-colors"
                >
                    Tambah Tahapan
                </button>
            </div>

            {items.length === 0 && (
                <div className="text-center py-6 px-4 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Belum ada tahapan. Klik "Tambah Tahapan".
                    </p>
                </div>
            )}

            {items.map((it, i) => (
                <div key={i} className="rounded border p-3 space-y-3 bg-gray-50 dark:bg-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                        <div>
                            <label className="block text-xs mb-1">Nomor Tahapan</label>
                            <input
                                type="number"
                                value={it.nomor_tahapan ?? i + 1}
                                onChange={(e) => update(i, { nomor_tahapan: e.target.value === "" ? null : Number(e.target.value) })}
                                className="w-full rounded border px-2 py-1"
                            />
                        </div>
                        <div className="md:col-span-5">
                            <label className="block text-xs mb-1">Judul Tahapan</label>
                            <input
                                ref={(el) => { tahapanRefs.current[i] = el; }}
                                type="text"
                                value={it.tahapan}
                                onChange={(e) => update(i, { tahapan: e.target.value })}
                                className="w-full rounded border px-2 py-1"
                                placeholder="Contoh: Mengidentifikasi kebutuhan anggaran"
                            />
                        </div>
                    </div>

                    <ArrayInput
                        label="Detail Tahapan"
                        value={it.detail_tahapan ?? []}
                        onChange={(arr) => update(i, { detail_tahapan: arr })}
                        placeholder="Contoh: Mengidentifikasi & mempelajari peraturan"
                    />

                    <div className="flex gap-2">
                        <button type="button" onClick={() => remove(i)} className="rounded px-3 py-1 bg-red-100 border">
                            Hapus Tahapan
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** ================== Hasil Kerja Editor (nested) ================== */
function HasilKerjaEditor({ value, onChange }: {
    value: HasilNode[] | any[]; onChange: (v: HasilNode[]) => void;
}) {
    const [tree, setTree] = useState<HasilNode[]>(() => normalizeHasil(value));
    useEffect(() => { setTree(normalizeHasil(value)); }, [value]);
    const emit = (next: HasilNode[]) => { setTree(next); onChange(next); };
    const make = (text = ""): HasilNode => ({ text, children: [] });

    const updateAt = (path: number[], patch: Partial<HasilNode>) => {
        const clone: HasilNode[] = structuredClone(tree);
        let cur: any = clone; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children;
        const idx = path[path.length - 1]; cur[idx] = { ...cur[idx], ...patch }; emit(clone);
    };
    const insertAfter = (path: number[]) => {
        const clone: HasilNode[] = structuredClone(tree);
        let cur: any = clone; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children;
        const idx = path[path.length - 1]; cur.splice(idx + 1, 0, make("")); emit(clone);
    };
    const removeAt = (path: number[]) => {
        const clone: HasilNode[] = structuredClone(tree);
        let cur: any = clone; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children;
        const idx = path[path.length - 1]; cur.splice(idx, 1); emit(clone);
    };
    const addChild = (path: number[]) => {
        const clone: HasilNode[] = structuredClone(tree);
        let cur: any = clone; for (let i = 0; i < path.length; i++) cur = cur[path[i]].children;
        cur.push(make("")); emit(clone);
    };
    const addAtLevelEnd = (prefix: number[]) => {
        const clone: HasilNode[] = structuredClone(tree);
        let cur: any = clone; for (let i = 0; i < prefix.length; i++) cur = cur[prefix[i]].children;
        cur.push(make("")); emit(clone);
    };

    const renderNodes = (nodes: HasilNode[], prefix: number[] = [], depth = 0) => (
        <div className={depth === 0 ? "space-y-2" : "space-y-2 pl-4 border-l"} style={{ borderColor: "#e5e7eb" }}>
            {nodes.map((n, i) => {
                const path = [...prefix, i];
                return (
                    <div key={path.join("-")} className="space-y-2">
                        <div className="flex items-start gap-2">
                            <input
                                className="flex-1 px-3 py-2 border rounded-lg"
                                type="text"
                                value={n.text}
                                onChange={(e) => updateAt(path, { text: e.target.value })}
                                placeholder={depth === 0 ? "Item hasil kerja" : "Sub-item"}
                            />
                            <div className="flex items-center gap-1">
                                <button type="button" onClick={() => insertAfter(path)} className="px-2 py-1 rounded border text-xs" title="Tambah saudara">+</button>
                                <button type="button" onClick={() => addChild(path)} className="px-2 py-1 rounded border text-xs" title="Tambah anak">⤵</button>
                                <button type="button" onClick={() => removeAt(path)} className="px-2 py-1 rounded border text-xs text-red-600 border-red-300" title="Hapus">✕</button>
                            </div>
                        </div>
                        {n.children?.length ? renderNodes(n.children, path, depth + 1) : null}
                    </div>
                );
            })}
            <div>
                <button type="button" onClick={() => addAtLevelEnd(prefix)} className="w-full py-2 border-2 border-dashed rounded-lg text-gray-600">
                    Tambah {depth === 0 ? "Item" : "Sub-item"}
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">Hasil Kerja</label>
            {renderNodes(tree, [], 0)}
        </div>
    );
}

/** ================== Komponen utama ================== */
export default function TugasPokokForm({ viewerPath }: { viewerPath: string; }) {
    const [resolvedId, setResolvedId] = useState<string>("");
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string; }>({storageKey: "", exists: false, value: ""});

    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | "new" | null>(null);
    const [list, setList] = useState<TugasPokok[]>([]);
    const [lastError, setLastError] = useState<string | null>(null);

    const firstRef = useRef<HTMLTextAreaElement>(null);

    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return {storageKey, exists: raw !== null, value: raw ?? ""};
        } catch {
            return {storageKey, exists: false, value: ""};
        }
    }

    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    const fetchAll = async (jabatanId: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(jabatanId)}/tugas-pokok`, { cache: "no-store" });
            if (!res.ok) {
                setList([]); setLastError(`Gagal memuat Tugas Pokok (HTTP ${res.status}).`); return;
            }
            const raw = await res.json();
            const normalized: TugasPokok[] = Array.isArray(raw)
                ? raw.map((r, i) => ({ ...normalizeFromApi(r, jabatanId), _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}` }))
                : [];
            setList(normalized.map(row => ({
                ...row,
                kebutuhan_pegawai: computeKebutuhanPegawai(row.jumlah_hasil, row.waktu_penyelesaian_jam, row.waktu_efektif),
            })));
            setTimeout(() => firstRef.current?.focus(), 0);
        } catch {
            setList([]); setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) { setLoading(false); setList([]); setLastError("__NOT_FOUND_KEY__"); return; }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => { alive = false; };
    }, [resolvedId, storageInfo.exists]);

    function computeKebutuhanPegawai(jumlah_hasil: number | null, waktu_penyelesaian_jam: number | null, waktu_efektif: number | null): number {
        const j = Number(jumlah_hasil ?? 0);
        const w = Number(waktu_penyelesaian_jam ?? 0);
        const e = Number(waktu_efektif ?? 0);
        if (!Number.isFinite(j) || !Number.isFinite(w) || !Number.isFinite(e) || e <= 0) return 0;
        return (j * w) / e;
    }

    function updateLocal(idx: number, patch: Partial<TugasPokok>) {
        setList((prev) => {
            const next = [...prev];
            const before = next[idx];
            const willTrigger =
                Object.prototype.hasOwnProperty.call(patch, "jumlah_hasil") ||
                Object.prototype.hasOwnProperty.call(patch, "waktu_penyelesaian_jam") ||
                Object.prototype.hasOwnProperty.call(patch, "waktu_efektif");
            const merged = { ...before, ...patch };
            if (willTrigger) {
                merged.kebutuhan_pegawai = computeKebutuhanPegawai(
                    merged.jumlah_hasil, merged.waktu_penyelesaian_jam, merged.waktu_efektif
                );
            }
            next[idx] = merged; return next;
        });
    }

    const totalKebutuhan = useMemo(
        () => (list ?? []).reduce((sum, r) => sum + (Number.isFinite(r.kebutuhan_pegawai as any) ? (r.kebutuhan_pegawai as number) : 0), 0),
        [list]
    );
    const pembulatan = useMemo(() => Math.ceil(totalKebutuhan), [totalKebutuhan]);

    async function saveItem(idx: number) {
        const item = list[idx];
        const clean = normalizeFromApi(item, resolvedId); // jaga supaya hasil_kerja ter-normalisasi objek
        const isEdit = typeof clean.id === "string" && clean.id.length > 0;

        const kp = computeKebutuhanPegawai(clean.jumlah_hasil, clean.waktu_penyelesaian_jam, clean.waktu_efektif);

        const payload = {
            nomor_tugas: clean.nomor_tugas,
            uraian_tugas: clean.uraian_tugas,
            hasil_kerja: clean.hasil_kerja,               // ⬅ kirim array objek; BE akan serialize ke text[]
            jumlah_hasil: clean.jumlah_hasil,
            waktu_penyelesaian_jam: clean.waktu_penyelesaian_jam,
            waktu_efektif: clean.waktu_efektif,
            kebutuhan_pegawai: kp,
            detail_uraian_tugas: (clean.detail_uraian_tugas ?? []).map((x, i) => ({
                nomor_tahapan: x.nomor_tahapan ?? i + 1,
                tahapan: x.tahapan ?? "",
                detail_tahapan: Array.isArray(x.detail_tahapan) ? x.detail_tahapan : [],
            })),
        };

        setSavingId(isEdit ? clean.id : "new");
        setLastError(null);

        try {
            if (isEdit) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok/${clean.id}`, {
                    method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || (json as any)?.error) { setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`); return; }
                const updated = normalizeFromApi((json as any).data, resolvedId);
                updated.kebutuhan_pegawai = computeKebutuhanPegawai(updated.jumlah_hasil, updated.waktu_penyelesaian_jam, updated.waktu_efektif);
                updateLocal(idx, updated);
            } else {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok`, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || (json as any)?.error) { setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`); return; }
                const created = normalizeFromApi((json as any).data, resolvedId);
                created.kebutuhan_pegawai = computeKebutuhanPegawai(created.jumlah_hasil, created.waktu_penyelesaian_jam, created.waktu_efektif);
                updateLocal(idx, created);
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Tugas Pokok berhasil disimpan." });
        } catch {
            setLastError("Terjadi kesalahan saat menyimpan.");
        } finally {
            setSavingId(null);
        }
    }

    async function deleteItem(idx: number) {
        const item = list[idx];
        const clean = normalizeFromApi(item, resolvedId);
        const hasServerId = typeof clean.id === "string" && clean.id.length > 0;

        const ok = await MySwal.fire({
            icon: "warning", title: "Hapus Tugas?", text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (hasServerId) {
                const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok/${clean.id}`, { method: "DELETE" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || (json as any)?.error) throw new Error((json as any)?.error || `HTTP ${res.status}`);
            }
            setList((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({ icon: "success", title: "Terhapus", text: "Tugas Pokok dihapus." });
        } catch (e:any) {
            await MySwal.fire({ icon: "error", title: "Gagal menghapus", text: String(e?.message ?? e) });
        }
    }

    function addNew() {
        const tmpKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setList((prev) => [
            ...prev,
            {
                id: "",
                jabatan_id: resolvedId,
                nomor_tugas: (prev[prev.length - 1]?.nomor_tugas ?? 0) + 1,
                uraian_tugas: "",
                hasil_kerja: [],                // nested kosong
                jumlah_hasil: null,
                waktu_penyelesaian_jam: null,
                waktu_efektif: null,
                kebutuhan_pegawai: 0,
                detail_uraian_tugas: [],        // ⬅ tetap ada
                _tmpKey: tmpKey,
            },
        ]);
        setTimeout(() => firstRef.current?.focus(), 0);
    }

    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    if (!storageInfo.exists || lastError === "__NOT_FOUND_KEY__") {
        return (
            <EditSectionWrapper
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/></svg>}
                title="Tugas Pokok"
                description="ID (UUID) untuk path ini belum ditemukan. Buka halaman create terlebih dahulu."
            >
                <div className="text-center py-8">
                    <p className="text-red-600 dark:text-red-400 mb-4">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={retry} className="px-4 py-2 rounded-lg border">Coba lagi</button>
                        <Link href={`/anjab/${viewerPath}`} className="px-4 py-2 rounded-lg border">Kembali</Link>
                    </div>
                </div>
            </EditSectionWrapper>
        );
    }

    if (loading) {
        return (
            <EditSectionWrapper
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/></svg>}
                title="Tugas Pokok"
                description="Memuat data tugas pokok..."
            >
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Memuat data...</p>
                </div>
            </EditSectionWrapper>
        );
    }

    return (
        <EditSectionWrapper
            icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            }
            title="Tugas Pokok"
            description="Kelola tugas pokok dan rincian pekerjaan untuk jabatan ini"
        >
            <div className="space-y-6">
                <Summary totalKebutuhan={totalKebutuhan} pembulatan={pembulatan}/>

                {list.length === 0 ? (
                    <div className="text-center py-12 px-4">
                        <h3 className="text-lg font-medium mb-2">Belum ada tugas pokok</h3>
                        <button type="button" onClick={addNew} className="px-6 py-3 bg-brand-500 text-white rounded-lg">Tambah Tugas Pokok</button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {list.map((row, idx) => {
                            const key = row.id || row._tmpKey || `row-${idx}`;
                            return (
                                <FormSection key={key} title={`Tugas Pokok ${idx + 1}`}>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <NumberInput label="Nomor" value={row.nomor_tugas} onChange={(v) => updateLocal(idx, {nomor_tugas: v})}/>
                                            <NumberInput label="Jumlah Hasil" value={row.jumlah_hasil} onChange={(v) => updateLocal(idx, {jumlah_hasil: v})}/>
                                            <NumberInput label="Waktu Penyelesaian (jam)" value={row.waktu_penyelesaian_jam} onChange={(v) => updateLocal(idx, {waktu_penyelesaian_jam: v})}/>
                                            <NumberInput label="Waktu Efektif" value={row.waktu_efektif} onChange={(v) => updateLocal(idx, {waktu_efektif: v})}/>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-2">Kebutuhan Pegawai</label>
                                            <input type="number" step="0.0001" value={row.kebutuhan_pegawai ?? 0} readOnly disabled className="w-full px-3 py-2 border rounded bg-gray-100"/>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-2">Uraian Tugas</label>
                                            <textarea
                                                ref={idx === list.length - 1 ? firstRef : undefined}
                                                value={row.uraian_tugas ?? ""}
                                                onChange={(e) => updateLocal(idx, {uraian_tugas: e.target.value})}
                                                rows={3}
                                                className="w-full px-3 py-2 border rounded"
                                            />
                                        </div>

                                        {/* ✅ Bagian Detail Uraian Tugas dipertahankan */}
                                        <DetailUraianTugasEditor
                                            value={row.detail_uraian_tugas ?? []}
                                            onChange={(v) => updateLocal(idx, {detail_uraian_tugas: v})}
                                        />

                                        {/* ✅ Hasil Kerja nested (ganti ArrayInput lama) */}
                                        <HasilKerjaEditor
                                            value={row.hasil_kerja ?? []}
                                            onChange={(v) => updateLocal(idx, {hasil_kerja: v})}
                                        />

                                        <div className="flex gap-3 pt-4">
                                            <button
                                                type="button"
                                                onClick={() => saveItem(idx)}
                                                disabled={savingId === row.id || savingId === "new"}
                                                className="px-4 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50"
                                            >
                                                {savingId === row.id || savingId === "new" ? "Menyimpan..." : "Simpan"}
                                            </button>
                                            <button type="button" onClick={() => deleteItem(idx)} className="px-4 py-2 rounded-lg border text-red-600 border-red-300">
                                                Hapus
                                            </button>
                                        </div>
                                    </div>
                                </FormSection>
                            );
                        })}

                        <button
                            type="button"
                            onClick={addNew}
                            className="w-full py-3 border-2 border-dashed rounded-lg"
                        >
                            Tambah Tugas Pokok Baru
                        </button>
                    </div>
                )}
            </div>
        </EditSectionWrapper>
    );
}

/** ================== Subcomponents kecil ================== */
function NumberInput({
                         label, value, onChange,
                     }: { label: string; value: number | null; onChange: (v: number | null) => void; }) {
    return (
        <div>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input
                type="number"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full rounded border px-3 py-2"
                inputMode="numeric"
                pattern="[0-9]*"
            />
        </div>
    );
}

function Summary({totalKebutuhan, pembulatan}: { totalKebutuhan: number; pembulatan: number }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium mb-1">Jumlah Pegawai Yang Dibutuhkan</label>
                <input type="number" value={Number.isFinite(totalKebutuhan) ? totalKebutuhan.toFixed(4) : 0} readOnly disabled className="w-full rounded border px-3 py-2 bg-gray-100"/>
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pembulatan</label>
                <input type="number" value={pembulatan} readOnly disabled className="w-full rounded border px-3 py-2 bg-gray-100"/>
            </div>
        </div>
    );
}
