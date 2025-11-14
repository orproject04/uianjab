"use client";

import React, {useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";

import {useSidebar} from "../context/SidebarContext";
import {GridIcon, ListIcon, ChevronDownIcon, HorizontaLDots, GroupIcon, PieChartIcon, DocsIcon, TaskIcon} from "../icons/index";

import {useMe} from "@/context/MeContext";
import {createPortal} from "react-dom";
import Swal from "sweetalert2";
import {apiFetch} from "@/lib/apiFetch";
import {CustomSelect} from "@/components/form/CustomSelect";

// Tipe API dan Internal tetap sama
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
    jabatan_id?: string | null;
};

type SubNavItem = {
    id: string;
    name: string;
    slug: string;
    unit_kerja?: string | null;
    path: string;
    subItems?: SubNavItem[];
    jabatan_id?: string | null;
};

type NavItem = {
    name: string;
    icon: React.ReactNode;
    path?: string;
    subItems?: SubNavItem[];
};

const AppSidebar: React.FC = () => {
    const {isExpanded, isMobileOpen, isHovered, setIsHovered} = useSidebar();
    const pathname = usePathname();
    const {isAdmin, loading: meLoading} = useMe();

    // State tetap sama seperti kode asli
    const [anjabSubs, setAnjabSubs] = useState<SubNavItem[]>([]);
    const [loadingAnjab, setLoadingAnjab] = useState<boolean>(false);
    const [anjabError, setAnjabError] = useState<string | null>(null);
    const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
    const [openNestedSubmenus, setOpenNestedSubmenus] = useState<Record<string, boolean>>({});
    
    // State untuk Edit modal
    const [showEdit, setShowEdit] = useState(false);
    const [editFor, setEditFor] = useState<SubNavItem | null>(null);
    const [editName, setEditName] = useState("");
    const [editSlug, setEditSlug] = useState("");
    const [editOrder, setEditOrder] = useState<string>("");
    const [editParentId, setEditParentId] = useState<string | "">("");
    const [editUnitKerja, setEditUnitKerja] = useState<string>("");
    const [editIsPusat, setEditIsPusat] = useState<string>("true");
    const [editJenisJabatan, setEditJenisJabatan] = useState<string>("");
    const [parentOptions, setParentOptions] = useState<Array<{ id: string | ""; label: string }>>([]);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // State untuk Add Child modal
    const [showAdd, setShowAdd] = useState(false);
    const [addParentFor, setAddParentFor] = useState<SubNavItem | null>(null);
    const [addName, setAddName] = useState("Penata Kelola Sistem dan Teknologi Informasi");
    const [addSlug, setAddSlug] = useState("pksti");
    const [addOrder, setAddOrder] = useState<string>("");
    const [addUnitKerja, setAddUnitKerja] = useState<string>("");
    const [addIsPusat, setAddIsPusat] = useState<string>("true");
    const [addJenisJabatan, setAddJenisJabatan] = useState<string>("");
    const [addErr, setAddErr] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [slugTouched, setSlugTouched] = useState(false);
    
    // State untuk anjab matching
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

    // Utility functions tetap sama
    const toSlug = (s: string) => {
        if (!s) return "unit";
        const caps = (s.match(/[A-Z]/g) || []).join("").toLowerCase();
        if (caps) return caps;
        const lettersOnly = s.toLowerCase().replace(/[^a-z]/g, "");
        return lettersOnly || "unit";
    };

    const buildTreeFromFlat = (rows: APIRow[]): SubNavItem[] => {
        const children = new Map<string | null, APIRow[]>();
        for (const r of rows) {
            const arr = children.get(r.parent_id) || [];
            arr.push(r);
            children.set(r.parent_id, arr);
        }
        for (const [k, arr] of children.entries()) {
            arr.sort(
                (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
            );
            children.set(k, arr);
        }
        const buildNode = (node: APIRow, parentPath: string | null): SubNavItem => {
            const path = parentPath ? `${parentPath}/${node.slug}` : `anjab/${node.slug}`;
            const kids = children.get(node.id) || [];
            const subItems = kids.map((k) => buildNode(k, path));
            const base: SubNavItem = {
                id: node.id,
                name: node.nama_jabatan,
                slug: node.slug,
                unit_kerja: node.unit_kerja ?? null,
                path,
                jabatan_id: node.jabatan_id ?? null,
            };
            if (subItems.length) base.subItems = subItems;
            return base;
        };
        const roots = children.get(null) || [];
        return roots.map((r) => buildNode(r, null));
    };

    const pathSegments = (fullPath: string) =>
        fullPath.replace(/^anjab\/?/, "").replace(/^\/+/, "").split("/").filter(Boolean);

    const pathToSlug = (fullPath: string) => {
        const segs = pathSegments(fullPath);
        return segs.join("/");
    };

    function findNodeById(id: string, items: SubNavItem[]): SubNavItem | null {
        for (const it of items) {
            if (it.id === id) return it;
            if (it.subItems?.length) {
                const f = findNodeById(id, it.subItems);
                if (f) return f;
            }
        }
        return null;
    }

    function collectDescendantNodes(node: SubNavItem): SubNavItem[] {
        const out: SubNavItem[] = [];
        const walk = (n: SubNavItem) => {
            if (n.subItems?.length) {
                for (const c of n.subItems) {
                    out.push(c);
                    walk(c);
                }
            }
        };
        walk(node);
        return out;
    }

    const loadData = useCallback(async () => {
        setLoadingAnjab(true);
        setAnjabError(null);
        try {
            const res = await apiFetch("/api/peta-jabatan", {cache: "no-store"});
            if (!res.ok) throw new Error(`Gagal memuat Anjab (${res.status})`);
            const flat: APIRow[] = await res.json();
            setAnjabSubs(buildTreeFromFlat(flat));
        } catch (e: any) {
            setAnjabError(e?.message || "Gagal memuat Anjab");
        } finally {
            setLoadingAnjab(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadData();
            if (cancelled) return;
        })();
        return () => {
            cancelled = true;
        };
    }, [loadData]);

    // Listen for custom event to refresh sidebar when new jabatan added
    useEffect(() => {
        const handleTreeUpdate = () => {
            loadData();
        };
        window.addEventListener('anjab-tree-updated', handleTreeUpdate);
        return () => {
            window.removeEventListener('anjab-tree-updated', handleTreeUpdate);
        };
    }, [loadData]);

    const navItems: NavItem[] = [
        {icon: <GridIcon/>, name: "Homepage", path: "/", subItems: []},
        ...(isAdmin ? [{
            name: "Master Anjab", 
            icon: <DocsIcon/>, 
            path: "/anjab/master", 
            subItems: []
        }] : []),
        ...(isAdmin ? [{
            name: "Match Anjab", 
            icon: <TaskIcon/>, 
            path: "/anjab/match", 
            subItems: []
        }] : []),
        {name: "Anjab", icon: <ListIcon/>, subItems: anjabSubs},
        {name: "Peta Jabatan", icon: <GroupIcon/>, path: "/peta-jabatan", subItems: []},
        {name: "Rekap Jabatan", icon: <PieChartIcon/>, path: "/dashboard", subItems: []}
    ];
    const othersItems: NavItem[] = [];

    const isExactActive = useCallback(
        (path?: string) => {
            if (!path) return false;
            const norm = `/${String(path).replace(/^\/+/, "")}`;
            return pathname === norm;
        },
        [pathname]
    );

    const findItemByPath = (path: string, items: SubNavItem[]): SubNavItem | null => {
        for (const item of items) {
            if (item.path === path) return item;
            if (item.subItems) {
                const found = findItemByPath(path, item.subItems);
                if (found) return found;
            }
        }
        return null;
    };

    const collapseNestedChildren = (path: string, items: NavItem[]) => {
        const closed: Record<string, boolean> = {};
        const walk = (subs: SubNavItem[]) => {
            for (const it of subs) {
                closed[it.path] = false;
                if (it.subItems) walk(it.subItems);
            }
        };
        for (const nav of items) {
            if (!nav.subItems) continue;
            const parent = findItemByPath(path, nav.subItems);
            if (parent?.subItems) walk(parent.subItems);
        }
        setOpenNestedSubmenus((prev) => {
            const next = {...prev};
            for (const key in closed) delete next[key];
            return next;
        });
    };

    const toggleNestedSubmenu = (path: string) => {
        if (!path) return;
        setOpenNestedSubmenus((prev) => {
            const next = {...prev};
            if (next[path]) {
                delete next[path];
                collapseNestedChildren(path, navItems);
            } else {
                next[path] = true;
            }
            return next;
        });
    };

    const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
        setOpenSubmenu((prevOpen) => {
            const isSame = prevOpen?.type === menuType && prevOpen.index === index;
            if (isSame) {
                setOpenNestedSubmenus({});
                return null;
            }
            setOpenNestedSubmenus({});
            return {type: menuType, index};
        });
    };

    const handleDeleteNode = async (node: SubNavItem) => {
        const resSwal = await Swal.fire({
            title: "Hapus Jabatan?",
            html: `Hapus <b>${node.name}</b> beserta seluruh jabatan dibawahnya?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Hapus",
            cancelButtonText: "Batal",
            confirmButtonColor: "#dc2626",
        });
        if (!resSwal.isConfirmed) return;

        let res = await apiFetch(`/api/peta-jabatan/${encodeURIComponent(node.id)}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            const t = await res.json().catch(() => ({} as any));
            await Swal.fire({
                icon: "error",
                title: "Gagal",
                text: t?.error || `Gagal menghapus (${res.status})`,
            });
            return;
        }

        await loadData();
        await Swal.fire({icon: "success", title: "Terhapus", timer: 1200, showConfirmButton: false});
    };

    const fetchParentOptions = useCallback(async (currentId: string) => {
        const res = await apiFetch("/api/peta-jabatan", {cache: "no-store"});
        if (!res.ok) throw new Error("Gagal memuat pilihan parent");
        const flat: APIRow[] = await res.json();

        const byParent = new Map<string | null, APIRow[]>();
        for (const r of flat) {
            const arr = byParent.get(r.parent_id) || [];
            arr.push(r);
            byParent.set(r.parent_id, arr);
        }
        for (const [k, arr] of byParent.entries()) {
            arr.sort(
                (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
            );
            byParent.set(k, arr);
        }

        const descendants = new Set<string>();
        (function collect(id: string) {
            const kids = byParent.get(id) || [];
            for (const c of kids) {
                if (!descendants.has(c.id)) {
                    descendants.add(c.id);
                    collect(c.id);
                }
            }
        })(currentId);

        const options: Array<{ id: string | ""; label: string }> = [];
        const pushTree = (parentKey: string | null, depth: number) => {
            const kids = byParent.get(parentKey) || [];
            for (const node of kids) {
                if (node.id === currentId || descendants.has(node.id)) continue;
                options.push({
                    id: node.id,
                    label: `${"— ".repeat(depth)}${node.nama_jabatan}`,
                });
                pushTree(node.id, depth + 1);
            }
        };
        pushTree(null, 0);

        const opts: Array<{ id: string | ""; label: string }> = [
            {id: "", label: "-"},
            ...options,
        ];

        const current = flat.find((f) => f.id === currentId);
        const currentParent = current?.parent_id ?? "";
        const currentOrder = current?.order_index ?? "";
        const currentUnitKerja = current?.unit_kerja ?? "";
        const currentIsPusat = (current?.is_pusat ?? true) ? "true" : "false";
        const currentJenisJabatan = current?.jenis_jabatan ?? "";

        return {
            opts,
            currentParent,
            currentOrder: String(currentOrder),
            currentUnitKerja: String(currentUnitKerja ?? ""),
            currentIsPusat,
            currentJenisJabatan,
        };
    }, []);

    const openEditModal = useCallback(
        async (node: SubNavItem) => {
            try {
                setSaveErr(null);
                setEditFor(node);
                setEditName(node.name);
                setEditSlug(node.slug);

                const {
                    opts, currentParent, currentOrder, currentUnitKerja,
                    currentIsPusat, currentJenisJabatan
                } = await fetchParentOptions(node.id);

                setParentOptions(opts);
                setEditParentId(currentParent);
                setEditOrder(currentOrder === "0" ? "0" : currentOrder);
                setEditUnitKerja(currentUnitKerja || "");
                setEditIsPusat(currentIsPusat);
                setEditJenisJabatan(currentJenisJabatan || "");

                setShowEdit(true);
            } catch (e: any) {
                await Swal.fire({icon: "error", title: "Oops", text: e?.message || "Gagal membuka editor"});
            }
        },
        [fetchParentOptions]
    );

    const submitEdit = useCallback(async () => {
        if (!editFor) return;
        const id = editFor.id;

        const name = editName.trim();
        const slug = editSlug.trim();
        const parent_id = editParentId === "" ? null : editParentId;
        const unit_kerja = editUnitKerja.trim() || null;

        if (!name) {
            setSaveErr("Nama tidak boleh kosong.");
            return;
        }
        if (!slug) {
            setSaveErr("Slug tidak boleh kosong.");
            return;
        }

    const is_pusat = editIsPusat === "true";
        const jenis_jabatan = editJenisJabatan || null;

        const body: any = {name, slug, parent_id, unit_kerja, is_pusat, jenis_jabatan};
        if (editOrder.trim() !== "") {
            const parsed = Number(editOrder);
            if (!Number.isFinite(parsed)) {
                setSaveErr("Order index tidak valid.");
                return;
            }
            body.order_index = parsed;
        }

        try {
            setSaving(true);
            setSaveErr(null);
            const res = await apiFetch(`/api/peta-jabatan/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || `Gagal menyimpan (${res.status})`);

            try {
                const curNode = editFor && findNodeById(editFor.id, anjabSubs);
                if (curNode) {
                    const oldPath = pathToSlug(curNode.path);
                    const oldKeySelf = `${oldPath}`;

                    let parentPathNew = "";
                    if (editParentId) {
                        const parentNode = findNodeById(String(editParentId), anjabSubs);
                        if (parentNode) parentPathNew = pathToSlug(parentNode.path);
                    }
                    const newPath = parentPathNew ? `${parentPathNew}/${slug}` : slug;
                    const newKeySelf = `${newPath}`;

                    if (oldKeySelf !== newKeySelf) {
                        const val = localStorage.getItem(oldKeySelf) || editFor.id;
                        if (val) localStorage.setItem(newKeySelf, val);
                        try {
                            localStorage.removeItem(oldKeySelf);
                        } catch {
                        }
                    } else {
                        localStorage.setItem(oldKeySelf, editFor.id);
                    }

                    const descendants = collectDescendantNodes(curNode);
                    for (const d of descendants) {
                        const oldDescPath = pathToSlug(d.path);
                        const rel = pathToSlug(d.path).slice(pathToSlug(curNode.path).length).replace(/^\//, "");
                        const newDescPath = newPath ? `${newPath}/${rel}` : rel;

                        const oldDescKey = `${oldDescPath}`;
                        const newDescKey = `${newDescPath}`;
                        if (oldDescKey === newDescKey) continue;

                        const v = localStorage.getItem(oldDescKey) || d.id;
                        if (v) localStorage.setItem(newDescKey, v);
                        try {
                            localStorage.removeItem(oldDescKey);
                        } catch {
                        }
                    }
                }
            } catch {
            }

            setShowEdit(false);
            await loadData();
            await Swal.fire({icon: "success", title: "Tersimpan", timer: 1000, showConfirmButton: false});
        } catch (e: any) {
            setSaveErr(e?.message || "Gagal menyimpan perubahan.");
        } finally {
            setSaving(false);
        }
    }, [editFor, editName, editSlug, editOrder, editParentId, editUnitKerja, editIsPusat, editJenisJabatan, loadData, anjabSubs]);

    const openAddModal = (parent: SubNavItem) => {
        setAddParentFor(parent);
        setAddErr(null);
        setAddName("");
        setAddSlug("");
        setAddOrder("");
        setAddUnitKerja("");
        setAddIsPusat("true");
        setAddJenisJabatan("");
        setSlugTouched(false);
        setMatchedAnjab(null);
        setMatchingSuggestions([]);
        setSelectedAnjabId(null);
        setShowAdd(true);
    };

    // Function untuk check matching anjab
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

    // Debounce untuk check matching
    useEffect(() => {
        if (!showAdd || !addName) return;
        
        const timer = setTimeout(() => {
            checkAnjabMatch(addName);
        }, 500);

        return () => clearTimeout(timer);
    }, [addName, showAdd, checkAnjabMatch]);

    const submitAdd = useCallback(async () => {
        if (!addParentFor) return;
        const parent_id = addParentFor.id;
        const nama_jabatan = addName.trim();
        const slug = addSlug.trim();
        const unit_kerja = addUnitKerja.trim() || null;

        if (!nama_jabatan) {
            setAddErr("Nama tidak boleh kosong.");
            return;
        }
        if (!slug) {
            setAddErr("Slug tidak boleh kosong.");
            return;
        }

    const is_pusat = addIsPusat === "true";
        const jenis_jabatan = addJenisJabatan || null;

        const body: any = {parent_id, nama_jabatan, slug, unit_kerja, is_pusat, jenis_jabatan};
        
        // Prioritas: selectedAnjabId (manual) > matchedAnjab (auto)
        if (selectedAnjabId) {
            body.jabatan_id = selectedAnjabId;
        } else if (matchedAnjab) {
            body.jabatan_id = matchedAnjab.jabatan_id;
        }
        
        if (addOrder.trim() !== "") {
            const parsed = Number(addOrder);
            if (!Number.isFinite(parsed)) {
                setAddErr("Order index tidak valid.");
                return;
            }
            body.order_index = parsed;
        }

        try {
            setAdding(true);
            setAddErr(null);
            const res = await apiFetch("/api/peta-jabatan", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || `Gagal menambah (${res.status})`);

            try {
                const newId: string | undefined = json?.node?.id;
                if (newId && addParentFor) {
                    const parentPath = pathToSlug(addParentFor.path);
                    const newPath = `${parentPath}/${slug}`;
                    const key = `${newPath}`;
                    localStorage.setItem(key, newId);
                }
            } catch {
            }

            setShowAdd(false);
            await loadData();
            
            // Tentukan nama anjab yang digunakan
            let usedAnjabName = null;
            if (selectedAnjabId) {
                // User memilih manual dari suggestions
                const selected = matchingSuggestions.find(s => s.id === selectedAnjabId);
                usedAnjabName = selected?.nama_jabatan;
            } else if (json?.matched_anjab) {
                // Auto-match dari backend
                usedAnjabName = json.matched_anjab.nama_anjab;
            }
            
            // Tampilkan success message dengan info anjab jika ada
            if (usedAnjabName) {
                await Swal.fire({
                    icon: "success", 
                    title: "Jabatan berhasil ditambah", 
                    html: `<div class="text-sm">
                        <p class="mb-2">Jabatan <b>${nama_jabatan}</b> berhasil ditambahkan.</p>
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
                    html: `<div class="text-sm">
                        <p class="mb-2">Jabatan <b>${nama_jabatan}</b> berhasil ditambahkan.</p>
                        <div class="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg px-3 py-2 mt-2 text-xs">
                            ⚠️ Tidak ada anjab yang cocok. Silakan tambahkan anjab master secara manual.
                        </div>
                    </div>`,
                    timer: 3000, 
                    showConfirmButton: false
                });
            }
        } catch (e: any) {
            setAddErr(e?.message || "Gagal menambah jabatan.");
        } finally {
            setAdding(false);
        }
    }, [addParentFor, addName, addSlug, addOrder, addUnitKerja, addIsPusat, addJenisJabatan, selectedAnjabId, matchedAnjab, matchingSuggestions, loadData]);

    // Auto-scroll to active item in sidebar
    useEffect(() => {
        if (!pathname || pathname === '/') return;
        
        // Wait for DOM to update and submenu animations to complete
        const timer = setTimeout(() => {
            const activeLink = document.querySelector('aside a.bg-purple-50.text-purple-700') as HTMLElement;
            if (activeLink) {
                const nav = activeLink.closest('nav') as HTMLElement;
                if (nav) {
                    const navRect = nav.getBoundingClientRect();
                    const linkRect = activeLink.getBoundingClientRect();
                    const scrollTop = nav.scrollTop;
                    const targetScroll = scrollTop + (linkRect.top - navRect.top) - (navRect.height / 2) + (linkRect.height / 2);
                    
                    nav.scrollTo({ 
                        top: targetScroll, 
                        behavior: 'smooth' 
                    });
                }
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [pathname]);

    const NodeActionsButton: React.FC<{ node: SubNavItem }> = ({node}) => {
        if (!isAdmin) return null;
        const [open, setOpen] = useState(false);
        const btnRef = useRef<HTMLButtonElement | null>(null);
        const menuRef = useRef<HTMLDivElement | null>(null);
        const [pos, setPos] = useState<{ top: number; left: number }>({top: -9999, left: -9999});

        const placeMenu = useCallback(() => {
            const el = btnRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const menuW = 176;
            const menuH = (menuRef.current?.offsetHeight ?? 140) + 2;
            const gap = 6;

            let left = r.right - menuW;
            left = Math.max(8, Math.min(left, window.innerWidth - 8 - menuW));

            const flipUp = window.innerHeight - r.bottom < menuH + 12;
            const top = flipUp ? r.top - gap - menuH : r.bottom + gap;

            setPos({top, left});
        }, []);

        const trap = (e: React.SyntheticEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        useEffect(() => {
            if (!open) return;
            placeMenu();
            const onScrollResize = () => placeMenu();
            window.addEventListener("scroll", onScrollResize, true);
            window.addEventListener("resize", onScrollResize);
            const onDocDown = (e: MouseEvent) => {
                const t = e.target as Node;
                if (btnRef.current?.contains(t)) return;
                if (menuRef.current?.contains(t)) return;
                setOpen(false);
            };
            document.addEventListener("mousedown", onDocDown);
            return () => {
                window.removeEventListener("scroll", onScrollResize, true);
                window.removeEventListener("resize", onScrollResize);
                document.removeEventListener("mousedown", onDocDown);
            };
        }, [open, placeMenu]);

        return (
            <>
                <button
                    ref={btnRef}
                    type="button"
                    onPointerDown={trap}
                    onMouseDown={trap}
                    onClick={(e) => {
                        trap(e);
                        setOpen((v) => !v);
                    }}
                    className="relative z-50 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-all flex-shrink-0 opacity-60 hover:opacity-100"
                    aria-label="Node actions"
                    title="Aksi"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="19" cy="12" r="1.5"/>
                    </svg>
                </button>

                {open &&
                    createPortal(
                        <div
                            ref={menuRef}
                            style={{position: "fixed", top: pos.top, left: pos.left, width: 176, zIndex: 2000}}
                            className="rounded-xl border border-gray-200 bg-white shadow-lg text-sm overflow-hidden"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                }}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    setOpen(false);
                                    await openEditModal(node);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                            >
                                Edit Jabatan
                            </button>
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setOpen(false);
                                    openAddModal(node);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                            >
                                Tambah Jabatan
                            </button>
                            <div className="h-px bg-gray-100"/>
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setOpen(false);
                                    handleDeleteNode(node);
                                }}
                                className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
                            >
                                Hapus Jabatan
                            </button>
                        </div>,
                        document.body
                    )}
            </>
        );
    };

    const renderSubItems = (subItems: SubNavItem[], level: number = 0) => (
        <ul className={`mt-1 space-y-1 ${level === 0 ? "ml-9" : "ml-4"}`}>
            {subItems.map((subItem) => {
                const hasSubItems = !!subItem.subItems?.length;
                const isNestedOpen = openNestedSubmenus[subItem.path];
                const href = `/${(subItem.path || "").replace(/^\/+/, "")}`;

                return (
                    <li key={`${subItem.path}-${subItem.id}`}>
                        {hasSubItems ? (
                            <div>
                                <div className="relative isolate flex items-start min-w-0 group pr-2">
                                    <Link
                                        href={href}
                                        className={`relative z-0 flex-1 min-w-0 block px-3 py-2 rounded-md text-sm transition-colors ${
                                            isExactActive(subItem.path)
                                                ? "bg-purple-50 text-purple-700 font-medium"
                                                : "text-gray-700 hover:bg-gray-50"
                                        }`}
                                        title={`${subItem.name}${subItem.unit_kerja ? ' - ' + subItem.unit_kerja : ''}`}
                                    >
                                        <div className="leading-relaxed break-words hyphens-auto" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                                            {subItem.name}
                                        </div>
                                    </Link>
                                    <div className="flex items-start flex-shrink-0 ml-2 pt-2 gap-1">
                                        <button
                                            onClick={() => toggleNestedSubmenu(subItem.path)}
                                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                                            aria-label="toggle"
                                            title="Expand/Collapse"
                                        >
                                            <ChevronDownIcon
                                                className={`w-4 h-4 transition-transform duration-300 text-gray-500 ${isNestedOpen ? "rotate-180" : ""}`}
                                            />
                                        </button>
                                        <NodeActionsButton node={subItem}/>
                                    </div>
                                </div>
                                <div
                                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                                        isNestedOpen ? "max-h-[50000px] opacity-100 scale-y-100" : "max-h-0 opacity-0 scale-y-95"
                                    }`}
                                >
                                    {renderSubItems(subItem.subItems ?? [], level + 1)}
                                </div>
                            </div>
                        ) : (
                            <div className="relative isolate flex items-start min-w-0 group pr-2">
                                <Link
                                    href={href}
                                    className={`relative z-0 flex-1 min-w-0 block px-3 py-2 rounded-md text-sm transition-colors ${
                                        isExactActive(subItem.path)
                                            ? "bg-purple-50 text-purple-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                    }`}
                                    title={`${subItem.name}${subItem.unit_kerja ? ' - ' + subItem.unit_kerja : ''}`}
                                >
                                    <div className="leading-relaxed break-words hyphens-auto" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                                        {subItem.name}
                                    </div>
                                </Link>
                                <div className="flex-shrink-0 ml-2 pt-2">
                                    <NodeActionsButton node={subItem}/>
                                </div>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
        <ul className="flex flex-col gap-1">
            {items.map((nav, index) => {
                const isAnjab = nav.name === "Anjab";
                const hasChildren = isAnjab || !!nav.subItems?.length;

                return (
                    <li key={nav.name}>
                        {hasChildren ? (
                            <>
                                <button
                                    onClick={() =>
                                        setOpenSubmenu((prev) => {
                                            const same = prev?.type === menuType && prev.index === index;
                                            if (same) {
                                                setOpenNestedSubmenus({});
                                                return null;
                                            }
                                            setOpenNestedSubmenus({});
                                            return {type: menuType, index};
                                        })
                                    }
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                                        openSubmenu?.type === menuType && openSubmenu.index === index
                                            ? "bg-purple-50 text-purple-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                    } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
                                >
                                    <span className="flex-shrink-0">{nav.icon}</span>
                                    {(isExpanded || isHovered || isMobileOpen) && (
                                        <>
                                            <span className="flex-1 text-left leading-relaxed break-words hyphens-auto" style={{wordBreak: 'break-word'}}>
                                                {nav.name}
                                                {isAnjab && loadingAnjab && <span className="ml-2 text-xs text-gray-400">(loading…)</span>}
                                                {isAnjab && anjabError && <span className="ml-2 text-xs text-red-500">({anjabError})</span>}
                                            </span>
                                            <ChevronDownIcon
                                                className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${
                                                    openSubmenu?.type === menuType && openSubmenu.index === index ? "rotate-180 text-purple-600" : ""
                                                }`}
                                            />
                                        </>
                                    )}
                                </button>
                                <div
                                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                        openSubmenu?.type === menuType && openSubmenu.index === index
                                            ? "max-h-[50000px] opacity-100 scale-y-100"
                                            : "max-h-0 opacity-0 scale-y-95"
                                    }`}
                                >
                                    {isAnjab && loadingAnjab && (!nav.subItems || nav.subItems.length === 0) ? (
                                        <div className="ml-9 mt-2 text-xs text-gray-400">Memuat…</div>
                                    ) : (
                                        nav.subItems && renderSubItems(nav.subItems)
                                    )}
                                </div>
                            </>
                        ) : (
                            <Link
                                href={nav.path || "/"}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                                    isExactActive(nav.path)
                                        ? "bg-purple-50 text-purple-700 font-medium"
                                        : "text-gray-700 hover:bg-gray-50"
                                } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
                            >
                                <span className="flex-shrink-0">{nav.icon}</span>
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <span className="flex-1 text-left leading-relaxed break-words hyphens-auto" style={{wordBreak: 'break-word'}}>
                                        {nav.name}
                                    </span>
                                )}
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    useEffect(() => {
        const expandNested = (items: SubNavItem[]) => {
            items.forEach((item) => {
                const href = `/${(item.path || "").replace(/^\/+/, "")}`;
                if (pathname.startsWith(href)) {
                    setOpenNestedSubmenus((prev) => ({...prev, [item.path]: true}));
                }
                if (item.subItems) expandNested(item.subItems);
            });
        };

        (["main", "others"] as const).forEach((menuType) => {
            const items = menuType === "main" ? navItems : othersItems;
            items.forEach((nav, index) => {
                if (nav.subItems?.length) {
                    const active = (arr: SubNavItem[]): boolean =>
                        arr.some((i) => {
                            const href = `/${(i.path || "").replace(/^\/+/, "")}`;
                            return pathname.startsWith(href) || (i.subItems ? active(i.subItems) : false);
                        });

                    if (active(nav.subItems)) {
                        setOpenSubmenu({type: menuType, index});
                        expandNested(nav.subItems);
                    }
                }
            });
        });
    }, [pathname, anjabSubs]);

    useEffect(() => {
        if (!isAdmin || !anjabSubs.length) return;
        try {
            const seed = (nodes: SubNavItem[]) => {
                for (const n of nodes) {
                    const key = pathToSlug(n.path);
                    // Save jabatan_id if available, otherwise skip
                    if (n.jabatan_id) {
                        localStorage.setItem(key, n.jabatan_id);
                    }
                    if (n.subItems?.length) seed(n.subItems);
                }
            };
            seed(anjabSubs);
        } catch {
        }
    }, [isAdmin, anjabSubs]);

    if (meLoading) return null;

    return (
        <>
            <aside
                className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-4 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 ${
                    isExpanded || isMobileOpen ? "w-[380px]" : isHovered ? "w-[380px]" : "w-[90px]"
                } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
                onMouseEnter={() => !isExpanded && setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className="py-6 flex justify-center items-center flex-shrink-0">
                    <Link href="/" className="flex flex-col items-center">
                        {isExpanded || isHovered || isMobileOpen ? (
                            <>
                                <Image className="dark:hidden" src="/images/logo/pandawa-icon.png" alt="Logo" width={80} height={80}/>
                                <Image
                                    className="hidden dark:block"
                                    src="/images/logo/pandawa-icon.png"
                                    alt="Logo"
                                    width={80}
                                    height={80}
                                />
                                <div className="mt-3 text-center">
                                    <h1 className="text-lg font-bold text-gray-900 dark:text-white">PANDAWA</h1>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Portal Anjab dan ABK</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">Berbasis Web Terintegrasi</p>
                                </div>
                            </>
                        ) : (
                            <Image src="/images/logo/pandawa-icon.png" alt="Logo" width={40} height={40}/>
                        )}
                    </Link>
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <nav className="flex-1 overflow-y-scroll overflow-x-hidden px-2 sidebar-scrollbar">
                        <div className="flex flex-col pb-6">
                            <div>
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <h2 className="mb-3 px-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">
                                        MENU
                                    </h2>
                                )}
                                {renderMenuItems(navItems, "main")}
                            </div>
                        </div>
                    </nav>
                    
                    <div className="flex-shrink-0 px-4 pt-4 pb-6 flex justify-end border-t border-gray-200 dark:border-gray-700">
                        <Image
                            src="/images/logo/setjen.svg"
                            alt="Setjen DPD RI"
                            width={isExpanded || isHovered || isMobileOpen ? 60 : 40}
                            height={isExpanded || isHovered || isMobileOpen ? 60 : 40}
                            className="opacity-60"
                        />
                    </div>
                </div>
            </aside>

            {showEdit && editFor && (
                <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-lg max-h-[85vh] flex flex-col">
                        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-900">Edit Jabatan</h3>
                        </div>

                        <div className="px-5 py-4 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Nama</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={editName}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setEditName(v);
                                        }}
                                        placeholder="Masukkan nama jabatan"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Kode Penamaan Jabatan</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={editSlug}
                                        onChange={(e) => setEditSlug(toSlug(e.target.value))}
                                        placeholder="Contoh: pksti"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Kode unik untuk URL jabatan
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Unit Kerja</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={editUnitKerja}
                                        onChange={(e) => setEditUnitKerja(e.target.value)}
                                        placeholder="Opsional"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Pusat / Daerah</label>
                                    <CustomSelect
                                        value={editIsPusat}
                                        onChange={(val) => setEditIsPusat(val)}
                                        options={[
                                            { value: "true", label: "Pusat" },
                                            { value: "false", label: "Daerah" }
                                        ]}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Jenis Jabatan</label>
                                    <CustomSelect
                                        value={editJenisJabatan}
                                        onChange={(val) => setEditJenisJabatan(val)}
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

                                {/*<div>*/}
                                {/*    <label className="text-sm font-medium text-gray-700 block mb-1.5">Order index</label>*/}
                                {/*    <input*/}
                                {/*        type="number"*/}
                                {/*        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"*/}
                                {/*        value={editOrder}*/}
                                {/*        onChange={(e) => setEditOrder(e.target.value)}*/}
                                {/*        placeholder="Kosongkan untuk auto"*/}
                                {/*    />*/}
                                {/*</div>*/}

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Atasan</label>
                                    <CustomSelect
                                        value={editParentId}
                                        onChange={(val) => setEditParentId(val as any)}
                                        options={parentOptions.map((o) => ({
                                            value: String(o.id),
                                            label: o.label
                                        }))}
                                        placeholder="Pilih Atasan"
                                        searchable={true}
                                    />
                                    <p className="mt-1.5 text-xs text-gray-500">
                                        Memindahkan jabatan juga memindahkan seluruh jabatan dibawahnya.
                                    </p>
                                </div>
                            </div>

                            {saveErr && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveErr}</div>}
                        </div>

                        <div className="px-5 py-4 flex justify-end gap-2 border-t border-gray-100">
                            <button 
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors" 
                                onClick={() => setShowEdit(false)}
                            >
                                Batal
                            </button>
                            <button
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                disabled={saving}
                                onClick={submitEdit}
                            >
                                {saving ? "Menyimpan…" : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAdd && addParentFor && (
                <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-lg max-h-[85vh] flex flex-col">
                        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-900">Tambah Jabatan untuk: {addParentFor.name}</h3>
                        </div>

                        <div className="px-5 py-4 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Nama</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={addName}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setAddName(v);
                                            if (!slugTouched && v.trim()) {
                                                setAddSlug(toSlug(v));
                                            }
                                        }}
                                        autoFocus
                                        placeholder="Masukkan nama jabatan"
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
                                                        onClick={() => {
                                                            // Override dengan suggestions
                                                            setMatchedAnjab(null);
                                                        }}
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
                                                    onClick={() => {
                                                        setSelectedAnjabId(sug.id);
                                                    }}
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
                                                        onClick={() => {
                                                            setSelectedAnjabId(null);
                                                        }}
                                                        className="text-xs text-purple-700 hover:text-purple-900 underline font-medium"
                                                    >
                                                        Batal
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Kode Penamaan Jabatan</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={addSlug}
                                        onChange={(e) => {
                                            setAddSlug(toSlug(e.target.value));
                                            setSlugTouched(true);
                                        }}
                                        placeholder="Otomatis dari nama atau ketik manual"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Kode unik untuk URL jabatan
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Unit Kerja</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        value={addUnitKerja}
                                        onChange={(e) => setAddUnitKerja(e.target.value)}
                                        placeholder="Opsional"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Pusat / Daerah</label>
                                    <CustomSelect
                                        value={addIsPusat}
                                        onChange={(val) => setAddIsPusat(val)}
                                        options={[
                                            { value: "true", label: "Pusat" },
                                            { value: "false", label: "Daerah" }
                                        ]}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Jenis Jabatan</label>
                                    <CustomSelect
                                        value={addJenisJabatan}
                                        onChange={(val) => setAddJenisJabatan(val)}
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

                                {/*<div>*/}
                                {/*    <label className="text-sm font-medium text-gray-700 block mb-1.5">Order index</label>*/}
                                {/*    <input*/}
                                {/*        type="number"*/}
                                {/*        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"*/}
                                {/*        value={addOrder}*/}
                                {/*        onChange={(e) => setAddOrder(e.target.value)}*/}
                                {/*        placeholder="Kosongkan untuk auto"*/}
                                {/*    />*/}
                                {/*</div>*/}
                            </div>

                            {addErr && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addErr}</div>}
                        </div>

                        <div className="px-5 py-4 flex justify-end gap-2 border-t border-gray-100">
                            <button 
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors" 
                                onClick={() => setShowAdd(false)}
                            >
                                Batal
                            </button>
                            <button
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                disabled={adding}
                                onClick={submitAdd}
                            >
                                {adding ? "Menyimpan…" : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AppSidebar;