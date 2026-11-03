"use client";

import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showVersionMenu, setShowVersionMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const versionBtnRef = useRef<HTMLButtonElement>(null);
    const versionPanelRef = useRef<HTMLDivElement>(null);
    const sizerRef = useRef<HTMLDivElement>(null);
    const [triggerWidth, setTriggerWidth] = useState(0);
    const [versionMenuPos, setVersionMenuPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number; width: number; maxHeight: number }>({ top: -9999, left: -9999, width: 0, maxHeight: 256 });

    // Versi yang saat ini aktif/terpilih
    const activeV = versions.find(v => v.id === activeVersion) || versions.find(v => v.status === 'AKTIF') || { id: 'PETA_JABATAN_OKTOBER_2026', nama_versi: 'Peta Jabatan Oktober 2026', status: 'AKTIF' };

    // Form states
    const [cloneForm, setCloneForm] = useState({ source_id: "", nama: "", ket: "" });
    const [renameForm, setRenameForm] = useState({ id: "", nama: "", ket: "" });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
            const t = event.target as Node;
            if (versionBtnRef.current?.contains(t)) return;
            if (versionPanelRef.current?.contains(t)) return;
            setShowVersionMenu(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const placeVersionMenu = useCallback(() => {
        const el = versionBtnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const gap = 6;
        const margin = 12;

        if (layout === 'horizontal') {
            // Open below/above the trigger (used in a header-style horizontal bar)
            const spaceBelow = window.innerHeight - r.bottom - gap - margin;
            const spaceAbove = r.top - gap - margin;
            const flipUp = spaceBelow < 120 && spaceAbove > spaceBelow;

            if (flipUp) {
                setVersionMenuPos({
                    bottom: window.innerHeight - r.top + gap,
                    left: r.left,
                    width: r.width,
                    maxHeight: Math.max(80, Math.min(256, spaceAbove)),
                });
            } else {
                setVersionMenuPos({
                    top: r.bottom + gap,
                    left: r.left,
                    width: r.width,
                    maxHeight: Math.max(80, Math.min(256, spaceBelow)),
                });
            }
            return;
        }

        // Vertical (sidebar) layout: open sideways so it never gets clipped
        // by the narrow footer strip — flyout to the right, vertically
        // centered on the button, with a flip-to-left fallback.
        const panelWidth = 240;
        const spaceRight = window.innerWidth - r.right - gap - margin;
        const spaceLeft = r.left - gap - margin;
        const openRight = spaceRight >= panelWidth || spaceRight >= spaceLeft;

        const maxHeight = Math.min(288, window.innerHeight - margin * 2);
        let top = r.top + r.height / 2 - maxHeight / 2;
        top = Math.max(margin, Math.min(top, window.innerHeight - maxHeight - margin));

        if (openRight) {
            setVersionMenuPos({ top, left: r.right + gap, width: panelWidth, maxHeight });
        } else {
            setVersionMenuPos({ top, right: window.innerWidth - r.left + gap, width: panelWidth, maxHeight });
        }
    }, [layout]);

    useEffect(() => {
        if (!showVersionMenu) return;
        placeVersionMenu();
        const onScrollResize = () => placeVersionMenu();
        window.addEventListener("scroll", onScrollResize, true);
        window.addEventListener("resize", onScrollResize);
        return () => {
            window.removeEventListener("scroll", onScrollResize, true);
            window.removeEventListener("resize", onScrollResize);
        };
    }, [showVersionMenu, placeVersionMenu]);

    // Measure the real rendered width of the widest version name (via a hidden,
    // naturally-sized sizer element) and apply that exact pixel value directly
    // to the trigger — more reliable than leaning on implicit CSS track sizing.
    useLayoutEffect(() => {
        if (sizerRef.current) {
            setTriggerWidth(sizerRef.current.offsetWidth);
        }
    }, [versions, isAdmin]);

    const submitClone = async () => {
        if (!cloneForm.nama.trim()) {
            return Swal.fire("Oops", "Nama Draft wajib diisi!", "warning");
        }

        // Tentukan versi sumber yang akan disalin
        const targetSource = cloneForm.source_id || activeV.id;
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
        const currentlyAktif = versions.find(v => v.status === 'AKTIF');
        const isRestore = activeV.status === 'ARSIP';

        const confirmResult = await Swal.fire({
            title: isRestore ? "Pulihkan Versi Arsip?" : "Konfirmasi Publish ke Publik",
            html: `Versi <b>"${activeV.nama_versi}"</b> akan ${isRestore ? 'dipulihkan menjadi' : 'disahkan menjadi'} Peta Jabatan Aktif.${
                currentlyAktif ? `<br/><br/>Versi aktif saat ini (<b>"${currentlyAktif.nama_versi}"</b>) akan otomatis diarsipkan.` : ''
            }<br/><br/>Lanjutkan?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#059669",
            cancelButtonColor: "#64748b",
            confirmButtonText: isRestore ? "Ya, Pulihkan" : "Ya, Sahkan & Publish",
            cancelButtonText: "Batal",
            reverseButtons: true
        });

        if (!confirmResult.isConfirmed) {
            return;
        }

        Swal.fire({ title: "Memproses...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await apiFetch("/api/peta-jabatan/versi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "PUBLISH",
                    draft_id: activeV.id
                })
            });
            const json = await res.json();
            if (res.ok) {
                clearPetaJabatanCache();
                await fetchVersions();
                Swal.fire("Berhasil", json.message, "success");
            } else {
                Swal.fire("Gagal", json.error || "Gagal memproses", "error");
            }
        } catch (e) {
            Swal.fire("Gagal", "Terjadi kesalahan sistem", "error");
        }
    };

    const submitDelete = async () => {
        if (activeV.status === 'AKTIF') {
            return Swal.fire("Tidak Bisa", "Versi yang sedang aktif tidak dapat dihapus.", "warning");
        }

        const confirmResult = await Swal.fire({
            title: "Hapus Versi?",
            html: `Versi <b>"${activeV.nama_versi}"</b> beserta seluruh data jabatan di dalamnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Ya, Hapus",
            cancelButtonText: "Batal",
            reverseButtons: true
        });

        if (!confirmResult.isConfirmed) return;

        const deletedId = activeV.id;
        Swal.fire({ title: "Menghapus Versi...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await apiFetch("/api/peta-jabatan/versi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DELETE", id: deletedId })
            });
            const json = await res.json();
            if (res.ok) {
                const remaining = versions.filter(v => v.id !== deletedId);
                setVersions(remaining);
                const aktif = remaining.find(v => v.status === 'AKTIF');
                if (aktif) setActiveVersion(aktif.id);
                clearPetaJabatanCache();
                fetchVersions();
                Swal.fire("Berhasil", json.message, "success");
            } else {
                Swal.fire("Gagal", json.error || "Gagal menghapus versi", "error");
            }
        } catch (e) {
            Swal.fire("Gagal", "Terjadi kesalahan sistem", "error");
        }
    };

    const openRenameModal = () => {
        setRenameForm({
            id: activeV.id,
            nama: activeV.nama_versi || "",
            ket: (activeV as any).keterangan || ""
        });
        setShowRenameModal(true);
    };

    const submitRename = async () => {
        if (!renameForm.nama.trim()) {
            return Swal.fire("Oops", "Nama Versi wajib diisi!", "warning");
        }

        const renamedId = renameForm.id;
        const nama = renameForm.nama.trim();
        const ket = renameForm.ket;

        setShowRenameModal(false);
        Swal.fire({ title: "Menyimpan...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await apiFetch("/api/peta-jabatan/versi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "RENAME", id: renamedId, nama_versi: nama, keterangan: ket })
            });
            const json = await res.json();
            if (res.ok) {
                setVersions(prev => prev.map(v => (v.id === renamedId || (v.status === 'AKTIF' && (renamedId === 'AKTIF' || renamedId === activeV.id))) ? { ...v, nama_versi: nama, keterangan: ket } : v));
                clearPetaJabatanCache();
                fetchVersions();
                Swal.fire("Berhasil", json.message, "success");
            } else {
                Swal.fire("Gagal", json.error || "Gagal memperbarui versi", "error");
            }
        } catch (e) {
            Swal.fire("Gagal", "Terjadi kesalahan sistem", "error");
        }
    };

    const isHorizontal = layout === 'horizontal';

    if (!isAdmin) return null;

    return (
        <div className={`flex ${isHorizontal ? 'flex-row items-center gap-1.5 min-w-0' : 'flex-col gap-2 px-3 py-4 border-b border-gray-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/30'}`}>
            <div className={`flex items-center justify-between px-1 ${isHorizontal ? 'gap-2 order-2' : ''}`}>
                {!isHorizontal && <span className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Versi Peta Jabatan</span>}
                {isAdmin && (
                    <div className="flex items-center gap-1.5">
                        {/* Always mounted (never conditionally removed) so this slot's width
                            is reserved — otherwise the whole switcher jumps/resizes the
                            instant a draft gets published and this button would disappear. */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                title="Kelola Versi"
                                aria-label="Kelola Versi"
                                className="flex items-center justify-center w-7 h-7 rounded-lg text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30 transition-colors border border-brand-200 dark:border-brand-800"
                            >
                                <span className="text-sm">⚙️</span>
                            </button>

                            {showMenu && (
                                <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-150 origin-top-right">
                                    <button
                                        onClick={() => {
                                            setShowMenu(false);
                                            setCloneForm({ source_id: activeV.id, nama: "", ket: "" });
                                            setShowCloneModal(true);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                        <span>📄</span> Tambah
                                    </button>
                                    <button
                                        onClick={() => { setShowMenu(false); openRenameModal(); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 flex items-center gap-2 border-t border-gray-100"
                                    >
                                        <span>✏️</span> Edit Nama
                                    </button>
                                    {activeV.status !== 'AKTIF' && (
                                        <button
                                            onClick={() => { setShowMenu(false); submitDelete(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                                        >
                                            <span>🗑️</span> Hapus
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => activeV.status !== 'AKTIF' && submitPublish()}
                            tabIndex={activeV.status === 'AKTIF' ? -1 : 0}
                            title={activeV.status === 'ARSIP' ? "Pulihkan ke Aktif" : "Publish ke Publik"}
                            aria-label={activeV.status === 'ARSIP' ? "Pulihkan ke Aktif" : "Publish ke Publik"}
                            aria-hidden={activeV.status === 'AKTIF'}
                            className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors border ${
                                activeV.status === 'AKTIF'
                                    ? 'invisible pointer-events-none border-transparent'
                                    : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
                            }`}
                        >
                            <span className="text-sm">{activeV.status === 'ARSIP' ? '♻️' : '🚀'}</span>
                        </button>
                        
                    </div>
                )}
            </div>
            
            <div
                className={`relative ${isHorizontal ? 'max-w-[300px] order-1' : ''}`}
                style={triggerWidth ? { width: triggerWidth } : undefined}
            >
                {/* Invisible sizer: naturally sized (inline-flex column, so it shrink-wraps
                    to its widest row) and measured via ref — we then apply that exact pixel
                    width to the wrapper/button directly, rather than leaning on implicit CSS
                    track sizing (which proved unreliable under this flex/min-w-0 ancestry). */}
                <div
                    ref={sizerRef}
                    className="invisible pointer-events-none absolute left-0 top-0 inline-block"
                    aria-hidden="true"
                >
                    {(versions.length ? versions : [{ id: 'AKTIF', nama_versi: 'Peta Jabatan Aktif', status: 'AKTIF' } as Versi]).map(v => (
                        <div key={v.id} className={`flex items-center gap-2 pl-3 pr-8 text-sm font-medium whitespace-nowrap ${isHorizontal ? 'py-1.5' : 'py-2.5'}`}>
                            <span className="h-2.5 w-2.5 flex-shrink-0"></span>
                            <span>{v.nama_versi}</span>
                        </div>
                    ))}
                </div>

                <button
                    ref={versionBtnRef}
                    type="button"
                    onClick={() => setShowVersionMenu(v => !v)}
                    disabled={loadingVersions}
                    className={`w-full flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 text-sm font-medium text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${isHorizontal ? 'py-1.5' : 'py-2.5'}`}
                >
                    {activeV.status === 'AKTIF' ? (
                        <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    ) : activeV.status === 'DRAFT' ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 flex-shrink-0"></span>
                    ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 flex-shrink-0"></span>
                    )}
                    <span className="flex-1 text-left truncate">{activeV.nama_versi}</span>
                </button>

                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                    <svg className={`h-4 w-4 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>

                {showVersionMenu && createPortal(
                    <div
                        ref={versionPanelRef}
                        style={{
                            position: "fixed",
                            top: versionMenuPos.top,
                            bottom: versionMenuPos.bottom,
                            left: versionMenuPos.left,
                            right: versionMenuPos.right,
                            width: versionMenuPos.width,
                            maxHeight: versionMenuPos.maxHeight,
                            zIndex: 2000,
                        }}
                        className="overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 animate-in fade-in zoom-in duration-150 origin-top"
                    >
                        {(versions.length ? versions : [{ id: 'AKTIF', nama_versi: 'Peta Jabatan Aktif', status: 'AKTIF' } as Versi]).map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => { setActiveVersion(v.id); setShowVersionMenu(false); }}
                                className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                                    v.id === activeVersion
                                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium"
                                        : "text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                                }`}
                            >
                                {v.status === 'AKTIF' ? (
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                                ) : v.status === 'DRAFT' ? (
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 flex-shrink-0"></span>
                                ) : (
                                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300 flex-shrink-0"></span>
                                )}
                                <span className="truncate">{v.nama_versi}</span>
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
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
                                    value={cloneForm.source_id || activeV.id} 
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

            {showRenameModal && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Edit Nama Versi</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Ubah nama dan keterangan untuk versi ini.</p>
                            </div>
                            <button onClick={() => setShowRenameModal(false)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-full transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Versi <span className="text-red-500">*</span></label>
                                <input
                                    autoFocus
                                    value={renameForm.nama}
                                    onChange={e => setRenameForm({ ...renameForm, nama: e.target.value })}
                                    placeholder="Contoh: SOTK DPD RI Tahun 2024"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                                <textarea
                                    value={renameForm.ket}
                                    onChange={e => setRenameForm({ ...renameForm, ket: e.target.value })}
                                    placeholder="Opsional"
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all resize-none"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShowRenameModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors">Batal</button>
                            <button onClick={submitRename} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                                Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
