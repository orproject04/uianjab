// src/app/(admin)/(others-pages)/AnjabEdit/_sections/kualifikasi.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type Kualifikasi = {
    jabatan_id: string; // alias dari API (jabatan_id AS id_jabatan), biarkan kompatibel
    pendidikan_formal: string[] | null;
    diklat_penjenjangan: string[] | null;
    diklat_teknis: string[] | null;
    diklat_fungsional: string[] | null;
    pengalaman_kerja: string[] | null;
};

/** ===== Reusable Dynamic Input List (string[]) ===== */
function ArrayInput({
                        label,
                        name,
                        defaultItems = [],
                        placeholder,
                        autoFocus = false,
                    }: {
    label: string;
    name: string;
    defaultItems?: string[];
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const [items, setItems] = useState<string[]>(defaultItems);
    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        setItems(defaultItems ?? []);
    }, [defaultItems]);

    function updateItem(i: number, v: string) {
        const next = [...items];
        next[i] = v;
        setItems(next);
    }
    function addItem(atIndex?: number) {
        const next = [...items];
        if (typeof atIndex === "number") {
            next.splice(atIndex + 1, 0, "");
            setItems(next);
            setTimeout(() => inputsRef.current[atIndex + 1]?.focus(), 0);
        } else {
            next.push("");
            setItems(next);
            setTimeout(() => inputsRef.current[next.length - 1]?.focus(), 0);
        }
    }
    function removeItem(i: number) {
        const next = items.filter((_, idx) => idx !== i);
        setItems(next);
        setTimeout(() => {
            const focusIdx = Math.max(0, i - 1);
            inputsRef.current[focusIdx]?.focus();
        }, 0);
    }
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addItem(i);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && items[i] === "") {
            e.preventDefault();
            removeItem(i);
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            const nextIndex = e.key === "ArrowUp" ? Math.max(0, i - 1) : Math.min(items.length - 1, i + 1);
            inputsRef.current[nextIndex]?.focus();
        }
    }

    return (
        <div>
            <label className="block text-sm font-medium mb-2">{label}</label>
            <div className="space-y-2">
                {items.map((v, i) => (
                    <div key={i} className="flex gap-2">
                        <input
                            ref={(el) => (inputsRef.current[i] = el)}
                            type="text"
                            name={`${name}[${i}]`}
                            value={v}
                            onChange={(e) => updateItem(i, e.target.value)}
                            onKeyDown={(e) => onKeyDown(e, i)}
                            className="flex-1 rounded border px-3 py-2"
                            placeholder={placeholder}
                            autoFocus={autoFocus && i === 0}
                        />
                        <button
                            type="button"
                            onClick={() => addItem(i)}
                            title="Tambah baris di bawah"
                            className="w-9 h-9 flex items-center justify-center rounded bg-green-500 text-white hover:bg-green-600"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            onClick={() => removeItem(i)}
                            title="Hapus baris ini"
                            className="w-9 h-9 flex items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
                        >
                            ✕
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => addItem()}
                    className="rounded px-3 py-2 bg-green-500 text-white hover:bg-green-600"
                >
                    + Tambah
                </button>
            </div>
            {/* Hidden input sebagai JSON agar mudah diparse */}
            <input type="hidden" name={name} value={JSON.stringify(items)} />
        </div>
    );
}

/** ===== Section: Kualifikasi (disamakan perilaku & struktur) ===== */
export default function KualifikasiForm({
                                            viewerPath,
                                        }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>(""); // dibaca dari localStorage
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<Kualifikasi | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const firstFocus = useRef<HTMLDivElement>(null);

    // resolve dari localStorage (key = 2 segmen terakhir viewerPath)
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    // 1) resolve sekali saat mount / viewerPath berubah
    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    // 2) fetcher tunggal (untuk retry juga)
    const fetchAll = async (idLike: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(idLike)}/kualifikasi`, { cache: "no-store" });
            if (!res.ok) {
                setData(null);
                setLastError(`Gagal memuat Kualifikasi (HTTP ${res.status}).`);
                return;
            }
            const json = (await res.json()) as Kualifikasi;
            setData(json);
            setTimeout(() => firstFocus.current?.querySelector("input")?.focus(), 0);
        } catch {
            setData(null);
            setLastError("Terjadi kesalahan saat memuat data.");
        } finally {
            setLoading(false);
        }
    };

    // 3) trigger fetch berdasarkan hasil resolve
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!storageInfo.exists) {
                setLoading(false);
                setData(null);
                setLastError("__NOT_FOUND_KEY__"); // tampilkan 2 paragraf khusus
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => {
            alive = false;
        };
    }, [resolvedId, storageInfo.exists]);

    // 4) submit (SweetAlert hanya saat sukses)
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!resolvedId) return;

        const f = e.currentTarget as any;
        const payload = {
            pendidikan_formal: JSON.parse(f.pendidikan_formal.value || "[]"),
            diklat_penjenjangan: JSON.parse(f.diklat_penjenjangan.value || "[]"),
            diklat_teknis: JSON.parse(f.diklat_teknis.value || "[]"),
            diklat_fungsional: JSON.parse(f.diklat_fungsional.value || "[]"),
            pengalaman_kerja: JSON.parse(f.pengalaman_kerja.value || "[]"),
            upsert: true,
        };

        setSaving(true);
        setLastError(null);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/kualifikasi`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || (json as any)?.error) {
                setLastError((json as any)?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                return;
            }
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Kualifikasi Jabatan berhasil disimpan." });
            // sinkron ringan
            setData((prev) =>
                prev
                    ? {
                        ...prev,
                        pendidikan_formal: payload.pendidikan_formal,
                        diklat_penjenjangan: payload.diklat_penjenjangan,
                        diklat_teknis: payload.diklat_teknis,
                        diklat_fungsional: payload.diklat_fungsional,
                        pengalaman_kerja: payload.pengalaman_kerja,
                    }
                    : prev
            );
        } catch {
            setLastError("Terjadi kesalahan saat menyimpan.");
        } finally {
            setSaving(false);
        }
    }

    // 5) retry resolve & fetch
    const retry = () => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    };

    // === UI konsisten (error text-only + tombol Coba lagi/Kembali) ===
    if (!storageInfo.exists || lastError) {
        const isMissingKey = lastError === "__NOT_FOUND_KEY__";
        return (
            <div className="p-6 space-y-3">
                {isMissingKey ? (
                    <>
                        <p className="text-red-600">ID (UUID) untuk path ini belum ditemukan di penyimpanan lokal.</p>
                        <p className="text-sm text-gray-600">
                            Buka halaman create terlebih dahulu atau pastikan item pernah dibuat sehingga ID tersimpan, lalu kembali ke
                            halaman ini.
                        </p>
                    </>
                ) : (
                    <p className="text-red-600">{lastError}</p>
                )}
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
    if (!data) {
        return (
            <div className="p-6 space-y-3">
                <p className="text-red-600">Data tidak ditemukan.</p>
                {lastError && <p className="text-sm text-gray-600">Detail: {lastError}</p>}
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

    // === Form ===
    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div ref={firstFocus}>
                <ArrayInput
                    label="Pendidikan Formal"
                    name="pendidikan_formal"
                    defaultItems={data.pendidikan_formal ?? []}
                    placeholder="Contoh: S-1 Administrasi Negara"
                    autoFocus
                />
            </div>

            <ArrayInput
                label="Diklat Penjenjangan"
                name="diklat_penjenjangan"
                defaultItems={data.diklat_penjenjangan ?? []}
                placeholder="Contoh: PIM IV / PKP"
            />

            <ArrayInput
                label="Diklat Teknis"
                name="diklat_teknis"
                defaultItems={data.diklat_teknis ?? []}
                placeholder="Contoh: Manajemen Proyek Pemerintahan"
            />

            <ArrayInput
                label="Diklat Fungsional"
                name="diklat_fungsional"
                defaultItems={data.diklat_fungsional ?? []}
                placeholder="Contoh: Fungsional Analis Kebijakan"
            />

            <ArrayInput
                label="Pengalaman Kerja"
                name="pengalaman_kerja"
                defaultItems={data.pengalaman_kerja ?? []}
                placeholder="Contoh: Analis kebijakan 2 tahun di ..."
            />

            <div className="pt-2 flex items-center gap-3">
                <button type="submit" disabled={saving} className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60">
                    {saving ? "Menyimpan..." : "Simpan"}
                </button>
                <Link href={`/anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Batal
                </Link>
            </div>
        </form>
    );
}
