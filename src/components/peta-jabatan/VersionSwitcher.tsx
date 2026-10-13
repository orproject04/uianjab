"use client";

import React, { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import Swal from "sweetalert2";
import { useSotk, Versi } from "@/context/SotkContext";
import { clearPetaJabatanCache } from "@/lib/getPetaJabatan";

interface VersionSwitcherProps {
    activeVersion?: string;
    setActiveVersion?: (v: string) => void;
    isAdmin: boolean;
    layout?: 'vertical' | 'horizontal';
}

export const VersionSwitcher: React.FC<VersionSwitcherProps> = ({ 
    activeVersion: propActiveVersion, 
    setActiveVersion: propSetActiveVersion, 
    isAdmin, 
    layout = 'vertical' 
}) => {
    const { 
        activeVersion: ctxActiveVersion, 
        setActiveVersion: ctxSetActiveVersion, 
        versions, 
        setVersions, 
        fetchVersions, 
        loadingVersions 
    } = useSotk();

    const activeVersion = propActiveVersion ?? ctxActiveVersion;
    const setActiveVersion = propSetActiveVersion ?? ctxSetActiveVersion;

    const [showMenu, setShowMenu] = useState(false);
    const [showCloneModal, setShowCloneModal] = useState(false);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Form states
    const [cloneForm, setCloneForm] = useState({ source_id: "", nama: "", ket: "" });
    const [publishForm, setPublishForm] = useState({ id: "", nama: "" });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const submitClone = async () => {
        if (!cloneForm.nama.trim()) {
            return Swal.fire("Oops", "Nama Draft wajib diisi!", "warning");
        }

        // Tentukan versi sumber yang akan disalin
        const targetSource = cloneForm.source_id || activeVersion;
        const sourceObj = versions.find(v => v.id === targetSource) || versions.find(v => v.status === 'AKTIF');
        const sourceName = sourceObj ? `${sourceObj.nama_versi} (${sourceObj.status})` : "Peta Jabatan Aktif";

        // Konfirmasi sebelum melakukan clone
        const confirmResult = await Swal.fire({
            title: "Konfirmasi Buat Draft",
            html: `Apakah Anda yakin ingin membuat draft baru <b>"${cloneForm.nama.trim()}"</b> dengan menyalin seluruh struktur dari <b>"${sourceName}"</b>?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Ya, Buat Draft",
            cancelButtonText: "Batal",
            reverseButtons: true
        });

        if (!confirmResult.isConfirmed) {
            return;
        }

        setShowCloneModal(false);
        Swal.fire({ title: "Memproses Draft...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // Auto-generate ID di background dari judul draft
        const cleanSlug = cloneForm.nama
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 35);
        const autoId = `DRAFT_${cleanSlug || 'SOTK'}`.slice(0, 50);

        try {
            const res = await apiFetch("/api/peta-jabatan/versi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "CLONE",
                    source_id: targetSource,
                    new_id: autoId,
                    nama_versi: cloneForm.nama.trim(),
                    keterangan: cloneForm.ket,
                    status: "DRAFT"
                })
            });
            const json = await res.json();
            if (res.ok) {
                // Optimistically update versions so dropdown reflects the new draft immediately
                const newDraft: Versi = {
                    id: autoId,
                    nama_versi: cloneForm.nama.trim(),
                    status: "DRAFT",
                    keterangan: cloneForm.ket || ""
                };
                setVersions(prev => [...prev.filter(v => v.id !== autoId), newDraft]);
                
                // Switch active version to the new draft
                setActiveVersion(autoId);
                clearPetaJabatanCache();
                setCloneForm({ source_id: "", nama: "", ket: "" }); // reset

                // Sync fresh state from server in background
                fetchVersions();

                Swal.fire("Berhasil", json.message, "success");
            } else {
                Swal.fire("Gagal", json.error || "Gagal membuat draft", "error");
            }
        } catch (e) {
            Swal.fire("Gagal", "Terjadi kesalahan sistem", "error");
        }
    };

    const submitPublish = async () => {
        if (!publishForm.nama.trim()) {
            return Swal.fire("Oops", "Nama Arsip wajib diisi!", "warning");
        }

        const confirmResult = await Swal.fire({
            title: "Konfirmasi Publish ke Publik",
            html: `Draft <b>"${activeV.nama_versi}"</b> akan disahkan menjadi Peta Jabatan Aktif ke publik.<br/><br/>Peta Jabatan aktif saat ini otomatis akan diarsipkan menjadi <b>"${publishForm.nama.trim()}"</b>.<br/><br/>Lanjutkan?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#059669",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Ya, Sahkan & Publish",
            cancelButtonText: "Batal",
            reverseButtons: true
        });

        if (!confirmResult.isConfirmed) {
            return;
        }

        setShowPublishModal(false);
        Swal.fire({ title: "Mempublish Draft...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await apiFetch("/api/peta-jabatan/versi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "PUBLISH",
                    draft_id: activeVersion,
                    archive_name: publishForm.nama.trim()
                })
            });
            const json = await res.json();
            if (res.ok) {
                clearPetaJabatanCache();
                await fetchVersions();
                setPublishForm({ id: "", nama: "" }); // reset
                Swal.fire("Berhasil", json.message, "success");
            } else {
                Swal.fire("Gagal", json.error || "Gagal mempublish", "error");
            }
        } catch (e) {
            Swal.fire("Gagal", "Terjadi kesalahan sistem", "error");
        }
    };

    const activeV = versions.find(v => v.id === activeVersion) || versions.find(v => v.status === 'AKTIF') || { id: 'PETA_JABATAN_OKTOBER_2026', nama_versi: 'Peta Jabatan Oktober 2026', status: 'AKTIF' };

    const isHorizontal = layout === 'horizontal';

    return (
        <div className={`flex ${isHorizontal ? 'flex-row items-center gap-4' : 'flex-col gap-2 px-3 py-4 border-b border-gray-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/30'}`}>
            <div className={`flex items-center justify-between px-1 ${isHorizontal ? 'gap-2 order-2' : ''}`}>
                {!isHorizontal && <span className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Ruang Kerja</span>}
                {isAdmin && (
                    <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setShowMenu(!showMenu)} 
                            className={`text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 font-medium flex items-center gap-1.5 p-1 rounded hover:bg-brand-50 transition-colors ${isHorizontal ? 'border border-brand-200 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30' : ''}`}
                        >
                            <span>⚙️ Kelola</span>
                        </button>
                        
                        {showMenu && (
                            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-150 origin-top-right">
                                <button 
                                    onClick={() => { 
                                        setShowMenu(false); 
                                        setCloneForm({ source_id: activeVersion, nama: "", ket: "" }); 
                                        setShowCloneModal(true); 
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <span>📄</span> Buat Draft Baru
                                </button>
                                {activeV.status === 'DRAFT' && (
                                    <button 
                                        onClick={() => { setShowMenu(false); setShowPublishModal(true); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 border-t border-gray-100"
                                    >
                                        <span>🚀</span> Publish ke Publik
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <div className={`relative ${isHorizontal ? 'min-w-[200px] order-1' : ''}`}>
                <select
                    value={activeVersion}
                    onChange={(e) => setActiveVersion(e.target.value)}
                    className={`w-full appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-8 text-sm font-medium text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all cursor-pointer ${isHorizontal ? 'py-1.5' : 'py-2.5'}`}
                    disabled={loadingVersions}
                >
                    {versions.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.nama_versi}
                        </option>
                    ))}
                    {versions.length === 0 && <option value="AKTIF">Peta Jabatan Aktif</option>}
                </select>
                
                {/* Indicator Icon inside select */}
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {activeV.status === 'AKTIF' ? (
                        <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    ) : activeV.status === 'DRAFT' ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                    ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                    )}
                </div>
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>

            {/* Custom Modals */}
            {showCloneModal && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Buat Draft SOTK Baru</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Menyalin struktur peta jabatan ke ruang kerja draft terpisah.</p>
                            </div>
                            <button onClick={() => setShowCloneModal(false)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-full transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Salin Dari Versi / Sumber <span className="text-red-500">*</span>
                                </label>
                                <select 
                                    value={cloneForm.source_id || activeVersion} 
                                    onChange={e => setCloneForm({ ...cloneForm, source_id: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all bg-white text-gray-800"
                                >
                                    {versions.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.nama_versi} {v.status === 'AKTIF' ? '⭐ (Aktif Saat Ini)' : `[${v.status}]`}
                                        </option>
                                    ))}
                                    {versions.length === 0 && <option value="AKTIF">Peta Jabatan Aktif</option>}
                                </select>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Pilih struktur versi peta yang ingin dijadikan patokan/dasar salinan.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Draft Baru <span className="text-red-500">*</span></label>
                                <input 
                                    value={cloneForm.nama} 
                                    onChange={e => setCloneForm({...cloneForm, nama: e.target.value})}
                                    placeholder="Contoh: Rancangan SOTK Tahun 2028"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan Tambahan</label>
                                <textarea 
                                    value={cloneForm.ket} 
                                    onChange={e => setCloneForm({...cloneForm, ket: e.target.value})}
                                    placeholder="Tuliskan tujuan draft ini dibuat..."
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all resize-none"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShowCloneModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors">Batal</button>
                            <button onClick={submitClone} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                                Buat Draft
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPublishModal && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-emerald-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-emerald-800">Publish Draft ke Publik</h3>
                                <p className="text-xs text-emerald-600/80 mt-0.5">Versi Aktif saat ini otomatis akan diarsipkan.</p>
                            </div>
                            <button onClick={() => setShowPublishModal(false)} className="text-emerald-400 hover:bg-emerald-100 p-1.5 rounded-full transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 flex gap-2">
                                <span>⚠️</span>
                                <p>Pastikan Anda mengisi data arsip di bawah ini dengan benar untuk Peta Jabatan yang saat ini sedang aktif agar tidak hilang.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Arsip (Lama) <span className="text-red-500">*</span></label>
                                <input 
                                    value={publishForm.nama} 
                                    onChange={e => setPublishForm({...publishForm, nama: e.target.value})}
                                    placeholder="Contoh: SOTK DPD RI Tahun 2024"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors">Batal</button>
                            <button onClick={submitPublish} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                                Sahkan & Publish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
