"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
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
      { name: "Deputi Persidangan", path: "Anjab/Depsid", pro: false },
      { 
        name: "Deputi Administrasi", 
        path: "Anjab/Depmin", 
        pro: false,
        subItems: [
          { name: "Umum", path: "Anjab/Depmin/Umum" },
          { name: "BPSI", path: "Anjab/Depmin/BPSI" },
          { 
            name: "OKK", 
            path: "Anjab/Depmin/OKK",
            subItems: [
              { name: "Ortala", path: "Anjab/Depmin/OKK/Ortala" },
              { name: "PSDM", path: "Anjab/Depmin/OKK/PSDM" },
            ]
          },
        ],
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

const othersItems: NavItem[] = [
  // Add items here if needed
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  
  const [openNestedSubmenus, setOpenNestedSubmenus] = useState<
    Record<string, boolean>
  >({});
  
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const toggleNestedSubmenu = (path: string) => {
    setOpenNestedSubmenus(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const renderSubItems = (subItems: SubNavItem[], level: number = 0) => (
    <ul className={`mt-2 space-y-1 ${level === 0 ? 'ml-9' : 'ml-4'}`}>
      {subItems.map((subItem) => {
        const hasSubItems = subItem.subItems && subItem.subItems.length > 0;
        const isNestedOpen = openNestedSubmenus[subItem.path];
        
        return (
          <li key={subItem.name}>
            {hasSubItems ? (
              <div>
                <div className="flex items-center">
                  <Link
                    href={subItem.path}
                    className={`flex-1 menu-dropdown-item ${
                      isActive(subItem.path)
                        ? "menu-dropdown-item-active"
                        : "menu-dropdown-item-inactive"
                    }`}
                  >
                    {subItem.name}
                    <span className="flex items-center gap-1 ml-auto">
                      {subItem.new && (
                        <span
                          className={`ml-auto ${
                            isActive(subItem.path)
                              ? "menu-dropdown-badge-active"
                              : "menu-dropdown-badge-inactive"
                          } menu-dropdown-badge`}
                        >
                          new
                        </span>
                      )}
                      {subItem.pro && (
                        <span
                          className={`ml-auto ${
                            isActive(subItem.path)
                              ? "menu-dropdown-badge-active"
                              : "menu-dropdown-badge-inactive"
                          } menu-dropdown-badge`}
                        >
                          pro
                        </span>
                      )}
                    </span>
                  </Link>
                  <button
                    onClick={() => toggleNestedSubmenu(subItem.path)}
                    className="ml-2 p-1 hover:bg-gray-100 rounded"
                  >
                    <ChevronDownIcon
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isNestedOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>
                {isNestedOpen && (
                  <div className="mt-2">
                    {renderSubItems(subItem.subItems ?? [], level + 1)}
                  </div>
                )}
              </div>
            ) : (
              <Link
                href={subItem.path}
                className={`menu-dropdown-item ${
                  isActive(subItem.path)
                    ? "menu-dropdown-item-active"
                    : "menu-dropdown-item-inactive"
                }`}
              >
                {subItem.name}
                <span className="flex items-center gap-1 ml-auto">
                  {subItem.new && (
                    <span
                      className={`ml-auto ${
                        isActive(subItem.path)
                          ? "menu-dropdown-badge-active"
                          : "menu-dropdown-badge-inactive"
                      } menu-dropdown-badge`}
                    >
                      new
                    </span>
                  )}
                  {subItem.pro && (
                    <span
                      className={`ml-auto ${
                        isActive(subItem.path)
                          ? "menu-dropdown-badge-active"
                          : "menu-dropdown-badge-inactive"
                      } menu-dropdown-badge`}
                    >
                      pro
                    </span>
                  )}
                </span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "main" | "others"
  ) => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems && nav.subItems.length > 0 ? (
            <>
              <button
                onClick={() => handleSubmenuToggle(index, menuType)}
                className={`menu-item group ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-active"
                    : "menu-item-inactive"
                } cursor-pointer ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "lg:justify-start"
                }`}
              >
                <span
                  className={`${
                    openSubmenu?.type === menuType && openSubmenu?.index === index
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
                {(isExpanded || isHovered || isMobileOpen) && (
                  <ChevronDownIcon
                    className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                      openSubmenu?.type === menuType &&
                      openSubmenu?.index === index
                        ? "rotate-180 text-brand-500"
                        : ""
                    }`}
                  />
                )}
              </button>
              {(isExpanded || isHovered || isMobileOpen) && (
                <div
                  ref={(el) => {
                    subMenuRefs.current[`${menuType}-${index}`] = el;
                  }}
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    height:
                      openSubmenu?.type === menuType && openSubmenu?.index === index
                        ? `${subMenuHeight[`${menuType}-${index}`]}px`
                        : "0px",
                  }}
                >
                  {renderSubItems(nav.subItems)}
                </div>
              )}
            </>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
        </li>
      ))}
    </ul>
  );

  // Auto-expand nested submenus based on current path
  useEffect(() => {
    const expandNestedMenus = (items: SubNavItem[], parentPath: string = "") => {
      items.forEach(item => {
        if (pathname.startsWith(item.path)) {
          setOpenNestedSubmenus(prev => ({
            ...prev,
            [item.path]: true
          }));
        }
        if (item.subItems) {
          expandNestedMenus(item.subItems, item.path);
        }
      });
    };

    // Check if the current path matches any submenu item
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems && nav.subItems.length > 0) {
          const hasActiveSubItem = (subitems: SubNavItem[]): boolean => {
            return subitems.some(subItem => {
              if (isActive(subItem.path)) return true;
              if (subItem.subItems) return hasActiveSubItem(subItem.subItems);
              return false;
            });
          };

          if (hasActiveSubItem(nav.subItems)) {
            setOpenSubmenu({
              type: menuType as "main" | "others",
              index,
            });
            submenuMatched = true;
            expandNestedMenus(nav.subItems);
          }
        }
      });
    });

    // If no submenu item matches, close the open submenu
    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [pathname, isActive]);

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu, openNestedSubmenus]);

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
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
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>

            {othersItems.length > 0 && (
              <div>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    "Others"
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
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