import Link from "next/link";
import React, {useEffect, useState} from "react";
import {apiFetch} from "@/lib/apiFetch";
import {slugToTitle} from "@/lib/text-utils";

interface HierarchyNode {
    id: string;
    nama_jabatan: string;
    slug: string;
    level: number;
}

interface AnjabBreadcrumbProps {
    currentId: string;
    currentTitle?: string;
    rawSlug?: string[]; // Full slug path from params
}

const AnjabBreadcrumb: React.FC<AnjabBreadcrumbProps> = ({currentId, currentTitle, rawSlug}) => {
    const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadHierarchy() {
            if (!currentId) return;

            try {
                setLoading(true);
                setError(null);

                const res = await apiFetch(`/api/anjab/${encodeURIComponent(currentId)}/hierarchy`, {
                    method: "GET",
                    cache: "no-store",
                });

                if (!cancelled) {
                    if (res.ok) {
                        const data = await res.json();
                        setHierarchy(data || []);
                    } else {
                        // If API fails, try to build from slug segments
                        if (rawSlug && rawSlug.length > 0) {
                            const fallbackHierarchy = buildFallbackHierarchy(rawSlug);
                            setHierarchy(fallbackHierarchy);
                        }
                        setError("Failed to load hierarchy");
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    // If API fails, try to build from slug segments
                    if (rawSlug && rawSlug.length > 0) {
                        const fallbackHierarchy = buildFallbackHierarchy(rawSlug);
                        setHierarchy(fallbackHierarchy);
                    }
                    setError("Error loading hierarchy");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadHierarchy();

        return () => {
            cancelled = true;
        };
    }, [currentId, rawSlug]);

    // Build fallback hierarchy from slug segments
    function buildFallbackHierarchy(slugSegments: string[]): HierarchyNode[] {
        return slugSegments.map((segment, index) => ({
            id: slugSegments.slice(0, index + 1).join('/'),
            nama_jabatan: slugToTitle(segment),
            slug: slugSegments.slice(0, index + 1).join('/'),
            level: index,
        }));
    }

    if (loading) {
        return (
            <nav className="mb-4">
                <ol className="flex items-center gap-1.5 text-sm text-gray-500">
                    <li>Loading breadcrumb...</li>
                </ol>
            </nav>
        );
    }

    // If we have no hierarchy data but have rawSlug, use fallback
    if ((error || hierarchy.length === 0) && rawSlug && rawSlug.length > 0) {
        const fallbackHierarchy = buildFallbackHierarchy(rawSlug);
        
        return (
            <nav className="mb-4">
                <ol className="flex items-center gap-1.5 text-sm flex-wrap">
                    {/* Home link */}
                    <li>
                        <Link
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            href="/"
                        >
                            Home
                        </Link>
                    </li>

                    {/* Separator */}
                    <li className="text-gray-400">
                        <svg
                            className="stroke-current"
                            width="16"
                            height="16"
                            viewBox="0 0 17 16"
                            fill="none"
                        >
                            <path
                                d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                                stroke=""
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </li>

                    {/* Analisis Jabatan link */}
                    <li>
                        <Link
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            href="/anjab"
                        >
                            Analisis Jabatan
                        </Link>
                    </li>

                    {/* Fallback hierarchy items */}
                    {fallbackHierarchy.map((node, index) => {
                        const isLast = index === fallbackHierarchy.length - 1;
                        const href = `/anjab/${node.slug}`;

                        return (
                            <React.Fragment key={node.id}>
                                {/* Separator */}
                                <li className="text-gray-400">
                                    <svg
                                        className="stroke-current"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 17 16"
                                        fill="none"
                                    >
                                        <path
                                            d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                                            stroke=""
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </li>

                                {/* Breadcrumb item */}
                                <li>
                                    {isLast ? (
                                        <span className="text-gray-800 dark:text-white/90 font-medium">
                                            {node.nama_jabatan}
                                        </span>
                                    ) : (
                                        <Link
                                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            href={href}
                                        >
                                            {node.nama_jabatan}
                                        </Link>
                                    )}
                                </li>
                            </React.Fragment>
                        );
                    })}
                </ol>
            </nav>
        );
    }

    if (error || hierarchy.length === 0) {
        // Simple fallback when no data available
        return (
            <nav className="mb-4">
                <ol className="flex items-center gap-1.5 text-sm">
                    <li>
                        <Link
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            href="/"
                        >
                            Home
                        </Link>
                    </li>
                    <li className="text-gray-400">
                        <svg
                            className="stroke-current"
                            width="16"
                            height="16"
                            viewBox="0 0 17 16"
                            fill="none"
                        >
                            <path
                                d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                                stroke=""
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </li>
                    <li>
                        <Link
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            href="/anjab"
                        >
                            Analisis Jabatan
                        </Link>
                    </li>
                    {currentTitle && (
                        <>
                            <li className="text-gray-400">
                                <svg
                                    className="stroke-current"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 17 16"
                                    fill="none"
                                >
                                    <path
                                        d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                                        stroke=""
                                        strokeWidth="1.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </li>
                            <li className="text-gray-800 dark:text-white/90 font-medium">
                                {currentTitle}
                            </li>
                        </>
                    )}
                </ol>
            </nav>
        );
    }

    // Build breadcrumb from hierarchy
    return (
        <nav className="mb-4">
            <ol className="flex items-center gap-1.5 text-sm flex-wrap">
                {/* Home link */}
                <li>
                    <Link
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        href="/"
                    >
                        Home
                    </Link>
                </li>

                {/* Separator */}
                <li className="text-gray-400">
                    <svg
                        className="stroke-current"
                        width="16"
                        height="16"
                        viewBox="0 0 17 16"
                        fill="none"
                    >
                        <path
                            d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                            stroke=""
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </li>

                {/* Analisis Jabatan link */}
                <li>
                    <Link
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        href="/anjab"
                    >
                        Analisis Jabatan
                    </Link>
                </li>

                {/* Hierarchy items */}
                {hierarchy.map((node, index) => {
                    const isLast = index === hierarchy.length - 1;
                    // Build full path by joining all slugs from root to current node
                    const fullPath = hierarchy.slice(0, index + 1).map(n => n.slug).join('/');
                    const href = `/anjab/${fullPath}`;

                    return (
                        <React.Fragment key={node.id}>
                            {/* Separator */}
                            <li className="text-gray-400">
                                <svg
                                    className="stroke-current"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 17 16"
                                    fill="none"
                                >
                                    <path
                                        d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                                        stroke=""
                                        strokeWidth="1.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </li>

                            {/* Breadcrumb item */}
                            <li>
                                {isLast ? (
                                    <span className="text-gray-800 dark:text-white/90 font-medium">
                                        {node.nama_jabatan}
                                    </span>
                                ) : (
                                    <Link
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        href={href}
                                    >
                                        {node.nama_jabatan}
                                    </Link>
                                )}
                            </li>
                        </React.Fragment>
                    );
                })}
            </ol>
        </nav>
    );
};

export default AnjabBreadcrumb;