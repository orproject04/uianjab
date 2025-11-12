import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { slugToTitle } from "@/lib/text-utils";

interface JabatanInfo {
    id: string;
    kode_jabatan: string | null;
    nama_jabatan: string;
    ikhtisar_jabatan: string | null;
    kelas_jabatan: string | null;
    jenis_jabatan: string | null;
    slug: string | null;
}

interface JabatanInfoCardProps {
    currentId: string;
    className?: string;
    compact?: boolean; // New prop for compact mobile view
}

const JabatanInfoCard: React.FC<JabatanInfoCardProps> = ({
                                                             currentId,
                                                             className = "",
                                                             compact = false
                                                         }) => {
    const [jabatanInfo, setJabatanInfo] = useState<JabatanInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(!compact);

    useEffect(() => {
        let cancelled = false;

        async function loadJabatanInfo() {
            if (!currentId) return;

            try {
                setLoading(true);
                setError(null);

                const res = await apiFetch(`/api/anjab/${encodeURIComponent(currentId)}`, {
                    method: "GET",
                    cache: "no-store",
                });

                if (!cancelled) {
                    if (res.ok) {
                        const data = await res.json();
                        setJabatanInfo(data);
                    } else {
                        setError("Failed to load jabatan information");
                        setJabatanInfo(null);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError("Error loading jabatan information");
                    setJabatanInfo(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadJabatanInfo();

        return () => {
            cancelled = true;
        };
    }, [currentId]);

    if (loading) {
        return (
            <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6 ${className}`}>
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                    <div className="space-y-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        {!compact && <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !jabatanInfo) {
        // Fallback display using currentId
        const fallbackTitle = slugToTitle(currentId.replace(/-/g, " "));

        return (
            <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6 ${className}`}>
                <div className="space-y-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                            {fallbackTitle}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Informasi jabatan tidak dapat dimuat
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
            {/* Always visible header */}
            <div className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white break-words">
                            {jabatanInfo.nama_jabatan}
                        </h1>
                        {jabatanInfo.kode_jabatan && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                    Kode:
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    {jabatanInfo.kode_jabatan}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Badges */}
                        <div className="hidden md:flex flex-col gap-1">
                            {jabatanInfo.kelas_jabatan && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    {jabatanInfo.kelas_jabatan}
                                </span>
                            )}
                            {jabatanInfo.jenis_jabatan && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                    {jabatanInfo.jenis_jabatan}
                                </span>
                            )}
                        </div>

                        {/* Toggle button for compact mode */}
                        {compact && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <svg
                                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Expandable content */}
            {(!compact || isExpanded) && (
                <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                    {/* Mobile badges */}
                    <div className="flex flex-wrap gap-2 mb-4 md:hidden">
                        {jabatanInfo.kelas_jabatan && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                {jabatanInfo.kelas_jabatan}
                            </span>
                        )}
                        {jabatanInfo.jenis_jabatan && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                {jabatanInfo.jenis_jabatan}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    {jabatanInfo.ikhtisar_jabatan && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Ikhtisar Jabatan
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                {jabatanInfo.ikhtisar_jabatan}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default JabatanInfoCard;