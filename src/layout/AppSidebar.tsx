"use client";

import React, {useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";

import {useSidebar} from "../context/SidebarContext";
import {GridIcon, ListIcon, ChevronDownIcon, HorizontaLDots, GroupIcon} from "../icons/index";
import SidebarWidget from "./SidebarWidget";
import {useMe} from "@/context/MeContext";
import {createPortal} from "react-dom";
import Swal from "sweetalert2";
import {apiFetch} from "@/lib/apiFetch";

// ⬇️ pakai komponen Select milikmu (lihat file Select di bawah)

/** ====== TIPE API (flat) ====== */
type APIRow = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja: string | null;
    level: number;
    order_index: number;
    // nilai baru dari API (pastikan GET sudah mengembalikan ini)
    is_pusat?: boolean;
    jenis_jabatan?: string | null;
};

/** ====== TIPE INTERNAL ====== */
type SubNavItem = {
    id: string;
    name: string;
    slug: string;
    unit_kerja?: string | null;
    path: string; // "anjab/<slug>/<child-slug>"
    subItems?: SubNavItem[];
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

    // ====== STATE data anjab ======
    const [anjabSubs, setAnjabSubs] = useState<SubNavItem[]>([]);
    const [loadingAnjab, setLoadingAnjab] = useState<boolean>(false);
    const [anjabError, setAnjabError] = useState<string | null>(null);

    // ====== STATE menu & dropdown ======
    const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
    const [openNestedSubmenus, setOpenNestedSubmenus] = useState<Record<string, boolean>>({});

    // ====== STATE: Edit modal ======
    const [showEdit, setShowEdit] = useState(false);
    const [editFor, setEditFor] = useState<SubNavItem | null>(null);
    const [editName, setEditName] = useState("");
    const [editSlug, setEditSlug] = useState("");
    const [editOrder, setEditOrder] = useState<string>("");
    const [editParentId, setEditParentId] = useState<string | "">("");
    const [editUnitKerja, setEditUnitKerja] = useState<string>("");

    // NEW: field baru
    const [editIsPusat, setEditIsPusat] = useState<string>("true");    // "true" | "false"
    const [editJenisJabatan, setEditJenisJabatan] = useState<string>(""); // "" | salah satu opsi

    const [parentOptions, setParentOptions] = useState<Array<{ id: string | ""; label: string }>>([]);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // ====== STATE: Add Child modal ======
    const [showAdd, setShowAdd] = useState(false);
    const [addParentFor, setAddParentFor] = useState<SubNavItem | null>(null);
    const [addName, setAddName] = useState("Unit Baru");
    const [addSlug, setAddSlug] = useState("unitbaru");
    const [addOrder, setAddOrder] = useState<string>("");
    const [addUnitKerja, setAddUnitKerja] = useState<string>("");

    // NEW: field baru
    const [addIsPusat, setAddIsPusat] = useState<string>("true");
    const [addJenisJabatan, setAddJenisJabatan] = useState<string>("");

    const [addErr, setAddErr] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [slugTouched, setSlugTouched] = useState(false);

    // ====== UTIL ======
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
        // urut per parent: order_index ASC, lalu nama ASC
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
            };
            if (subItems.length) base.subItems = subItems;
            return base;
        };
        const roots = children.get(null) || [];
        return roots.map((r) => buildNode(r, null));
    };

    // ====== LOCAL STORAGE HELPERS ======
    const pathSegments = (fullPath: string) =>
        fullPath.replace(/^anjab\/?/, "").replace(/^\/+/, "").split("/").filter(Boolean);

    const lastTwoDashFromPath = (fullPath: string) => {
        const segs = pathSegments(fullPath);
        const lastTwo = segs.slice(-2);
        return lastTwo.join("-");
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

    // ====== NAV items ======
    const navItems: NavItem[] = [
        {icon: <GridIcon/>, name: "Homepage", path: "/", subItems: []},
        {name: "Anjab", icon: <ListIcon/>, subItems: anjabSubs},
        {name: "Peta Jabatan", icon: <GroupIcon/>, path: "/peta-jabatan", subItems: []}
    ];
    const othersItems: NavItem[] = [];

    // ====== ACTIVE helpers ======
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

    // ====== DELETE ======
    const handleDeleteNode = async (node: SubNavItem) => {
        const resSwal = await Swal.fire({
            title: "Hapus Node?",
            html: `Hapus <b>${node.name}</b> beserta seluruh subtree? Tindakan ini tidak bisa dibatalkan.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Ya, hapus!",
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

    // ====== EDIT ======
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
            {id: "", label: "(Tanpa parent / Root)"},
            ...options,
        ];

        const current = flat.find((f) => f.id === currentId);
        const currentParent = current?.parent_id ?? "";
        const currentOrder = current?.order_index ?? "";
        const currentUnitKerja = current?.unit_kerja ?? "";

        // NEW: ambil default is_pusat & jenis_jabatan
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
                // NEW
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

        // NEW: konversi ke boolean + null
        const is_pusat = editIsPusat === "true" || editIsPusat === true;
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

            // (sisanya tetap persis seperti punyamu)
            try {
                const curNode = editFor && findNodeById(editFor.id, anjabSubs);
                if (curNode) {
                    const oldPath = curNode.path;
                    const oldKeySelf = `so:${lastTwoDashFromPath(oldPath)}`;

                    let parentPathNew = "anjab";
                    if (editParentId) {
                        const parentNode = findNodeById(String(editParentId), anjabSubs);
                        if (parentNode) parentPathNew = parentNode.path;
                    }
                    const newPath = `${parentPathNew}/${slug}`;
                    const newKeySelf = `so:${lastTwoDashFromPath(newPath)}`;

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
                        const oldDescPath = d.path;
                        const rel = oldDescPath.slice(oldPath.length);
                        const newDescPath = `${newPath}${rel}`;

                        const oldDescKey = `so:${lastTwoDashFromPath(oldDescPath)}`;
                        const newDescKey = `so:${lastTwoDashFromPath(newDescPath)}`;
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

    // ====== ADD CHILD ======
    const openAddModal = (parent: SubNavItem) => {
        setAddParentFor(parent);
        setAddErr(null);
        setAddName("Unit Baru");
        setAddSlug("unitbaru");
        setAddOrder("");
        setAddUnitKerja("");
        setAddIsPusat("true");
        setAddJenisJabatan("");
        setSlugTouched(false);
        setShowAdd(true);
    };

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

        const is_pusat = addIsPusat === "true" || addIsPusat === true;
        const jenis_jabatan = addJenisJabatan || null;

        const body: any = {parent_id, nama_jabatan, slug, unit_kerja, is_pusat, jenis_jabatan};
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

            // simpan mapping
            try {
                const newId: string | undefined = json?.node?.id;
                if (newId && addParentFor) {
                    const parentPath = addParentFor.path;
                    const newPath = `${parentPath}/${slug}`;
                    const key = `so:${lastTwoDashFromPath(newPath)}`;
                    localStorage.setItem(key, newId);
                }
            } catch {
            }

            setShowAdd(false);
            await loadData();
            await Swal.fire({icon: "success", title: "Child ditambah", timer: 1000, showConfirmButton: false});
        } catch (e: any) {
            setAddErr(e?.message || "Gagal menambah child.");
        } finally {
            setAdding(false);
        }
    }, [addParentFor, addName, addSlug, addOrder, addUnitKerja, addIsPusat, addJenisJabatan, loadData]);

    // ====== Node actions menu (⋯) ======
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
                    className="relative z-50 p-1 rounded hover:bg-gray-100 text-gray-500"
                    aria-label="Node actions"
                    title="Aksi"
                >
                    ⋯
                </button>

                {open &&
                    createPortal(
                        <div
                            ref={menuRef}
                            style={{position: "fixed", top: pos.top, left: pos.left, width: 176}}
                            className="rounded-xl border border-gray-200 bg-white shadow-lg z-[1000] text-sm overflow-hidden"
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
                                className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700"
                            >
                                Edit node
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
                                className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700"
                            >
                                Tambah child
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
                                className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50"
                            >
                                Hapus (beserta subtree)
                            </button>
                        </div>,
                        document.body
                    )}
            </>
        );
    };

    // ====== Renderers ======
    const renderSubItems = (subItems: SubNavItem[], level: number = 0) => (
        <ul className={`mt-2 space-y-1 ${level === 0 ? "ml-9" : "ml-4"}`}>
            {subItems.map((subItem) => {
                const hasSubItems = !!subItem.subItems?.length;
                const isNestedOpen = openNestedSubmenus[subItem.path];
                const href = `/${(subItem.path || "").replace(/^\/+/, "")}`;

                return (
                    <li key={`${subItem.path}-${subItem.id}`}>
                        {hasSubItems ? (
                            <div>
                                <div className="relative isolate flex items-center">
                                    <Link
                                        href={href}
                                        className={`relative z-0 flex-1 menu-dropdown-item ${
                                            isExactActive(subItem.path)
                                                ? "menu-dropdown-item-active bg-purple-100 text-purple-700 font-semibold"
                                                : "menu-dropdown-item-inactive"
                                        }`}
                                        title={subItem.unit_kerja || undefined}
                                    >
                                        {subItem.name}
                                    </Link>
                                    <button
                                        onClick={() => toggleNestedSubmenu(subItem.path)}
                                        className="ml-2 p-1 hover:bg-gray-100 rounded"
                                        aria-label="toggle"
                                        title="Expand/Collapse"
                                    >
                                        <ChevronDownIcon
                                            className={`w-4 h-4 transition-transform duration-300 ${isNestedOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                    <NodeActionsButton node={subItem}/>
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
                            <div className="relative isolate flex items-center">
                                <Link
                                    href={href}
                                    className={`relative z-0 flex-1 menu-dropdown-item ${
                                        isExactActive(subItem.path)
                                            ? "menu-dropdown-item-active bg-purple-100 text-purple-700 font-semibold"
                                            : "menu-dropdown-item-inactive"
                                    }`}
                                    title={subItem.unit_kerja || undefined}
                                >
                                    {subItem.name}
                                </Link>
                                <NodeActionsButton node={subItem}/>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
        <ul className="flex flex-col gap-4">
            {items.map((nav, index) => {
                const isAnjab = nav.name === "anjab";
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
                                    className={`menu-item group ${
                                        openSubmenu?.type === menuType && openSubmenu.index === index
                                            ? "menu-item-active bg-purple-100 text-purple-700 font-semibold"
                                            : "menu-item-inactive"
                                    } ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
                                >
                                    <span>{nav.icon}</span>
                                    {(isExpanded || isHovered || isMobileOpen) && (
                                        <>
                      <span className="menu-item-text">
                        {nav.name}
                          {isAnjab && loadingAnjab && <span className="ml-2 text-xs text-gray-400">(loading…)</span>}
                          {isAnjab && anjabError && <span className="ml-2 text-xs text-red-500">({anjabError})</span>}
                      </span>
                                            <ChevronDownIcon
                                                className={`ml-auto w-5 h-5 transition-transform duration-300 ${
                                                    openSubmenu?.type === menuType && openSubmenu.index === index ? "rotate-180 text-brand-500" : ""
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
                                className={`menu-item group ${
                                    isExactActive(nav.path)
                                        ? "menu-item-active bg-purple-100 text-purple-700 font-semibold"
                                        : "menu-item-inactive"
                                }`}
                            >
                                <span>{nav.icon}</span>
                                {(isExpanded || isHovered || isMobileOpen) &&
                                    <span className="menu-item-text">{nav.name}</span>}
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    // Auto-expand sesuai URL aktif
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

    // Seed mapping localStorage utk admin
    useEffect(() => {
        if (!isAdmin || !anjabSubs.length) return;
        try {
            const seed = (nodes: SubNavItem[]) => {
                for (const n of nodes) {
                    const key = `so:${lastTwoDashFromPath(n.path)}`;
                    localStorage.setItem(key, n.id);
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
                className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 ${
                    isExpanded || isMobileOpen ? "w-[350px]" : isHovered ? "w-[350px]" : "w-[90px]"
                } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
                onMouseEnter={() => !isExpanded && setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className={`py-8 flex ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                    <Link href="/">
                        {isExpanded || isHovered || isMobileOpen ? (
                            <>
                                <Image className="dark:hidden" src="/images/logo/full-logo.svg" alt="Logo" width={150}
                                       height={40}/>
                                <Image
                                    className="hidden dark:block"
                                    src="/images/logo/full-logo-white.svg"
                                    alt="Logo"
                                    width={150}
                                    height={40}
                                />
                            </>
                        ) : (
                            <Image src="/images/logo/setjen.svg" alt="Logo" width={32} height={32}/>
                        )}
                    </Link>
                </div>

                <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
                    <nav className="mb-6">
                        <div className="flex flex-col gap-4">
                            <div>
                                <h2
                                    className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                                        !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                                    }`}
                                >
                                    {isExpanded || isHovered || isMobileOpen ? "Menu" : <HorizontaLDots/>}
                                </h2>
                                {renderMenuItems(navItems, "main")}
                            </div>
                        </div>
                    </nav>
                    {(isExpanded || isHovered || isMobileOpen) && <SidebarWidget/>}
                </div>
            </aside>

            {/* ===== Modal Edit Node ===== */}
            {showEdit && editFor && (
                <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center">
                    {/* container diperpendek + scroll di isi */}
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col">
                        <div className="px-4 pt-4">
                            <h3 className="text-lg font-semibold">Edit Node</h3>
                        </div>

                        {/* isi form scrollable */}
                        <div className="px-4 pb-2 mt-3 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="text-sm block mb-1">Nama</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={editName}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setEditName(v);
                                            if (!editSlug) setEditSlug(toSlug(v));
                                        }}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Slug</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={editSlug}
                                        onChange={(e) => setEditSlug(toSlug(e.target.value))}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Unit Kerja</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={editUnitKerja}
                                        onChange={(e) => setEditUnitKerja(e.target.value)}
                                        placeholder="Opsional"
                                    />
                                </div>

                                {/* === NEW: Pusat / Daerah === */}
                                <div>
                                    <label className="text-sm block mb-1">Pusat / Daerah</label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={editIsPusat}
                                        onChange={(e) => setEditIsPusat(e.target.value)}
                                    >
                                        <option value="true">Pusat</option>
                                        <option value="false">Daerah</option>
                                    </select>
                                </div>

                                {/* === NEW: Jenis Jabatan === */}
                                <div>
                                    <label className="text-sm block mb-1">Jenis Jabatan</label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={editJenisJabatan}
                                        onChange={(e) => setEditJenisJabatan(e.target.value)}
                                    >
                                        <option value="">(Pilih Jenis Jabatan)</option>
                                        <option value="ESELON I">ESELON I</option>
                                        <option value="ESELON II">ESELON II</option>
                                        <option value="ESELON III">ESELON III</option>
                                        <option value="ESELON IV">ESELON IV</option>
                                        <option value="JABATAN FUNGSIONAL">JABATAN FUNGSIONAL</option>
                                        <option value="JABATAN PELAKSANA">JABATAN PELAKSANA</option>
                                        <option value="PEGAWAI DPK">PEGAWAI DPK</option>
                                        <option value="PEGAWAI CLTN">PEGAWAI CLTN</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Order index</label>
                                    <input
                                        type="number"
                                        className="w-full border rounded px-3 py-2"
                                        value={editOrder}
                                        onChange={(e) => setEditOrder(e.target.value)}
                                        placeholder="Kosongkan untuk auto"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Parent</label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={editParentId}
                                        onChange={(e) => setEditParentId(e.target.value as any)}
                                    >
                                        {parentOptions.map((o) => (
                                            <option key={String(o.id)} value={o.id as any}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Memindahkan node juga memindahkan seluruh subtree ke parent baru.
                                    </p>
                                </div>
                            </div>

                            {saveErr && <div className="mt-2 text-sm text-red-600">{saveErr}</div>}
                        </div>

                        {/* footer tetap terlihat */}
                        <div className="px-4 pb-4 mt-2 flex justify-end gap-2 border-t border-gray-100 pt-3">
                            <button className="px-3 py-1.5 rounded bg-gray-200" onClick={() => setShowEdit(false)}>
                                Batal
                            </button>
                            <button
                                className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
                                disabled={saving}
                                onClick={submitEdit}
                            >
                                {saving ? "Menyimpan…" : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal Tambah Child ===== */}
            {showAdd && addParentFor && (
                <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center">
                    {/* container diperpendek + scroll di isi */}
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-lg max-h-[80vh] flex flex-col">
                        <div className="px-4 pt-4">
                            <h3 className="text-lg font-semibold">Tambah Child untuk: {addParentFor.name}</h3>
                        </div>

                        {/* isi form scrollable */}
                        <div className="px-4 pb-2 mt-3 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="text-sm block mb-1">Nama</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={addName}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setAddName(v);
                                            if (!slugTouched) setAddSlug(toSlug(v));
                                        }}
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Slug</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={addSlug}
                                        onChange={(e) => {
                                            setAddSlug(toSlug(e.target.value));
                                            setSlugTouched(true);
                                        }}
                                        placeholder="mis. depmin-okk"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Unit Kerja</label>
                                    <input
                                        className="w-full border rounded px-3 py-2"
                                        value={addUnitKerja}
                                        onChange={(e) => setAddUnitKerja(e.target.value)}
                                        placeholder="Opsional"
                                    />
                                </div>

                                {/* === NEW: Pusat / Daerah === */}
                                <div>
                                    <label className="text-sm block mb-1">Pusat / Daerah</label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={addIsPusat}
                                        onChange={(e) => setAddIsPusat(e.target.value)}
                                    >
                                        <option value="true">Pusat</option>
                                        <option value="false">Daerah</option>
                                    </select>
                                </div>

                                {/* === NEW: Jenis Jabatan === */}
                                <div>
                                    <label className="text-sm block mb-1">Jenis Jabatan</label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={addJenisJabatan}
                                        onChange={(e) => setAddJenisJabatan(e.target.value)}
                                    >
                                        <option value="">(Pilih Jenis Jabatan)</option>
                                        <option value="ESELON I">ESELON I</option>
                                        <option value="ESELON II">ESELON II</option>
                                        <option value="ESELON III">ESELON III</option>
                                        <option value="ESELON IV">ESELON IV</option>
                                        <option value="JABATAN FUNGSIONAL">JABATAN FUNGSIONAL</option>
                                        <option value="JABATAN PELAKSANA">JABATAN PELAKSANA</option>
                                        <option value="PEGAWAI DPK">PEGAWAI DPK</option>
                                        <option value="PEGAWAI CLTN">PEGAWAI CLTN</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm block mb-1">Order index</label>
                                    <input
                                        type="number"
                                        className="w-full border rounded px-3 py-2"
                                        value={addOrder}
                                        onChange={(e) => setAddOrder(e.target.value)}
                                        placeholder="Kosongkan untuk auto"
                                    />
                                </div>
                            </div>

                            {addErr && <div className="mt-2 text-sm text-red-600">{addErr}</div>}
                        </div>

                        {/* footer tetap terlihat */}
                        <div className="px-4 pb-4 mt-2 flex justify-end gap-2 border-t border-gray-100 pt-3">
                            <button className="px-3 py-1.5 rounded bg-gray-200" onClick={() => setShowAdd(false)}>
                                Batal
                            </button>
                            <button
                                className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
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
