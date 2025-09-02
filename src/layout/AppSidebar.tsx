"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  GridIcon,
  ListIcon,
  PageIcon,
  ChevronDownIcon,
  HorizontaLDots,
} from "../icons/index";
import SidebarWidget from "./SidebarWidget";

type SubNavItem = {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
  subItems?: SubNavItem[];
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubNavItem[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Homepage",
    path: "/",
    subItems: [],
  },
  {
    name: "Anjab",
    icon: <ListIcon />,
    subItems: [
      {
        name: "Sekretariat Jenderal DPD RI",
        path: "Anjab/Setjen",
        subItems: [
          { name: "Inspektorat", path: "Anjab/Setjen/Inspektorat" },
          {
            name: "Deputi Bidang Administrasi",
            path: "Anjab/Setjen/Depmin",
            subItems: [
              {
                name: "Biro Organisasi, Keanggotaan, dan Kepegawaian",
                path: "Anjab/Setjen/Depmin/OKK",
                subItems: [
                  {
                    name: "Bagian Organisasi dan Ketatalaksanaan",
                    path: "Anjab/Setjen/Depmin/OKK/Ortala",
                    subItems: [
                      {
                        name: "Subbagian Organisasi",
                        path: "Anjab/Setjen/Depmin/OKK/Ortala/Organisasi",
                        subItems: [
                          {
                            name: "Penelaah Teknis Kebijakan",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/Organisasi/PTK",
                          },
                          {
                            name: "Penata Kelola Sistem dan Teknologi Informasi",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/Organisasi/PKSTI",
                          },
                        ]
                      },
                      {
                        name: "Subbagian Ketatalaksanaan",
                        path: "Anjab/Setjen/Depmin/OKK/Ortala/Tatalaksana",
                        subItems: [
                          {
                            name: "Penelaah Teknis Kebijakan",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/Tatalaksana/PTK",
                          },
                          {
                            name: "Pengolah Data dan Informasi",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/Tatalaksana/PDI",
                          },
                        ]
                      },
                      {
                        name: "Subbagian Fasilitasi Reformasi Birokrasi",
                        path: "Anjab/Setjen/Depmin/OKK/Ortala/RB",
                        subItems: [
                          {
                            name: "Penelaah Teknis Kebijakan",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/RB/PTK",
                          },
                          {
                            name: "Pengolah Data dan Informasi",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/RB/PDI",
                          },
                          {
                            name: "Pengadministrasi Perkantoran",
                            path: "Anjab/Setjen/Depmin/OKK/Ortala/RB/ADMK",
                          },
                        ]
                      }
                    ]
                  },
                  {
                    name: "Bagian Administrasi Keanggotaan dan Kepegawaian",
                    path: "Anjab/Setjen/Depmin/OKK/AKK",
                    subItems: [
                      {
                        name: "Subbagian Administrasi Keanggotaan",
                        path: "Anjab/Setjen/Depmin/OKK/AKK/Keanggotaan",
                      },
                      {
                        name: "Subbagian Administrasi Kepegawaian",
                        path: "Anjab/Setjen/Depmin/OKK/AKK/Kepegawaian",
                      },
                      {
                        name: "Subbagian Kesejahteraan",
                        path: "Anjab/Setjen/Depmin/OKK/AKK/Kesejahteraan",
                      }
                    ]
                  },
                  {
                    name: "Bagian Pengembangan Kapasitas Sumber Daya Manusia",
                    path: "Anjab/Setjen/Depmin/OKK/PSDM",
                    subItems: [
                      {
                        name: "Subbagian Pengembangan Kapasitas Sumber Daya Manusia",
                        path: "Anjab/Setjen/Depmin/OKK/PSDM/PKSDM",
                      },
                      {
                        name: "Subbagian Kerjasama",
                        path: "Anjab/Setjen/Depmin/OKK/PSDM/Kerjasama",
                      },
                      {
                        name: "Subbagian Fasilitasi Jabatan Fungsional",
                        path: "Anjab/Setjen/Depmin/OKK/PSDM/Jabfung",
                      }
                    ]
                  },
                  {
                    name: "Bagian Hukum",
                    path: "Anjab/Setjen/Depmin/OKK/Hukum",
                    subItems: [
                      {
                        name: "Subbagian Produk Hukum",
                        path: "Anjab/Setjen/Depmin/OKK/Hukum/Produk",
                      },
                      {
                        name: "Subbagian Penelaahan dan Bantuan Hukum",
                        path: "Anjab/Setjen/Depmin/OKK/PSDM/Telaahan",
                      }
                    ]
                  },
                ],
              },
            ],
          },
          { name: "Deputi Bidang Persidangan", path: "Anjab/Setjen/Depsid" },
        ]
      },
    ],
  },
  {
    name: "Document",
    icon: <PageIcon />,
    path: "/Document",
    subItems: [],
  },
];

