"use client";
import {ThemeToggleButton} from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import {useSidebar} from "@/context/SidebarContext";
import Image from "next/image";
import Link from "next/link";
import React, {useState, useEffect, useRef, useCallback} from "react";
import {useRouter} from "next/navigation";
import {apiFetch} from "@/lib/apiFetch";

/** ====== TIPE API (flat) ====== */
type APIRow = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja: string | null;
    level: number;
    order_index: number;
};

/** ====== TIPE RESULT SEARCH ====== */
type SearchItem = {
    id: string;
    name: string;
    unit_kerja: string | null;
    path: string; // "Anjab/<slug>/<child-slug>"
    searchable: string; // gabungan teks utk search cepat
};

const AppHeader: React.FC = () => {
    const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
    const {isMobileOpen, toggleSidebar, toggleMobileSidebar} = useSidebar();

    const router = useRouter();

    // ===== Search state =====
    const inputRef = useRef<HTMLInputElement>(null);
    const [allItems, setAllItems] = useState<SearchItem[]>([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [results, setResults] = useState<SearchItem[]>([]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<any>(null);

    // ===== Sidebar toggle =====
    const handleToggle = () => {
        if (window.innerWidth >= 1024) toggleSidebar();
        else toggleMobileSidebar();
    };

    const toggleApplicationMenu = () => {
        setApplicationMenuOpen((v) => !v);
    };

    // ===== Keyboard shortcut: ⌘K / Ctrl+K fokus search =====
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // ===== Click outside untuk menutup dropdown =====
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!containerRef.current) return;
            if (containerRef.current.contains(t)) return;
            setOpen(false);
            setActiveIdx(-1);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    // ===== Build path persis seperti Sidebar =====
    const buildItemsFromFlat = useCallback((rows: APIRow[]): SearchItem[] => {
        const byId = new Map<string, APIRow>();
        const children = new Map<string | null, APIRow[]>();
        for (const r of rows) {
            byId.set(r.id, r);
            const arr = children.get(r.parent_id) || [];
            arr.push(r);
            children.set(r.parent_id, arr);
        }
        // sort tiap sibling: order_index ASC, lalu nama ASC
        for (const [k, arr] of children.entries()) {
            arr.sort(
                (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
            );
            children.set(k, arr);
        }

        // fungsi membangun path "Anjab/a/b/c"
        const calcPath = (node: APIRow): string => {
            const segs: string[] = [];
            let cur: APIRow | undefined | null = node;
            while (cur) {
                segs.push(cur.slug);
                cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null;
            }
            segs.reverse();
            return `Anjab/${segs.join("/")}`;
        };

        const items: SearchItem[] = rows.map((r) => {
            const path = calcPath(r);
            const searchable = [
                r.nama_jabatan || "",
                r.unit_kerja || "",
                r.slug || "",
                path || "",
            ]
                .join(" ")
                .toLowerCase();
            return {
                id: r.id,
                name: r.nama_jabatan,
                unit_kerja: r.unit_kerja,
                path,
                searchable,
            };
        });

        return items;
    }, []);

    // ===== Load semua struktur sekali (saat fokus pertama kali / mount) =====
    const ensureLoaded = useCallback(async () => {
        if (allItems.length) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch("/api/struktur-organisasi", {cache: "no-store"});
            if (!res.ok) throw new Error(`Gagal memuat struktur (${res.status})`);
            const flat: APIRow[] = await res.json();
            const items = buildItemsFromFlat(flat);
            setAllItems(items);
        } catch (e: any) {
            setErr(e?.message || "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, [allItems.length, buildItemsFromFlat]);

    // auto-load saat komponen mount (boleh), dan juga saat input fokus
    useEffect(() => {
        void ensureLoaded();
    }, [ensureLoaded]);

    // ===== Filtering dengan debounce =====
    useEffect(() => {
        if (!open && q.length === 0) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const needle = q.trim().toLowerCase();
            if (!needle) {
                setResults(allItems.slice(0, 20));
                setActiveIdx(-1);
                return;
            }
            const filtered = allItems
                .filter((it) => it.searchable.includes(needle))
                .slice(0, 20);
            setResults(filtered);
            setActiveIdx(filtered.length ? 0 : -1);
        }, 120);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [q, open, allItems]);

    // ===== Enter navigasi =====
    const goToItem = (item: SearchItem) => {
        setOpen(false);
        setActiveIdx(-1);
        // path yang sama seperti sidebar → route ke `/${path}`
        const href = `/${item.path.replace(/^\/+/, "")}`;
        router.push(href);
    };

    // ===== Keyboard navigation di input =====
    const onKeyDownInput: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => {
                const ni = Math.min((results.length || 0) - 1, i + 1);
                return ni < 0 ? 0 : ni;
            });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIdx >= 0 && activeIdx < results.length) {
                goToItem(results[activeIdx]);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
            setActiveIdx(-1);
        }
    };

    return (
        <header
            className="sticky top-0 flex w-full bg-white border-gray-200 z-40 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
            <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
                <div
                    className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
                    <button
                        className="items-center justify-center w-10 h-10 text-gray-500 border-gray-200 rounded-lg z-99999 dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border"
                        onClick={handleToggle}
                        aria-label="Toggle Sidebar"
                    >
                        {isMobileOpen ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                                    fill="currentColor"
                                />
                            </svg>
                        ) : (
                            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                                    fill="currentColor"
                                />
                            </svg>
                        )}
                    </button>

                    <Link href="/" className="lg:hidden">
                        {/* Logo mobile jika diperlukan */}
                    </Link>

                    {/* Mobile: search + user dropdown */}
                    <div className="flex lg:hidden w-full items-center gap-3 ml-2" ref={containerRef}>
                        {/* Search mobile */}
                        <div className="flex-1 relative">
    <span className="absolute -translate-y-1/2 left-3 top-1/2 pointer-events-none">
      <svg className="fill-gray-500 dark:fill-gray-400" width="18" height="18" viewBox="0 0 20 20">
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
        />
      </svg>
    </span>

                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Cari Jabatan/Unit…"
                                className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                                value={q}
                                onFocus={() => {
                                    setOpen(true);
                                    void ensureLoaded();
                                }}
                                onChange={(e) => {
                                    setQ(e.target.value);
                                    setOpen(true);
                                }}
                                onKeyDown={onKeyDownInput}
                            />

                            {/* Dropdown hasil (mobile) */}
                            {open && (
                                <div
                                    className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                                    {loading ? (
                                        <div
                                            className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Memuat…</div>
                                    ) : err ? (
                                        <div className="px-3 py-2 text-sm text-red-600">{err}</div>
                                    ) : results.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Tidak ada
                                            hasil</div>
                                    ) : (
                                        <ul className="max-h-80 overflow-auto py-1">
                                            {results.map((it, idx) => {
                                                const href = `/${it.path.replace(/^\/+/, "")}`;
                                                const active = idx === activeIdx;
                                                return (
                                                    <li key={it.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => goToItem(it)}
                                                            className={`w-full text-left px-3 py-2 text-sm ${
                                                                active
                                                                    ? "bg-purple-50 text-purple-700 dark:bg-white/[0.06] dark:text-white"
                                                                    : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                                            }`}
                                                            onMouseEnter={() => setActiveIdx(idx)}
                                                        >
                                                            <div className="font-medium">{it.name}</div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {href} {it.unit_kerja ? `• ${it.unit_kerja}` : ""}
                                                            </div>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* User dropdown tetap di kanan */}
                        <div className="ml-auto">
                            <UserDropdown/>
                        </div>
                    </div>


                    {/* Desktop: search di kiri, dropdown di kanan */}
                    <div className="hidden lg:flex items-center justify-between w-full">
                        {/* Search */}
                        <div className="flex-1 max-w-[430px]" ref={containerRef}>
                            <div className="relative">
                <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                  {/* ikon search */}
                    <svg className="fill-gray-500 dark:fill-gray-400" width="20" height="20" viewBox="0 0 20 20">
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                    />
                  </svg>
                </span>

                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Cari Jabatan/Unit…"
                                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                                    value={q}
                                    onFocus={() => {
                                        setOpen(true);
                                        void ensureLoaded();
                                    }}
                                    onChange={(e) => {
                                        setQ(e.target.value);
                                        setOpen(true);
                                    }}
                                    onKeyDown={onKeyDownInput}
                                />

                                {/* shortcut hint */}
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-500 rounded-lg dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
                                    onMouseDown={(e) => e.preventDefault()}
                                >
                                    ⌘K
                                </button>

                                {/* Dropdown hasil */}
                                {open && (
                                    <div
                                        className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                                        {loading ? (
                                            <div
                                                className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Memuat…</div>
                                        ) : err ? (
                                            <div className="px-3 py-2 text-sm text-red-600">{err}</div>
                                        ) : results.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Tidak
                                                ada hasil</div>
                                        ) : (
                                            <ul className="max-h-80 overflow-auto py-1">
                                                {results.map((it, idx) => {
                                                    const href = `/${it.path.replace(/^\/+/, "")}`;
                                                    const active = idx === activeIdx;
                                                    return (
                                                        <li key={it.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => goToItem(it)}
                                                                className={`w-full text-left px-3 py-2 text-sm ${
                                                                    active
                                                                        ? "bg-purple-50 text-purple-700 dark:bg-white/[0.06] dark:text-white"
                                                                        : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                                                }`}
                                                                onMouseEnter={() => setActiveIdx(idx)}
                                                            >
                                                                <div className="font-medium">{it.name}</div>
                                                                <div className="text-[11px] text-gray-500">
                                                                    {href} {it.unit_kerja ? `• ${it.unit_kerja}` : ""}
                                                                </div>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* kanan */}
                        <div className="ml-auto">
                            <UserDropdown/>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default AppHeader;
