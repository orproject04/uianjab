// src/components/sidebar/AppSidebar.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";

import { useSidebar } from "../context/SidebarContext";
import { GridIcon, ListIcon, ChevronDownIcon, HorizontaLDots, GroupIcon } from "../icons/index";
import SidebarWidget from "./SidebarWidget";
import { useMe } from "@/context/MeContext";
import {apiFetch} from "@/lib/apiFetch";

/** ====== TIPE API (flat) ====== */
type APIRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  level: number;
  order_index: number;
};

/** ====== TIPE INTERNAL ====== */
type SubNavItem = {
  id: string;
  name: string;
  slug: string;
  path: string;                 // "Anjab/<slug>/<child-slug>"
  order_index: number;
  subItems?: SubNavItem[];
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubNavItem[];
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, loading: meLoading } = useMe();

  // ====== SLUGIFY (identik dgn halaman GoJS) ======
  const toSlug = (s: string) =>
      (s || "unit")
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 48) || "unit";

  // ====== STATE data anjab ======
  const [anjabSubs, setAnjabSubs] = useState<SubNavItem[]>([]);
  const [loadingAnjab, setLoadingAnjab] = useState<boolean>(false);
  const [anjabError, setAnjabError] = useState<string | null>(null);

  // ====== STATE menu ======
  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
  const [openNestedSubmenus, setOpenNestedSubmenus] = useState<Record<string, boolean>>({});

  /** ====== Build tree dari flat (slug chain) ====== */
  const buildTreeFromFlat = (rows: APIRow[]): SubNavItem[] => {
    const children = new Map<string | null, APIRow[]>();
    for (const r of rows) {
      const arr = children.get(r.parent_id) || [];
      arr.push(r);
      children.set(r.parent_id, arr);
    }
    const buildNode = (node: APIRow, parentPath: string | null): SubNavItem => {
      const path = parentPath ? `${parentPath}/${node.slug}` : `Anjab/${node.slug}`;
      const kids = children.get(node.id) || [];
      const subItems = kids.map((k) => buildNode(k, path));
      return subItems.length
          ? { id: node.id, name: node.name, slug: node.slug, path, order_index: node.order_index, subItems }
          : { id: node.id, name: node.name, slug: node.slug, path, order_index: node.order_index };
    };
    const roots = children.get(null) || [];
    return roots.map((r) => buildNode(r, null));
  };

  /** load data */
  const loadData = useCallback(async () => {
    setLoadingAnjab(true);
    setAnjabError(null);
    try {
      const res = await apiFetch("/api/struktur-organisasi", { cache: "no-store" });
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
    return () => { cancelled = true; };
  }, [loadData]);

  /** ====== NAV ITEMS ====== */
  const navItems: NavItem[] = [
    { icon: <GridIcon />, name: "Homepage", path: "/", subItems: [] },
    { name: "Anjab", icon: <ListIcon />, subItems: anjabSubs },
    ...(isAdmin ? [{ name: "Struktur Organisasi", icon: <GroupIcon />, path: "/StrukturOrganisasi", subItems: [] }] : []),
  ];
  const othersItems: NavItem[] = [];

  /** ====== ACTIVE HELPERS ====== */
  const isExactActive = useCallback((path?: string) => {
    if (!path) return false;
    const norm = `/${String(path).replace(/^\/+/, "")}`;
    return pathname === norm;
  }, [pathname]);

  const isDescendantActive = useCallback((path?: string) => {
    if (!path) return false;
    const norm = `/${String(path).replace(/^\/+/, "")}`;
    return pathname === norm || pathname.startsWith(norm + "/");
  }, [pathname]);

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
      const next = { ...prev };
      for (const key in closed) delete next[key];
      return next;
    });
  };

  const toggleNestedSubmenu = (path: string) => {
    if (!path) return;
    setOpenNestedSubmenus((prev) => {
      const next = { ...prev };
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
      return { type: menuType, index };
    });
  };

  /** ====== SweetAlert helper ====== */
  const swalLoading = (title = "Memproses…") =>
      Swal.fire({ title, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });

  /** ====== ACTIONS ====== */
  const handleEditNode = async (node: SubNavItem) => {
    const html = `
      <div class="swal2-stack">
        <label class="block text-left text-xs mb-1">Name</label>
        <input id="swal-name" class="swal2-input" placeholder="Name" value="${node.name.replace(/"/g, "&quot;")}">
        <label class="block text-left text-xs mb-1">Slug</label>
        <input id="swal-slug" class="swal2-input" placeholder="slug" value="${node.slug.replace(/"/g, "&quot;")}">
        <label class="block text-left text-xs mb-1">Order index</label>
        <input id="swal-order" type="number" min="0" class="swal2-input" placeholder="0" value="${node.order_index}">
      </div>
    `;

    let slugTouched = false;

    const res = await Swal.fire({
      title: "Edit node",
      html,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      didOpen: () => {
        const nameEl = document.getElementById("swal-name") as HTMLInputElement | null;
        const slugEl = document.getElementById("swal-slug") as HTMLInputElement | null;
        if (!nameEl || !slugEl) return;

        nameEl.addEventListener("input", () => {
          if (!slugTouched) slugEl.value = toSlug(nameEl.value);
        });
        slugEl.addEventListener("input", () => {
          slugTouched = true;
          slugEl.value = toSlug(slugEl.value);
        });
      },
      preConfirm: () => {
        const name = (document.getElementById("swal-name") as HTMLInputElement)?.value?.trim();
        const rawSlug = (document.getElementById("swal-slug") as HTMLInputElement)?.value?.trim();
        const orderStr = (document.getElementById("swal-order") as HTMLInputElement)?.value?.trim();
        const order_index = Number.isFinite(Number(orderStr)) ? Number(orderStr) : NaN;

        const slug = toSlug(rawSlug || name || "");

        if (!name) { Swal.showValidationMessage("Nama wajib diisi"); return; }
        if (!slug) { Swal.showValidationMessage("Slug wajib diisi"); return; }
        if (!Number.isFinite(order_index) || order_index < 0) {
          Swal.showValidationMessage("Order index harus angka ≥ 0");
          return;
        }
        return { name, slug, order_index };
      },
    });

    if (!res.isConfirmed || !res.value) return;
    const payload = res.value as { name: string; slug: string; order_index: number };

    swalLoading("Menyimpan…");
    try {
      const resp = await apiFetch(`/api/struktur-organisasi?id=${encodeURIComponent(node.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Gagal (${resp.status})`);
      await loadData();
      Swal.fire({ icon: "success", title: "Perubahan tersimpan", timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Gagal menyimpan", text: err?.message || "Terjadi kesalahan." });
    }
  };

  const handleAddChild = async (parent: SubNavItem) => {
    const html = `
      <div class="swal2-stack">
        <label class="block text-left text-xs mb-1">Name</label>
        <input id="swal-name" class="swal2-input" placeholder="Name" value="">
        <label class="block text-left text-xs mb-1">Slug</label>
        <input id="swal-slug" class="swal2-input" placeholder="slug" value="">
        <label class="block text-left text-xs mb-1">Order index</label>
        <input id="swal-order" type="number" min="0" class="swal2-input" placeholder="(kosong=auto)">
        <p class="text-xs text-gray-500 mt-2">Jika order index dikosongkan, backend akan otomatis mengisi ke posisi paling akhir.</p>
      </div>
    `;

    let slugTouched = false;

    const res = await Swal.fire({
      title: `Tambah child untuk "${parent.name}"`,
      html,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Tambah",
      cancelButtonText: "Batal",
      didOpen: () => {
        const nameEl = document.getElementById("swal-name") as HTMLInputElement | null;
        const slugEl = document.getElementById("swal-slug") as HTMLInputElement | null;
        if (!nameEl || !slugEl) return;

        nameEl.addEventListener("input", () => {
          if (!slugTouched) slugEl.value = toSlug(nameEl.value);
        });
        slugEl.addEventListener("input", () => {
          slugTouched = true;
          slugEl.value = toSlug(slugEl.value);
        });
      },
      preConfirm: () => {
        const name = (document.getElementById("swal-name") as HTMLInputElement)?.value?.trim();
        const rawSlug = (document.getElementById("swal-slug") as HTMLInputElement)?.value?.trim();
        const orderStr = (document.getElementById("swal-order") as HTMLInputElement)?.value?.trim();

        const slug = toSlug(rawSlug || name || "");
        const order_index = orderStr === "" ? null : Number(orderStr);

        if (!name) { Swal.showValidationMessage("Nama wajib diisi"); return; }
        if (!slug) { Swal.showValidationMessage("Slug wajib diisi"); return; }
        if (order_index !== null && (!Number.isFinite(order_index) || order_index < 0)) {
          Swal.showValidationMessage("Order index harus angka ≥ 0 atau kosongkan");
          return;
        }
        return { name, slug, order_index };
      },
    });

    if (!res.isConfirmed || !res.value) return;
    const payload = res.value as { name: string; slug: string; order_index: number | null };

    swalLoading("Menambah…");
    try {
      const resp = await apiFetch(`/api/struktur-organisasi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_id: parent.id,
          name: payload.name,
          slug: payload.slug,
          order_index: payload.order_index, // boleh null → backend auto last
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Gagal (${resp.status})`);

      await loadData();
      setOpenNestedSubmenus((prev) => ({ ...prev, [parent.path]: true }));
      Swal.fire({ icon: "success", title: "Child ditambahkan", timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Gagal menambah", text: err?.message || "Terjadi kesalahan." });
    }
  };

  const handleDeleteNode = async (node: SubNavItem) => {
    const resConfirm = await Swal.fire({
      title: "Hapus node ini?",
      html: `"<b>${node.name}</b>" beserta seluruh subtree akan dihapus.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#ef4444",
      focusCancel: true,
      reverseButtons: true,
    });
    if (!resConfirm.isConfirmed) return;

    swalLoading("Menghapus…");
    try {
      const resp = await apiFetch(`/api/struktur-organisasi?id=${encodeURIComponent(node.id)}`, { method: "DELETE" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Gagal (${resp.status})`);
      await loadData();
      Swal.fire({ icon: "success", title: "Berhasil dihapus", text: `${data?.deleted ?? 0} record terhapus.`, timer: 1400, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Gagal menghapus", text: err?.message || "Terjadi kesalahan." });
    }
  };

  /** ====== BTN ⋯ (portal + fixed) — hanya render jika admin ====== */
  const NodeActionsButton: React.FC<{ node: SubNavItem }> = ({ node }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

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

      setPos({ top, left });
    }, []);

    const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

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

    if (!isAdmin) return null; // ⬅️ inti: sembunyikan jika bukan admin

    return (
        <>
          <button
              ref={btnRef}
              type="button"
              onPointerDown={stop}
              onMouseDown={stop}
              onClick={(e) => { stop(e); setOpen(v => !v); }}
              className="relative z-50 p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Node actions"
              title="Aksi"
          >
            ⋯
          </button>

          {open && createPortal(
              <div
                  ref={menuRef}
                  style={{ position: "fixed", top: pos.top, left: pos.left, width: 176 }}
                  className="rounded-xl border border-gray-200 bg-white shadow-lg z-[1000] text-sm overflow-hidden"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
              >
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setOpen(false); handleEditNode(node); }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700"
                >
                  Edit node
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setOpen(false); handleAddChild(node); }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 hover:text-purple-700"
                >
                  Tambah child
                </button>
                <div className="h-px bg-gray-100" />
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setOpen(false); handleDeleteNode(node); }}
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

  /** ====== RENDERERS ====== */
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
                        >
                          {subItem.name}
                        </Link>
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleNestedSubmenu(subItem.path); }}
                            className="ml-2 p-1 hover:bg-gray-100 rounded"
                            aria-label="toggle"
                            title="Expand/Collapse"
                        >
                          <ChevronDownIcon
                              className={`w-4 h-4 transition-transform duration-300 ${isNestedOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isAdmin && <NodeActionsButton node={subItem} />}{/* ⬅️ hanya admin */}
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
                      >
                        {subItem.name}
                      </Link>
                      {isAdmin && <NodeActionsButton node={subItem} />}{/* ⬅️ hanya admin */}
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
          const isAnjab = nav.name === "Anjab";
          const hasChildren = isAnjab || !!nav.subItems?.length;

          return (
              <li key={nav.name}>
                {hasChildren ? (
                    <>
                      <button
                          onClick={() => setOpenSubmenu((prev) => {
                            const same = prev?.type === menuType && prev.index === index;
                            if (same) {
                              setOpenSubmenu(null);
                              setOpenNestedSubmenus({});
                              return null;
                            }
                            setOpenNestedSubmenus({});
                            return { type: menuType, index };
                          })}
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
                        onClick={() => {
                          if (nav.name !== "Anjab") {
                            setOpenSubmenu(null);
                            setOpenNestedSubmenus({});
                          }
                        }}
                        className={`menu-item group ${
                            isExactActive(nav.path)
                                ? "menu-item-active bg-purple-100 text-purple-700 font-semibold"
                                : "menu-item-inactive"
                        }`}
                    >
                      <span>{nav.icon}</span>
                      {(isExpanded || isHovered || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
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
          setOpenNestedSubmenus((prev) => ({ ...prev, [item.path]: true }));
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
            setOpenSubmenu({ type: menuType, index });
            expandNested(nav.subItems);
          }
        }
      });
    });
  }, [pathname, anjabSubs]);

  if (meLoading) return null;

  return (
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
                  <Image className="dark:hidden" src="/images/logo/full-logo.svg" alt="Logo" width={150} height={40} />
                  <Image className="hidden dark:block" src="/images/logo/full-logo-white.svg" alt="Logo" width={150} height={40} />
                </>
            ) : (
                <Image src="/images/logo/setjen.svg" alt="Logo" width={32} height={32} />
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
                  {isExpanded || isHovered || isMobileOpen ? "Menu" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(navItems, "main")}
              </div>
            </div>
          </nav>
          {(isExpanded || isHovered || isMobileOpen) && <SidebarWidget />}
        </div>
      </aside>
  );
};

export default AppSidebar;