const othersItems: NavItem[] = [];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
  const [openNestedSubmenus, setOpenNestedSubmenus] = useState<Record<string, boolean>>({});

  const resetAllSubmenus = () => {
    setOpenSubmenu(null);
    setOpenNestedSubmenus({});
  };

  const isActive = useCallback(
      (path: string) => pathname === path || pathname === `/${path.replace(/^\/+/, "")}`,
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

  const collapseNestedChildren = (path: string, items: SubNavItem[]) => {
    const closed: Record<string, boolean> = {};

    const walk = (subItems: SubNavItem[]) => {
      for (const item of subItems) {
        closed[item.path] = false;
        if (item.subItems) {
          walk(item.subItems);
        }
      }
    };

    const parent = findItemByPath(path, items);
    if (parent?.subItems) {
      walk(parent.subItems);
    }

    setOpenNestedSubmenus((prev) => {
      const next = { ...prev };
      for (const key in closed) {
        delete next[key];
      }
      return next;
    });
  };

  const toggleNestedSubmenu = (path: string) => {
    setOpenNestedSubmenus((prev) => {
      const next = { ...prev };
      const isOpen = !!next[path];
      if (isOpen) {
        delete next[path];
        collapseNestedChildren(path, navItems);
      } else {
        next[path] = true;
      }
      return next;
    });
  };

  const hasActiveSubItem = useCallback((items: SubNavItem[]): boolean => {
    return items.some((item) => {
      if (isActive(item.path)) return true;
      if (item.subItems) return hasActiveSubItem(item.subItems);
      return false;
    });
  }, [pathname]);

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

  const renderSubItems = (subItems: SubNavItem[], level: number = 0) => (
      <ul className={`mt-2 space-y-1 ${level === 0 ? "ml-9" : "ml-4"}`}>
        {subItems.map((subItem) => {
          const hasSubItems = subItem.subItems?.length;
          const isNestedOpen = openNestedSubmenus[subItem.path];

          return (
              <li key={subItem.name}>
                {hasSubItems ? (
                    <div>
                      <div className="flex items-center">
                        <Link
                            href={`/${subItem.path}`}
                            className={`flex-1 menu-dropdown-item ${
                                isActive(subItem.path)
                                    ? "menu-dropdown-item-active bg-purple-100 text-purple-700 font-semibold"
                                    : "menu-dropdown-item-inactive"
                            }`}
                        >
                          {subItem.name}
                        </Link>
                        <button
                            onClick={() => toggleNestedSubmenu(subItem.path)}
                            className="ml-2 p-1 hover:bg-gray-100 rounded"
                        >
                          <ChevronDownIcon
                              className={`w-4 h-4 transition-transform duration-300 ${
                                  isNestedOpen ? "rotate-180" : ""
                              }`}
                          />
                        </button>
                      </div>
                      <div
                          className={`transition-all duration-300 ease-in-out overflow-hidden ${
                              isNestedOpen
                                  ? "max-h-[50000px] opacity-100 scale-y-100"
                                  : "max-h-0 opacity-0 scale-y-95"
                          }`}
                      >
                        {renderSubItems(subItem.subItems ?? [], level + 1)}
                      </div>
                    </div>
                ) : (
                    <Link
                        href={`/${subItem.path}`}
                        className={`menu-dropdown-item ${
                            isActive(subItem.path)
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

  const renderMenuItems = (
      items: NavItem[],
      menuType: "main" | "others"
  ) => (
      <ul className="flex flex-col gap-4">
        {items.map((nav, index) => {
          const hasChildren = nav.subItems?.length;
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
                  <span className="">
                    {nav.icon}
                  </span>
                        {(isExpanded || isHovered || isMobileOpen) && (
                            <>
                              <span className="menu-item-text">{nav.name}</span>
                              <ChevronDownIcon
                                  className={`ml-auto w-5 h-5 transition-transform duration-300 ${
                                      openSubmenu?.type === menuType && openSubmenu.index === index
                                          ? "rotate-180 text-brand-500"
                                          : ""
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
                        {renderSubItems(nav.subItems!)}
                      </div>
                    </>
                ) : (
                    <Link
                        href={nav.path!}
                        onClick={() => {
                          if (nav.name !== "Anjab") {
                            resetAllSubmenus();
                            console.log(nav.path);
                          }
                        }}
                        className={`menu-item group ${
                            isActive(nav.path!)
                                ? "menu-item-active bg-purple-100 text-purple-700 font-semibold"
                                : "menu-item-inactive"
                        }`}
                    >
                      <span>{nav.icon}</span>
                      {(isExpanded || isHovered || isMobileOpen) && (
                          <span className="menu-item-text">{nav.name}</span>
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
        if (pathname.startsWith(`/${item.path}`)) {
          setOpenNestedSubmenus((prev) => ({ ...prev, [item.path]: true }));
        }
        if (item.subItems) expandNested(item.subItems);
      });
    };

    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems?.length) {
          const hasActive = hasActiveSubItem(nav.subItems);
          if (hasActive) {
            setOpenSubmenu({ type: menuType as "main" | "others", index });
            expandNested(nav.subItems);
          }
        }
      });
    });
  }, [pathname, hasActiveSubItem]);

  return (
      <aside
          className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 ${
              isExpanded || isMobileOpen
                  ? "w-[350px]"
                  : isHovered
                      ? "w-[350px]"
                      : "w-[90px]"
          } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
          onMouseEnter={() => !isExpanded && setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
      >
        <div
            className={`py-8 flex ${
                !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
            }`}
        >
          <Link href="/">
            {isExpanded || isHovered || isMobileOpen ? (
                <>
                  <Image
                      className="dark:hidden"
                      src="/images/logo/full-logo.svg"
                      alt="Logo"
                      width={150}
                      height={40}
                  />
                  <Image
                      className="hidden dark:block"
                      src="/images/logo/full-logo-white.svg"
                      alt="Logo"
                      width={150}
                      height={40}
                  />
                </>
            ) : (
                <Image
                    src="/images/logo/setjen.svg"
                    alt="Logo"
                    width={32}
                    height={32}
                />
            )}
          </Link>
        </div>

        <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
          <nav className="mb-6">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                }`}>
                  {isExpanded || isHovered || isMobileOpen ? "Menu" : <HorizontaLDots />}
                </h2>
                {renderMenuItems(navItems, "main")}
              </div>
              {othersItems.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-xs uppercase text-gray-400">Others</h2>
                    {renderMenuItems(othersItems, "others")}
                  </div>
              )}
            </div>
          </nav>
          {(isExpanded || isHovered || isMobileOpen) && <SidebarWidget />}
        </div>
      </aside>
  );
};

export default AppSidebar;
