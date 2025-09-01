// src/app/(admin)/(others-pages)/AnjabEdit/_sections/kualifikasi.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Link from "next/link";

const MySwal = withReactContent(Swal);

type Kualifikasi = {
    id_kualifikasi?: number;
    id_jabatan: string;
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

    // sinkronkan saat defaultItems berubah (mis. setelah fetch)
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
        // Enter → tambah baris baru (kecuali Shift+Enter)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addItem(i);
        }
        // Ctrl/Cmd+Backspace pada input kosong → hapus baris
        if ((e.ctrlKey || e.metaKey) && e.key === "Backspace" && items[i] === "") {
            e.preventDefault();
            removeItem(i);
        }
        // Ctrl/Cmd+ArrowUp/Down → fokus pindah
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

                {/* tombol tambah baris saat list kosong / tambah di akhir */}
                <button
                    type="button"
                    onClick={() => addItem()}
                    className="rounded px-3 py-2 bg-green-500 text-white hover:bg-green-600"
                >
                    + Tambah
                </button>
            </div>

            {/* Hidden input → kirim sebagai JSON agar mudah diparse di onSubmit */}
            <input type="hidden" name={name} value={JSON.stringify(items)} />
        </div>
    );
}

/** ===== Page Section: Kualifikasi ===== */
export default function KualifikasiForm({
                                            id,
                                            viewerPath,
                                        }: {
    id: string;
    viewerPath: string;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<Kualifikasi | null>(null);
    const firstFocus = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/kualifikasi`, { cache: "no-store" });
                if (!alive) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setData(json);
                setTimeout(() => firstFocus.current?.querySelector("input")?.focus(), 0);
            } catch (e) {
                await MySwal.fire({ icon: "error", title: "Gagal memuat", text: "Tidak bisa memuat Kualifikasi Jabatan." });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [id]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = e.currentTarget as any;

        // Ambil dari hidden JSON masing-masing field
        const payload = {
            pendidikan_formal: JSON.parse(f.pendidikan_formal.value || "[]"),
            diklat_penjenjangan: JSON.parse(f.diklat_penjenjangan.value || "[]"),
            diklat_teknis: JSON.parse(f.diklat_teknis.value || "[]"),
            diklat_fungsional: JSON.parse(f.diklat_fungsional.value || "[]"),
            pengalaman_kerja: JSON.parse(f.pengalaman_kerja.value || "[]"),
            upsert: true,
        };

        setSaving(true);
        try {
            const res = await fetch(`/api/anjab/${encodeURIComponent(id)}/kualifikasi`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json.data ?? data);
            await MySwal.fire({ icon: "success", title: "Tersimpan", text: "Kualifikasi Jabatan berhasil disimpan." });
        } catch (e) {
            await MySwal.fire({ icon: "error", title: "Gagal menyimpan", text: String(e) });
        } finally {
            setSaving(false);
        }
    }

    if (!id) {
        return (
            <div className="p-6 text-center">
                <p>Slug tidak valid.</p>
                <Link href="/Anjab" className="text-blue-600 underline">Kembali</Link>
            </div>
        );
    }
    if (loading) return <div className="p-6">Memuat…</div>;
    if (!data) return <div className="p-6 text-red-600">Data tidak ditemukan.</div>;

    return (
        <form onSubmit={onSubmit} className="space-y-6 max-w-3xl mx-auto">
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
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60"
                >
                    {saving ? "Menyimpan..." : "Simpan"}
                </button>
                <Link href={`/Anjab/${viewerPath}`} className="rounded border px-4 py-2">
                    Batal
                </Link>
            </div>
        </form>
    );
}
