"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { GridIcon, ListIcon, PageIcon, ChevronDownIcon, HorizontaLDots } from "../icons/index";
import SidebarWidget from "./SidebarWidget";

type APINode = {
  name: string;
  path: string;        // contoh: "Anjab/setjen/depmin"
  subItems?: APINode[];
};

type SubNavItem = {
  name: string;
  path: string;
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

  // ====== AUTH via /api/me ======
  const [userRole, setUserRole] = useState<string>("user");
  const [meLoaded, setMeLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) throw new Error("unauthorized");
        const json = await res.json();
        if (!cancelled && json?.ok && json?.data) {
          setUserRole(json.data.role ?? "user");
        }
      } catch {
        // non-admin / belum login dianggap user (menu admin tersembunyi)
      } finally {
        if (!cancelled) setMeLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const isAdmin = userRole === "admin";

  // ====== STATE: menu Anjab dari API ======
  const [anjabSubs, setAnjabSubs] = useState<SubNavItem[]>([]);
  const [loadingAnjab, setLoadingAnjab] = useState<boolean>(false);
  const [anjabError, setAnjabError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingAnjab(true);
        setAnjabError(null);
        const res = await fetch("/api/struktur-organisasi?base=Anjab", { cache: "no-store" });
        if (!res.ok) throw new Error(`Gagal memuat Anjab (${res.status})`);
        const data: APINode[] | APINode = await res.json();
        const arr = Array.isArray(data) ? data : [data];

        const mapNode = (n: APINode): SubNavItem => ({
          name: n.name,
          path: n.path,
          subItems: n.subItems?.map(mapNode),
        });

        const mapped = arr.map(mapNode);
        if (!cancelled) setAnjabSubs(mapped);
      } catch (e: any) {
        if (!cancelled) setAnjabError(e?.message || "Gagal memuat Anjab");
      } finally {
        if (!cancelled) setLoadingAnjab(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ====== NAV ITEMS (Struktur Organisasi → hanya admin) ======
  const baseNav: NavItem[] = [
    { icon: <GridIcon />, name: "Homepage", path: "/", subItems: [] },
    { name: "Anjab", icon: <ListIcon />, subItems: anjabSubs },
  ];
  const adminOnlyNav: NavItem[] = isAdmin
      ? [{ name: "Struktur Organisasi", icon: <PageIcon />, path: "/StrukturOrganisasi", subItems: [] }]
      : [];
  const navItems: NavItem[] = [...baseNav, ...adminOnlyNav];
  const othersItems: NavItem[] = [];

  // ====== UI STATE ======
  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
  const [openNestedSubmenus, setOpenNestedSubmenus] = useState<Record<string, boolean>>({});

  const resetAllSubmenus = () => {
    setOpenSubmenu(null);
    setOpenNestedSubmenus({});
  };

  // ====== ACTIVE HELPERS ======
  const isExactActive = useCallback(
      (path?: string) => {
        if (!path) return false;
        const norm = `/${String(path).replace(/^\/+/, "")}`;
        return pathname === norm;
      },
      [pathname]
  );

  const isDescendantActive = useCallback(
      (path?: string) => {
        if (!path) return false;
        const norm = `/${String(path).replace(/^\/+/, "")}`;
        return pathname === norm || pathname.startsWith(norm + "/");
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

  const hasActiveSubItem = useCallback(
      (items: SubNavItem[]): boolean =>
          items.some((item) => isDescendantActive(item.path) || (item.subItems ? hasActiveSubItem(item.subItems) : false)),
      [pathname]
  );

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

  // ====== RENDERERS ======
  const renderSubItems = (subItems: SubNavItem[], level: number = 0) => (
      <ul className={`mt-2 space-y-1 ${level === 0 ? "ml-9" : "ml-4"}`}>
        {subItems.map((subItem) => {
          const hasSubItems = !!subItem.subItems?.length;
          const isNestedOpen = openNestedSubmenus[subItem.path];
          const href = `/${(subItem.path || "").replace(/^\/+/, "")}`;

          return (
              <li key={`${subItem.path}-${subItem.name}`}>
                {hasSubItems ? (
                    <div>
                      <div className="flex items-center">
                        <Link
                            href={href}
                            className={`flex-1 menu-dropdown-item ${
                                isExactActive(subItem.path)
                                    ? "menu-dropdown-item-active bg-purple-100 text-purple-700 font-semibold"
                                    : "menu-dropdown-item-inactive"
                            }`}
                        >
                          {subItem.name}
                        </Link>
                        <button
                            onClick={() => toggleNestedSubmenu(subItem.path)}
                            className="ml-2 p-1 hover:bg-gray-100 rounded"
                            aria-label="toggle"
                        >
                          <ChevronDownIcon
                              className={`w-4 h-4 transition-transform duration-300 ${isNestedOpen ? "rotate-180" : ""}`}
                          />
                        </button>
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
                    <Link
                        href={href}
                        className={`menu-dropdown-item ${
                            isExactActive(subItem.path)
                                ? "menu-dropdown-item-active bg-purple-100 text-purple-700 font-semibold"
                                : "menu-dropdown-item-inactive"
                        }`}
                    >
                      {subItem.name}
                    </Link>
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
                          onClick={() => handleSubmenuToggle(index, menuType)}
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
                          if (nav.name !== "Anjab") resetAllSubmenus();
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

  // ====== AUTO-EXPAND sesuai URL aktif ======
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

    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems?.length) {
          const active = (arr: SubNavItem[]): boolean =>
              arr.some((i) => {
                const href = `/${(i.path || "").replace(/^\/+/, "")}`;
                return pathname.startsWith(href) || (i.subItems ? active(i.subItems) : false);
              });

          if (active(nav.subItems)) {
            setOpenSubmenu({ type: menuType as "main" | "others", index });
            expandNested(nav.subItems);
          }
        }
      });
    });
  }, [pathname, anjabSubs]);

  // Opsional: sembunyikan sementara sampai /api/me selesai (biar tidak flicker)
  if (!meLoaded) {
    return null; // atau skeleton sidebar
  }

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
