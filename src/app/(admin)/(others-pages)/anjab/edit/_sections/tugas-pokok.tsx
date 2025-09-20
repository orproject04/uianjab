"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import {apiFetch} from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

/** ====== Types (nested) ====== */
type TahapanDetail = {
    nomor_tahapan: number | null;
    tahapan: string;
    detail_tahapan: string[];
};

type TugasPokok = {
    id: string; // stringified INT id dari DB; "" untuk baris baru
    jabatan_id: string; // UUID
    nomor_tugas: number | null;
    uraian_tugas: string;
    hasil_kerja: string[];
    jumlah_hasil: number | null;
    waktu_penyelesaian_jam: number | null;
    waktu_efektif: number | null;
    kebutuhan_pegawai: number | null; // readonly, auto-computed
    detail_uraian_tugas: TahapanDetail[];
    _tmpKey?: string;
};

/** ---- Normalizer dari API ---- */
function normalizeFromApi(raw: any, fallbackJabatanId: string): TugasPokok {
    const asString = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const toNum = (v: any) => (v == null || v === "" ? null : Number(v));
    const asTahapanDetail = (arr: any): TahapanDetail[] =>
        Array.isArray(arr)
            ? arr.map((x: any, i: number): TahapanDetail => ({
                nomor_tahapan:
                    x?.nomor_tahapan == null || x.nomor_tahapan === ""
                        ? i + 1
                        : Number(x.nomor_tahapan),
                tahapan: typeof x?.tahapan === "string" ? x.tahapan : "",
                detail_tahapan: Array.isArray(x?.detail_tahapan) ? x.detail_tahapan : [],
            }))
            : [];

    return {
        id: raw?.id ? asString(raw.id) : "",
        jabatan_id: raw?.jabatan_id ? asString(raw.jabatan_id) : fallbackJabatanId,
        nomor_tugas: toNum(raw?.nomor_tugas),
        uraian_tugas: typeof raw?.uraian_tugas === "string" ? raw.uraian_tugas : "",
        hasil_kerja: Array.isArray(raw?.hasil_kerja) ? raw.hasil_kerja : [],
        jumlah_hasil: toNum(raw?.jumlah_hasil),
        waktu_penyelesaian_jam: toNum(raw?.waktu_penyelesaian_jam),
        waktu_efektif: toNum(raw?.waktu_efektif),
        kebutuhan_pegawai: raw?.kebutuhan_pegawai == null ? null : Number(raw.kebutuhan_pegawai),
        detail_uraian_tugas: asTahapanDetail(raw?.detail_uraian_tugas),
    };
}

