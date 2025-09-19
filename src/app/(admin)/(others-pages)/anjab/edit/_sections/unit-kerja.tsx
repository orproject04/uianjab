"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { apiFetch } from "@/lib/apiFetch";

const MySwal = withReactContent(Swal);

type UnitKerja = {
    jabatan_id: string; // alias dari API (jabatan_id AS id_jabatan)
    jpt_utama: string;
    jpt_madya: string;
    jpt_pratama: string;
    administrator: string;
    pengawas: string;
    pelaksana: string;
    jabatan_fungsional: string;
};

export default function UnitKerjaForm({
                                          viewerPath,   // dipakai untuk link Kembali
                                      }: {
    viewerPath: string;
}) {
    const [resolvedId, setResolvedId] = useState<string>(""); // UUID/string dari localStorage
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<UnitKerja | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [storageInfo, setStorageInfo] = useState<{ storageKey: string; exists: boolean; value: string }>({
        storageKey: "",
        exists: false,
        value: "",
    });

    const firstRef = useRef<HTMLInputElement>(null);

    // --- util: resolve dari localStorage (tanpa fallback ke prop lain)
    function resolveFromStorage(vpath: string) {
        const storageKey = vpath.split("/").filter(Boolean).slice(-2).join("/");
        try {
            const raw = localStorage.getItem(storageKey);
            return { storageKey, exists: raw !== null, value: raw ?? "" };
        } catch {
            return { storageKey, exists: false, value: "" };
        }
    }

    // 1) resolve sekali dari storage saat mount / viewerPath berubah
    useEffect(() => {
        const info = resolveFromStorage(viewerPath);
        setStorageInfo(info);
        setResolvedId(info.value);
        setLastError(null);
    }, [viewerPath]);

    // 2) fetcher tunggal (untuk retry juga)
    const fetchAll = async (uuidLike: string) => {
        setLastError(null);
        setLoading(true);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(uuidLike)}/unit-kerja`, { cache: "no-store" });
            if (!res.ok) {
                setData(null);
                setLastError(`Gagal memuat Unit Kerja (HTTP ${res.status}).`);
                return;
            }
            const json = (await res.json()) as UnitKerja;
            setData(json);
            setTimeout(() => firstRef.current?.focus(), 0);
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
                setLastError("__NOT_FOUND_KEY__"); // tampilkan 2 paragraf khusus (seperti Jabatan)
                return;
            }
            if (!alive) return;
            await fetchAll(resolvedId);
        })();
        return () => {
            alive = false;
        };
    }, [resolvedId, storageInfo.exists]);

    // 4) simpan (SweetAlert hanya untuk sukses)
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!data || !resolvedId) return;

        const f = e.currentTarget as any;
        const payload = {
            jpt_utama: String(f.jpt_utama.value || "").trim(),
            jpt_madya: String(f.jpt_madya.value || "").trim(),
            jpt_pratama: String(f.jpt_pratama.value || "").trim(),
            administrator: String(f.administrator.value || "").trim(),
            pengawas: String(f.pengawas.value || "").trim(),
            pelaksana: String(f.pelaksana.value || "").trim(),
            jabatan_fungsional: String(f.jabatan_fungsional.value || "").trim(),
            upsert: true,
        };

        setSaving(true);
        setLastError(null);
        try {
            const res = await apiFetch(`/api/anjab/${encodeURIComponent(resolvedId)}/unit-kerja`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.error) {
                setLastError(json?.error || `Gagal menyimpan (HTTP ${res.status}).`);
                return;
            }

            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Unit Kerja berhasil disimpan." });
            // sinkron ringan
            setData((prev) => (prev ? { ...prev, ...payload } : prev));
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
            <div>
                <label className="block text-sm font-medium mb-1">JPT Utama</label>
                <input
                    type="text"
                    ref={firstRef}
                    name="jpt_utama"
                    defaultValue={data.jpt_utama ?? ""}
                    className="w-full rounded border px-3 py-2"
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">JPT Madya</label>
                <input type="text" name="jpt_madya" defaultValue={data.jpt_madya ?? ""} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">JPT Pratama</label>
                <input type="text" name="jpt_pratama" defaultValue={data.jpt_pratama ?? ""} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Administrator</label>
                <input type="text" name="administrator" defaultValue={data.administrator ?? ""} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pengawas</label>
                <input type="text" name="pengawas" defaultValue={data.pengawas ?? ""} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Pelaksana</label>
                <input type="text" name="pelaksana" defaultValue={data.pelaksana ?? ""} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Jabatan Fungsional</label>
                <input
                    type="text"
                    name="jabatan_fungsional"
                    defaultValue={data.jabatan_fungsional ?? ""}
                    className="w-full rounded border px-3 py-2"
                />
            </div>

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
