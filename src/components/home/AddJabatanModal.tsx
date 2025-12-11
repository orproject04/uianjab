"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/form/CustomSelect";
import Swal from "sweetalert2";

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
  const [namaJabatan, setNamaJabatan] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<string | "">("");
  const [unitKerja, setUnitKerja] = useState("");
  const [orderIndex, setOrderIndex] = useState("");
  const [isPusat, setIsPusat] = useState("true");
  const [jenisJabatan, setJenisJabatan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  
  // Anjab matching states
  const [matchedAnjab, setMatchedAnjab] = useState<{
    jabatan_id: string;
    nama_jabatan: string;
    similarity: number;
    confidence: string;
  } | null>(null);
  const [matchingSuggestions, setMatchingSuggestions] = useState<Array<{
    id: string;
    nama_jabatan: string;
    similarity: number;
  }>>([]);
  const [checkingMatch, setCheckingMatch] = useState(false);
  const [selectedAnjabId, setSelectedAnjabId] = useState<string | null>(null);

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
        }
    };

    suggestJenisJabatan();
  }, [parentId, isOpen]);

  // Check anjab matching
  const checkAnjabMatch = useCallback(async (namaJabatan: string) => {
    if (!namaJabatan.trim() || namaJabatan.length < 3) {
      setMatchedAnjab(null);
      setMatchingSuggestions([]);
      return;
    }

    setCheckingMatch(true);
    try {
      const res = await apiFetch(
        `/api/anjab/match?nama_jabatan=${encodeURIComponent(namaJabatan.trim())}`,
        { cache: "no-store" }
      );
      
      if (!res.ok) {
        setMatchedAnjab(null);
        setMatchingSuggestions([]);
        return;
      }

      const data = await res.json();
      
      if (data.match) {
        setMatchedAnjab(data.match);
        setMatchingSuggestions(data.alternatives || []);
      } else {
        setMatchedAnjab(null);
        setMatchingSuggestions(data.suggestions || []);
      }
    } catch (e) {
      setMatchedAnjab(null);
      setMatchingSuggestions([]);
    } finally {
      setCheckingMatch(false);
    }
  }, []);

  // Debounce anjab matching
  useEffect(() => {
    if (!isOpen || !namaJabatan) return;
    
    const timer = setTimeout(() => {
      checkAnjabMatch(namaJabatan);
    }, 500);

    return () => clearTimeout(timer);
  }, [namaJabatan, isOpen, checkAnjabMatch]);

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
      
      // Add jabatan_id if matched
      if (selectedAnjabId) {
        payload.jabatan_id = selectedAnjabId;
      } else if (matchedAnjab) {
        payload.jabatan_id = matchedAnjab.jabatan_id;
      }

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

      // Determine anjab name used
      let usedAnjabName = null;
      if (selectedAnjabId) {
        const selected = matchingSuggestions.find(s => s.id === selectedAnjabId);
        usedAnjabName = selected?.nama_jabatan;
      } else if (created?.matched_anjab) {
        usedAnjabName = created.matched_anjab.nama_anjab;
      }
      
      // Show success message
      if (usedAnjabName) {
        await Swal.fire({
          icon: "success", 
          title: "Jabatan berhasil ditambah", 
          html: `<div class="text-sm">
            <p class="mb-2">Jabatan <b>${namaJabatan}</b> berhasil ditambahkan.</p>
            <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 mt-2">
              <div class="font-medium">✓ Anjab ${selectedAnjabId ? 'yang dipilih' : 'terdeteksi'}:</div>
              <div class="mt-1">${usedAnjabName}</div>
            </div>
          </div>`,
          timer: 3000, 
          showConfirmButton: false
        });
      } else {
        await Swal.fire({
          icon: "success", 
          title: "Jabatan berhasil ditambah", 
          timer: 1500, 
          showConfirmButton: false
        });
      }

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
      setNamaJabatan("");
      setSlug("");
      setParentId("");
      setUnitKerja("");
      setOrderIndex("");
      setIsPusat("true");
      setJenisJabatan("");
      setError(null);
      setSlugTouched(false);
      setMatchedAnjab(null);
      setMatchingSuggestions([]);
      setSelectedAnjabId(null);
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
                    autoFocus
                />
              </div>

              {/* Anjab Match Indicator */}
              {checkingMatch && (
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Mencari anjab yang cocok...
                </div>
              )}

              {!checkingMatch && matchedAnjab && (
                <div className={`text-xs border rounded-lg px-3 py-2 ${
                  matchedAnjab.confidence === 'high' 
                    ? 'bg-green-50 border-green-200 text-green-700' 
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <div className="flex-1">
                      <div className="font-medium">
                        {matchedAnjab.confidence === 'high' ? '✓ Anjab cocok ditemukan!' : 'Anjab mirip ditemukan'}
                      </div>
                      <div className="mt-1">{matchedAnjab.nama_jabatan}</div>
                      <div className="mt-0.5 text-xs opacity-75">
                        Kemiripan: {(matchedAnjab.similarity * 100).toFixed(0)}%
                      </div>
                      {matchingSuggestions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setMatchedAnjab(null)}
                          className="mt-2 text-xs underline hover:no-underline"
                        >
                          Pilih anjab lain dari saran
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!checkingMatch && !matchedAnjab && matchingSuggestions.length > 0 && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-3">
                    <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    <div className="flex-1">
                      <div className="font-semibold text-yellow-800 text-sm mb-1">⚠️ Tidak ada anjab yang cocok</div>
                      <div className="text-xs text-yellow-700">Pilih salah satu anjab yang mirip di bawah ini:</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {matchingSuggestions.slice(0, 5).map((sug) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => setSelectedAnjabId(sug.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                          selectedAnjabId === sug.id
                            ? 'bg-purple-600 border-2 border-purple-700 text-white font-semibold shadow-md'
                            : 'bg-white border-2 border-gray-300 text-gray-800 hover:border-purple-400 hover:bg-purple-50 hover:shadow'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <div className={`font-medium ${selectedAnjabId === sug.id ? 'text-white' : 'text-gray-900'}`}>
                              {sug.nama_jabatan}
                            </div>
                            <div className={`text-xs mt-1 ${selectedAnjabId === sug.id ? 'text-purple-100' : 'text-gray-600'}`}>
                              Kemiripan: {(sug.similarity * 100).toFixed(0)}%
                            </div>
                          </div>
                          {selectedAnjabId === sug.id && (
                            <div className="flex-shrink-0">
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {selectedAnjabId && (
                    <div className="mt-3 pt-3 border-t border-yellow-300">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-yellow-800 font-medium">
                          ✓ Anjab dipilih: {matchingSuggestions.find(s => s.id === selectedAnjabId)?.nama_jabatan}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAnjabId(null)}
                          className="text-xs text-purple-700 hover:text-purple-900 underline font-medium"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                    placeholder="Otomatis dari nama atau ketik manual"
                    disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Kode unik untuk URL jabatan
                </p>
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
                    <CustomSelect
                        value={parentId}
                        onChange={(val) => setParentId(val)}
                        options={parentOptions.map(opt => ({
                          value: String(opt.id),
                          label: opt.label
                        }))}
                        placeholder="Pilih Atasan"
                        searchable={true}
                    />
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
                  <CustomSelect
                      value={isPusat}
                      onChange={(val) => setIsPusat(val)}
                      options={[
                        { value: "true", label: "Pusat" },
                        { value: "false", label: "Daerah" }
                      ]}
                  />
                </div>

                {/* Jenis Jabatan */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jenis Jabatan <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                      value={jenisJabatan}
                      onChange={(val) => setJenisJabatan(val)}
                      options={[
                        { value: "", label: "(Pilih Jenis Jabatan)" },
                        { value: "ESELON I", label: "ESELON I" },
                        { value: "ESELON II", label: "ESELON II" },
                        { value: "ESELON III", label: "ESELON III" },
                        { value: "ESELON IV", label: "ESELON IV" },
                        { value: "JABATAN FUNGSIONAL", label: "JABATAN FUNGSIONAL" },
                        { value: "JABATAN PELAKSANA", label: "JABATAN PELAKSANA" },
                        { value: "PEGAWAI DPK", label: "PEGAWAI DPK" },
                        { value: "PEGAWAI CLTN", label: "PEGAWAI CLTN" }
                      ]}
                      placeholder="Pilih Jenis Jabatan"
                      searchable={true}
                  />
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