/** Reusable ArrayInput (string[]) */
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
    const [items, setItems] = useState<string[]>(value ?? []);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        setItems(value ?? []);
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

    function add(after?: number) {
        const next = [...items];
        if (typeof after === "number") next.splice(after + 1, 0, "");
        else next.push("");
        setAndEmit(next);
        setTimeout(() => {
            const idx = typeof after === "number" ? after + 1 : next.length - 1;
            refs.current[idx]?.focus();
        }, 0);
    }

    function remove(i: number) {
        const next = items.filter((_, idx) => idx !== i);
        setAndEmit(next);
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">{label}</label>
            {items.map((v, i) => (
                <div key={i} className="flex gap-2">
                    <input
                        ref={(el) => (refs.current[i] = el)}
                        type="text"
                        value={v}
                        onChange={(e) => update(i, e.target.value)}
                        className="flex-1 rounded border px-3 py-2"
                        placeholder={placeholder}
                        autoFocus={autoFocus && i === 0}
                    />
                    <button
                        type="button"
                        onClick={() => add(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-green-500 text-white hover:bg-green-600"
                        title="Tambah baris di bawah"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onClick={() => remove(i)}
                        className="w-9 h-9 flex items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                        title="Hapus baris ini"
                    >
                        ✕
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => add()}
                className="rounded px-3 py-2 bg-green-500 text-white hover:bg-green-600"
            >
                + Tambah
            </button>
        </div>
    );
}

/** Editor nested: detail_uraian_tugas[]  */
function DetailUraianTugasEditor({
                                     value,
                                     onChange,
                                 }: {
    value: TahapanDetail[];
    onChange: (v: TahapanDetail[]) => void;
}) {
    const [items, setItems] = useState<TahapanDetail[]>(value ?? []);

    useEffect(() => {
        setItems(value ?? []);
    }, [value]);

    function setAndEmit(next: TahapanDetail[]) {
        setItems(next);
        onChange(next);
    }

    function renumber(arr: TahapanDetail[]) {
        return arr.map((x, i) => ({...x, nomor_tahapan: i + 1}));
    }

    function addNew() {
        const next = renumber([
            ...items,
            {nomor_tahapan: items.length + 1, tahapan: "", detail_tahapan: []},
        ]);
        setAndEmit(next);
    }

    function remove(i: number) {
        const next = renumber(items.filter((_, idx) => idx !== i));
        setAndEmit(next);
    }

    function update(i: number, patch: Partial<TahapanDetail>) {
        const next = [...items];
        next[i] = {...next[i], ...patch};
        setAndEmit(next);
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium">
                    Detail Uraian Tugas (Tahapan &amp; Rincian)
                </label>
                <button
                    type="button"
                    onClick={addNew}
                    className="rounded px-3 py-1 bg-green-600 text-white hover:bg-green-700"
                >
                    + Tambah Tahapan
                </button>
            </div>

            {items.map((it, i) => (
                <div key={i} className="rounded border p-3 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                        <div>
                            <label className="block text-xs mb-1">Nomor Tahapan</label>
                            <input
                                type="number"
                                value={it.nomor_tahapan ?? i + 1}
                                onChange={(e) =>
                                    update(i, {
                                        nomor_tahapan:
                                            e.target.value === "" ? null : Number(e.target.value),
                                    })
                                }
                                className="w-full rounded border px-2 py-1"
                                inputMode="numeric"
                                pattern="[0-9]*"
                            />
                        </div>
                        <div className="md:col-span-5">
                            <label className="block text-xs mb-1">Judul Tahapan</label>
                            <input
                                type="text"
                                value={it.tahapan}
                                onChange={(e) => update(i, {tahapan: e.target.value})}
                                className="w-full rounded border px-2 py-1"
                                placeholder="Contoh: Mengidentifikasi kebutuhan anggaran …"
                            />
                        </div>
                    </div>

                    <ArrayInput
                        label="Detail Tahapan"
                        value={it.detail_tahapan ?? []}
                        onChange={(arr) => update(i, {detail_tahapan: arr})}
                        placeholder="Contoh: Mengidentifikasi & mempelajari peraturan …"
                    />

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            className="rounded px-3 py-1 bg-red-50 hover:bg-red-100 border"
                        >
                            Hapus Tahapan
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function TugasPokokForm({
                                           viewerPath,
                                       }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>("");
    const [storageInfo, setStorageInfo] = useState<{
        storageKey: string;
        exists: boolean;
        value: string;
    }>({storageKey: "", exists: false, value: ""});

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
            const res = await apiFetch(
                `/api/anjab/${encodeURIComponent(jabatanId)}/tugas-pokok`,
                {cache: "no-store"}
            );
            if (!res.ok) {
                setList([]);
                setLastError(`Gagal memuat Tugas Pokok (HTTP ${res.status}).`);
                return;
            }
            const raw = await res.json();
            const normalized: TugasPokok[] = Array.isArray(raw)
                ? raw.map((r, i) => ({
                    ...normalizeFromApi(r, jabatanId),
                    _tmpKey: `srv-${i}-${r?.id ?? Math.random().toString(36).slice(2)}`,
                }))
                : [];
            setList(
                normalized.map((row) => ({
                    ...row,
                    kebutuhan_pegawai: computeKebutuhanPegawai(
                        row.jumlah_hasil,
                        row.waktu_penyelesaian_jam,
                        row.waktu_efektif
                    ),
                }))
            );
            setTimeout(() => firstRef.current?.focus(), 0);
        } catch {
            setList([]);
            setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                setLoading(false);
                setList([]);
                setLastError("__NOT_FOUND_KEY__");
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => {
            alive = false;
        };
    }, [resolvedId, storageInfo.exists]);

    function computeKebutuhanPegawai(
        jumlah_hasil: number | null,
        waktu_penyelesaian_jam: number | null,
        waktu_efektif: number | null
    ): number {
        const j = Number(jumlah_hasil ?? 0);
        const w = Number(waktu_penyelesaian_jam ?? 0);
        const e = Number(waktu_efektif ?? 0);
        if (!Number.isFinite(j) || !Number.isFinite(w) || !Number.isFinite(e) || e <= 0)
            return 0;
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

            const merged = {...before, ...patch};

            if (willTrigger) {
                merged.kebutuhan_pegawai = computeKebutuhanPegawai(
                    merged.jumlah_hasil,
                    merged.waktu_penyelesaian_jam,
                    merged.waktu_efektif
                );
            }

            next[idx] = merged;
            return next;
        });
    }

    const totalKebutuhan = useMemo(
        () =>
            (list ?? []).reduce((sum, r) => {
                const v =
                    typeof r.kebutuhan_pegawai === "number" && Number.isFinite(r.kebutuhan_pegawai)
                        ? r.kebutuhan_pegawai
                        : 0;
                return sum + v;
            }, 0),
        [list]
    );
    const pembulatan = useMemo(() => Math.ceil(totalKebutuhan), [totalKebutuhan]);

    async function saveItem(idx: number) {
        const item = list[idx];
        const clean = normalizeFromApi(item, resolvedId);
        const isEdit = typeof clean.id === "string" && clean.id.length > 0;

        const kp = computeKebutuhanPegawai(
            clean.jumlah_hasil,
            clean.waktu_penyelesaian_jam,
            clean.waktu_efektif
        );

        const payload = {
            nomor_tugas: clean.nomor_tugas,
            uraian_tugas: clean.uraian_tugas,
            hasil_kerja: clean.hasil_kerja,
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
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok/${clean.id}`,
                    {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(payload),
                    }
                );
                const json = await res.json();
                if (!res.ok || (json as any)?.error) {
                    setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                    return;
                }
                const updated = normalizeFromApi((json as any).data, resolvedId);
                updated.kebutuhan_pegawai = computeKebutuhanPegawai(
                    updated.jumlah_hasil,
                    updated.waktu_penyelesaian_jam,
                    updated.waktu_efektif
                );
                updateLocal(idx, updated);
            } else {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok`,
                    {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(payload),
                    }
                );
                const json = await res.json();
                if (!res.ok || (json as any)?.error) {
                    setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                    return;
                }
                const created = normalizeFromApi((json as any).data, resolvedId);
                created.kebutuhan_pegawai = computeKebutuhanPegawai(
                    created.jumlah_hasil,
                    created.waktu_penyelesaian_jam,
                    created.waktu_efektif
                );
                updateLocal(idx, created);
            }

            await MySwal.fire({
                icon: "success",
                title: "Tersimpan",
                text: "Tugas Pokok berhasil disimpan.",
            });
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
            icon: "warning",
            title: "Hapus Tugas?",
            text: "Tindakan ini tidak dapat dibatalkan.",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
        });
        if (!ok.isConfirmed) return;

        try {
            if (hasServerId) {
                const res = await apiFetch(
                    `/api/anjab/${encodeURIComponent(resolvedId)}/tugas-pokok/${clean.id}`,
                    {method: "DELETE"}
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || (json as any)?.error)
                    throw new Error((json as any)?.error || `HTTP ${res.status}`);
            }
            setList((prev) => prev.filter((_, i) => i !== idx));
            await MySwal.fire({
                icon: "success",
                title: "Terhapus",
                text: "Tugas Pokok dihapus.",
            });
        } catch (e) {
            await MySwal.fire({
                icon: "error",
                title: "Gagal menghapus",
                text: String(e),
            });
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
                hasil_kerja: [],
                jumlah_hasil: null,
                waktu_penyelesaian_jam: null,
                waktu_efektif: null,
                kebutuhan_pegawai: 0,
                detail_uraian_tugas: [],
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
            <div className="p-6 space-y-3">
                <p className="text-red-600">
                    ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.
                </p>
                <p className="text-sm text-gray-600">
                    Buka halaman create terlebih dahulu atau pastikan item pernah dibuat
                    sehingga ID tersimpan, lalu kembali ke halaman ini.
                </p>
                <div className="flex items-center gap-3">
                    <button className="rounded border px-3 py-1.5" onClick={retry}>
                        Coba lagi
                    </button>
                    <Link href={`/anjab/${viewerPath}`} className="rounded border px-3 py-1.5">
                        Kembali
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-6">Memuat…</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between">
                <button
                    type="button"
                    onClick={addNew}
                    className="rounded px-4 py-2 bg-green-600 text-white hover:bg-green-700"
                >
                    + Tambah Tugas
                </button>
                <Link href={`/anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Kembali
                </Link>
            </div>

            <Summary totalKebutuhan={totalKebutuhan} pembulatan={pembulatan}/>

            {list.length === 0 && (
                <p className="text-gray-600">
                    Belum ada Tugas Pokok. Klik “+ Tambah Tugas”.
                </p>
            )}

            {list.map((row, idx) => {
                const key = row.id || row._tmpKey || `row-${idx}`;
                return (
                    <div key={key} className="rounded border p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <NumberInput
                                label="Nomor"
                                value={row.nomor_tugas}
                                onChange={(v) => updateLocal(idx, {nomor_tugas: v})}
                            />
                            <NumberInput
                                label="Jumlah Hasil"
                                value={row.jumlah_hasil}
                                onChange={(v) => updateLocal(idx, {jumlah_hasil: v})}
                            />
                            <NumberInput
                                label="Waktu Penyelesaian (jam)"
                                value={row.waktu_penyelesaian_jam}
                                onChange={(v) => updateLocal(idx, {waktu_penyelesaian_jam: v})}
                            />
                            <NumberInput
                                label="Waktu Efektif"
                                value={row.waktu_efektif}
                                onChange={(v) => updateLocal(idx, {waktu_efektif: v})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Kebutuhan Pegawai
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={row.kebutuhan_pegawai ?? 0}
                                readOnly
                                disabled
                                className="w-full rounded border px-3 py-2 bg-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Uraian Tugas</label>
                            <textarea
                                ref={idx === list.length - 1 ? firstRef : undefined}
                                value={row.uraian_tugas ?? ""}
                                onChange={(e) => updateLocal(idx, {uraian_tugas: e.target.value})}
                                rows={3}
                                className="w-full rounded border px-3 py-2"
                            />
                        </div>

                        <DetailUraianTugasEditor
                            value={row.detail_uraian_tugas ?? []}
                            onChange={(v) => updateLocal(idx, {detail_uraian_tugas: v})}
                        />

                        <ArrayInput
                            label="Hasil Kerja"
                            value={row.hasil_kerja ?? []}
                            onChange={(v) => updateLocal(idx, {hasil_kerja: v})}
                            placeholder="Contoh: Dokumen laporan …"
                        />

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => saveItem(idx)}
                                disabled={savingId === row.id || savingId === "new"}
                                className="rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {savingId === row.id ? "Menyimpan…" : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => deleteItem(idx)}
                                className="rounded px-4 py-2 border bg-red-50 hover:bg-red-100"
                            >
                                Hapus
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** ====== Small subcomponents ====== */
function NumberInput({
                         label,
                         value,
                         onChange,
                     }: {
    label: string;
    value: number | null;
    onChange: (v: number | null) => void;
}) {
    return (
        <div>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input
                type="number"
                value={value ?? ""} // bisa kosong
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
                <label className="block text-sm font-medium mb-1">
                    Jumlah Pegawai Yang Dibutuhkan
                </label>
                <input
                    type="number"
                    value={Number.isFinite(totalKebutuhan) ? totalKebutuhan.toFixed(4) : 0}
                    readOnly
                    disabled
                    className="w-full rounded border px-3 py-2 bg-gray-100"
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pembulatan</label>
                <input
                    type="number"
                    value={pembulatan}
                    readOnly
                    disabled
                    className="w-full rounded border px-3 py-2 bg-gray-100"
                />
            </div>
        </div>
    );
}
