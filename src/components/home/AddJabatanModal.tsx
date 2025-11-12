"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useRouter } from "next/navigation";

type APIRow = {
  id: string;
  parent_id: string | null;
  nama_jabatan: string;
  slug: string;
  unit_kerja: string | null;
  level: number;
  order_index: number;
  is_pusat?: boolean;
  jenis_jabatan?: string | null;
  bezetting?: number;
  kebutuhan_pegawai?: number;
};

type ParentOption = {
  id: string | "";
  label: string;
  level: number;
};

interface AddJabatanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddJabatanModal({ isOpen, onClose }: AddJabatanModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);

  // Form fields
  const [namaJabatan, setNamaJabatan] = useState("Penata Kelola Sistem dan Teknologi Informasi");
  const [slug, setSlug] = useState("pksti");
  const [parentId, setParentId] = useState<string | "">("");
  const [unitKerja, setUnitKerja] = useState("");
  const [orderIndex, setOrderIndex] = useState("");
  const [isPusat, setIsPusat] = useState("true");
  const [jenisJabatan, setJenisJabatan] = useState("JABATAN PELAKSANA");
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  // Auto-generate slug from nama jabatan
  const toSlug = (s: string) => {
    if (!s) return "unit";
    const caps = (s.match(/[A-Z]/g) || []).join("").toLowerCase();
    if (caps) return caps;
    const lettersOnly = s.toLowerCase().replace(/[^a-z]/g, "");
    return lettersOnly || "unit";
  };

  useEffect(() => {
    if (!slugTouched && namaJabatan) {
      setSlug(toSlug(namaJabatan));
    }
  }, [namaJabatan, slugTouched]);

  // Load parent options
  useEffect(() => {
    if (!isOpen) return;

    const loadParents = async () => {
      setLoadingParents(true);
      try {
        const res = await apiFetch("/api/peta-jabatan");
        if (!res.ok) throw new Error("Gagal memuat data jabatan");
        const data: APIRow[] = await res.json();

        // Build hierarchical options
        const buildOptions = (rows: APIRow[]): ParentOption[] => {
          const byParent = new Map<string | null, APIRow[]>();
          rows.forEach((r) => {
            const arr = byParent.get(r.parent_id) || [];
            arr.push(r);
            byParent.set(r.parent_id, arr);
          });

          // Sort each group
          for (const [, arr] of byParent.entries()) {
            arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
          }

          const options: ParentOption[] = [{ id: "", label: "-", level: 0 }];

          const traverse = (parentId: string | null, level: number) => {
            const children = byParent.get(parentId) || [];
            children.forEach((child) => {
              const indent = "  ".repeat(level);
              const unitLabel = child.unit_kerja ? ` (${child.unit_kerja})` : "";
              const jenisLabel = child.jenis_jabatan ? ` - ${child.jenis_jabatan}` : "";
              options.push({
                id: child.id,
                label: `${indent}${child.nama_jabatan}${unitLabel}${jenisLabel}`,
                level,
              });
              traverse(child.id, level + 1);
            });
          };

          traverse(null, 0);
          return options;
        };

        const opts = buildOptions(data);
        setParentOptions(opts);
      } catch (err: any) {
        console.error("Error loading parents:", err);
        setError(err.message || "Gagal memuat data jabatan");
      } finally {
        setLoadingParents(false);
      }
    };

    loadParents();
  }, [isOpen]);

  // Auto-suggest jenis jabatan based on parent
  useEffect(() => {
    if (!parentId || !isOpen) return;

    const suggestJenisJabatan = async () => {
      try {
        const res = await apiFetch("/api/peta-jabatan");
        if (!res.ok) return;
        const data: APIRow[] = await res.json();

        const parent = data.find(r => r.id === parentId);
        if (!parent || !parent.jenis_jabatan) return;

        // Suggest child jenis based on parent jenis
        const parentJenis = parent.jenis_jabatan.toUpperCase();
        let suggestedJenis = "JABATAN PELAKSANA";

        if (parentJenis === "ESELON I") suggestedJenis = "ESELON II";
        else if (parentJenis === "ESELON II") suggestedJenis = "ESELON III";
        else if (parentJenis === "ESELON III") suggestedJenis = "ESELON IV";
        else if (parentJenis === "ESELON IV") suggestedJenis = "JABATAN PELAKSANA";

        setJenisJabatan(suggestedJenis);
      } catch (err) {
        console.error("Error suggesting jenis:", err);
      }
    };

    suggestJenisJabatan();
  }, [parentId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!namaJabatan.trim()) {
      setError("Nama jabatan wajib diisi");
      return;
    }

    if (!slug.trim()) {
      setError("Kode penamaan jabatan wajib diisi");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        nama_jabatan: namaJabatan.trim(),
        slug: slug.trim(),
        parent_id: parentId || null,
        unit_kerja: unitKerja.trim() || null,
        order_index: orderIndex ? parseInt(orderIndex, 10) : 0,
        is_pusat: isPusat === "true",
        jenis_jabatan: jenisJabatan.trim() || null,
      };

      const res = await apiFetch("/api/peta-jabatan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Error ${res.status}`);
      }

      const created = await res.json();

      // Close modal
      onClose();

      // Trigger sidebar refresh by dispatching custom event
      window.dispatchEvent(new CustomEvent('anjab-tree-updated'));

      // Navigate to the new jabatan using the full path
      const fullPath = created.path || created.node?.slug || 'undefined';
      router.push(`/anjab/${fullPath}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Gagal menambah jabatan");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      // Reset form
      setNamaJabatan("Penata Kelola Sistem dan Teknologi Informasi");
      setSlug("pksti");
      setParentId("");
      setUnitKerja("");
      setOrderIndex("");
      setIsPusat("true");
      setJenisJabatan("JABATAN PELAKSANA");
      setError(null);
      setSlugTouched(false);
    }
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Tambah Jabatan Baru</h2>
            <button
                onClick={handleClose}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Nama Jabatan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Jabatan <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={namaJabatan}
                    onChange={(e) => setNamaJabatan(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Contoh: Penata Kelola Sistem dan Teknologi Informasi"
                    disabled={loading}
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kode Penamaan Jabatan <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="pksti"
                    disabled={loading}
                />
              </div>

              {/* Parent Jabatan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Atasan Langsung
                </label>
                {loadingParents ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Memuat data jabatan...
                    </div>
                ) : (
                    <select
                        value={parentId}
                        onChange={(e) => setParentId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={loading || loadingParents}
                    >
                      {parentOptions.map((opt) => (
                          <option key={opt.id || "root"} value={opt.id}>
                            {opt.label}
                          </option>
                      ))}
                    </select>
                )}
              </div>

              {/* Grid 2 columns for smaller fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Unit Kerja */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Kerja
                  </label>
                  <input
                      type="text"
                      value={unitKerja}
                      onChange={(e) => setUnitKerja(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Contoh: Bagian TIK"
                      disabled={loading}
                  />
                </div>

                {/* Order Index */}
                {/*<div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Urutan
                </label>
                <input
                  type="number"
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="0"
                  disabled={loading}
                />
              </div>*/}

                {/* Lokasi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lokasi
                  </label>
                  <select
                      value={isPusat}
                      onChange={(e) => setIsPusat(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={loading}
                  >
                    <option value="true">Pusat</option>
                    <option value="false">Daerah</option>
                  </select>
                </div>

                {/* Jenis Jabatan */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jenis Jabatan <span className="text-red-500">*</span>
                  </label>
                  <select
                      value={jenisJabatan}
                      onChange={(e) => setJenisJabatan(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={loading}
                  >
                    <option value="ESELON I">Eselon I</option>
                    <option value="ESELON II">Eselon II</option>
                    <option value="ESELON III">Eselon III</option>
                    <option value="ESELON IV">Eselon IV</option>
                    <option value="JABATAN FUNGSIONAL">Jabatan Fungsional</option>
                    <option value="JABATAN PELAKSANA">Jabatan Pelaksana</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
            )}
          </form>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Batal
            </button>
            <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading || loadingParents}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>
  );
}