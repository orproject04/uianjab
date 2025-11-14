"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SECTION_ORDER_SLUG as SECTION_ORDER, SECTION_LABELS_SLUG as SECTION_LABELS } from "../../_sections/registry";

export default function Layout({ children }: { children: React.ReactNode }) {
    const params = useParams() as { section: string; slug?: string[] };
    const pathname = usePathname();
    const router = useRouter();
    
    const rawSlug = useMemo(
        () => (Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : []),
        [params.slug]
    );
    const viewerPath = useMemo(() => rawSlug.join("/"), [rawSlug]);

    const currentIndex = SECTION_ORDER.indexOf(params.section as any);
    const prevSection = currentIndex > 0 ? SECTION_ORDER[currentIndex - 1] : null;
    const nextSection =
        currentIndex >= 0 && currentIndex < SECTION_ORDER.length - 1
            ? SECTION_ORDER[currentIndex + 1]
            : null;
    const isFirst = currentIndex <= 0;
    const isLast = currentIndex === SECTION_ORDER.length - 1;

    // Refs for tabs scrolling UX
    const tabsContainerRef = useRef<HTMLDivElement | null>(null);
    const activeTabRef = useRef<HTMLAnchorElement | null>(null);

    // Keep active tab centered when section changes
    useEffect(() => {
        const el = tabsContainerRef.current;
        const active = activeTabRef.current;
        if (!el || !active) return;
        const containerRect = el.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const current = el.scrollLeft + (activeRect.left - containerRect.left) - (containerRect.width / 2 - activeRect.width / 2);
        el.scrollTo({ left: current, behavior: "smooth" });
    }, [params.section]);

    // NOTE: sengaja tidak mengubah scroll horizontal saat user melakukan scroll vertikal,
    // agar tab tidak ikut "terscroll" saat halaman digulir.

    // Keyboard navigation: ArrowLeft/ArrowRight
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag && ["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
            if (e.key === "ArrowLeft" && prevSection) {
                e.preventDefault();
                router.push(`/anjab/edit/${prevSection}/${viewerPath}`);
            } else if (e.key === "ArrowRight" && nextSection) {
                e.preventDefault();
                router.push(`/anjab/edit/${nextSection}/${viewerPath}`);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [prevSection, nextSection, viewerPath, router]);

    return (
        <div className="space-y-4">
            {/* Konten section */}
            {children}
        </div>
    );
}

// Quick Jump Picker component (inline for simplicity)
function JumpPicker({ currentIndex, currentLabel, viewerPath }: { currentIndex: number; currentLabel: string; viewerPath: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                title="Klik untuk lompat ke bagian lain"
            >
                <span className="font-semibold">{currentIndex + 1}</span>
                <span className="text-purple-600 dark:text-purple-400">/</span>
                <span className="font-medium">{SECTION_ORDER.length}</span>
                <span className="hidden sm:inline text-purple-600 dark:text-purple-400 ml-1">• {currentLabel}</span>
                <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/>
                </svg>
            </button>
            {open && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-[min(90vw,680px)] max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-50">
                    <ul role="listbox" className="grid grid-cols-2 md:grid-cols-3 gap-1 p-2">
                        {SECTION_ORDER.map((sec, i) => {
                            const href = `/anjab/edit/${sec}/${viewerPath}`;
                            const active = i === currentIndex;
                            return (
                                <li key={sec}>
                                    <Link
                                        href={href}
                                        onClick={() => setOpen(false)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm border ${active ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-200 font-medium' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300'}`}
                                        role="option"
                                        aria-selected={active}
                                    >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                                            {i + 1}
                                        </span>
                                        <span className="truncate">{SECTION_LABELS[sec]}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
