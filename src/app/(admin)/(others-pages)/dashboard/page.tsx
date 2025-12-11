"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import Select from "react-select";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

type SummaryData = {
    total_jabatan: number;
    total_besetting: number;
    total_kebutuhan: number;
    total_selisih: number;
};

type BreakdownItem = {
    jenis?: string;
    lokasi?: string;
    unit_kerja?: string;
    nama_jabatan?: string;
    jenis_jabatan?: string;
    jumlah_jabatan: number;
    besetting: number;
    kebutuhan: number;
    selisih: number;
};

type DashboardData = {
    summary: SummaryData;
    byJenis: BreakdownItem[];
    byLokasi: BreakdownItem[];
    byBiro: BreakdownItem[];
    byNamaJabatan: BreakdownItem[];
    filters: {
        biroList: string[];
        jenisList: string[];
    };
};

const COLORS = ["#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [selectedBiro, setSelectedBiro] = useState<{ value: string; label: string } | null>(null);
    const [selectedJenis, setSelectedJenis] = useState<{ value: string; label: string } | null>(null);
    const [selectedLokasi, setSelectedLokasi] = useState<{ value: string; label: string } | null>(null);

    // Responsive YAxis width: mobile -> 150, desktop -> 220
    const [yAxisWidth, setYAxisWidth] = useState<number>(220);
    useEffect(() => {
        const setW = () => setYAxisWidth(typeof window !== 'undefined' && window.innerWidth < 640 ? 150 : 220);
        setW();
        window.addEventListener('resize', setW);
        return () => window.removeEventListener('resize', setW);
    }, []);

    useEffect(() => {
        loadData();
    }, [selectedBiro, selectedJenis, selectedLokasi]);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedBiro?.value) params.append("biro", selectedBiro.value);
            if (selectedJenis?.value) params.append("jenis_jabatan", selectedJenis.value);
            if (selectedLokasi?.value) params.append("lokasi", selectedLokasi.value);

            const res = await apiFetch(`/api/dashboard/jabatan?${params.toString()}`);
            if (!res.ok) {
                const j = await res.json().catch(() => null as any);
                const msg = j?.error || j?.message || `Failed to fetch dashboard data (${res.status})`;
                throw new Error(msg);
            }
            const json = await res.json();
            setData(json);
        } catch (e: any) {
            setError(e.message || "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Memuat data dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
                    <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Error</h3>
                    <p className="text-red-600 dark:text-red-300 text-sm">{error}</p>
                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={loadData}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Coba Lagi
                        </button>
                        {/^Unauthorized/i.test(error) && (
                            <a
                                href={`/signin?next=${encodeURIComponent('/dashboard')}`}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Login
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { summary, byJenis, byLokasi, byBiro, byNamaJabatan, filters } = data;

    // --- UI helpers ---
    // Sort `byJenis` in this order: Eselon 1,2,3,4, Jabatan Pelaksana, Jabatan Fungsional
    const jenisRank = (j?: string) => {
        if (!j) return 999;
        const s = j.toString().toLowerCase().trim();

        // Normalize common separators
        const norm = s.replace(/[\-|_/\\()\[\]:.,]/g, ' ');

        // Detect ASCII Roman numerals (i, ii, iii, iv) or Arabic digits 1-4
        const asciiMatch = norm.match(/eselon\s*(?:i{1,3}|iv|[1-4])\b/i);
        if (asciiMatch) {
            const token = asciiMatch[0].toLowerCase().replace(/^[^a-z0-9]+/i, '').replace(/^eselon\s*/i, '').trim();
            if (/^[1-4]$/.test(token)) return parseInt(token, 10);
            if (/^i{1,3}$/.test(token)) return token.length; // i ->1, ii->2, iii->3
            if (token === 'iv') return 4;
            return 5;
        }

        // Detect Unicode Roman numerals (e.g., Ⅰ Ⅱ Ⅲ Ⅳ)
        const uniMatch = norm.match(/eselon\s*([\u2160-\u2163])/i);
        if (uniMatch) {
            const ch = uniMatch[1];
            switch (ch) {
                case '\u2160': return 1; // Ⅰ
                case '\u2161': return 2; // Ⅱ
                case '\u2162': return 3; // Ⅲ
                case '\u2163': return 4; // Ⅳ
            }
        }

        // As a fallback, look for 'eselon' followed by any number (maybe with words between)
        const numMatch = norm.match(/eselon[^0-9A-Za-z]{0,5}([0-9])/i);
        if (numMatch) {
            const n = parseInt(numMatch[1], 10);
            if (n >= 1 && n <= 4) return n;
        }

        if (/pelaksana/i.test(norm)) return 6;
        if (/fungsional/i.test(norm)) return 7;
        return 998;
    };

    const sortedByJenis = [...byJenis].sort((a, b) => {
        const r = jenisRank(a.jenis) - jenisRank(b.jenis);
        if (r !== 0) return r;
        return (b.jumlah_jabatan || 0) - (a.jumlah_jabatan || 0);
    });

    

    

    // Convert filters to react-select format
    const biroOptions = filters.biroList.map((biro) => ({ value: biro, label: biro }));
    const jenisOptions = filters.jenisList.map((jenis) => ({ value: jenis, label: jenis }));
    const lokasiOptions = [
        { value: "pusat", label: "Pusat" },
        { value: "daerah", label: "Daerah" },
    ];

    // Custom YAxis tick renderer to wrap long unit names into multiple lines
    const renderYAxisTick = (props: any) => {
        const { x, y, payload } = props;
        const raw: string = String(payload?.value ?? "");

        // Max characters per line (try to break on spaces)
        const maxLen = 26;
        const words = raw.split(/\s+/);
        const lines: string[] = [];
        let current = "";
        for (const w of words) {
            if ((current + " " + w).trim().length <= maxLen) {
                current = (current + " " + w).trim();
            } else {
                if (current) lines.push(current);
                current = w;
            }
        }
        if (current) lines.push(current);

        // Limit to 3 lines, ellipsize the last line
        if (lines.length > 3) {
            const first = lines.slice(0, 2);
            let last = lines.slice(2).join(" ");
            if (last.length > maxLen) last = last.slice(0, maxLen - 3) + "...";
            lines.length = 0; lines.push(...first, last);
        }

        // Render with tspans; align to end so labels sit left of axis ticks
        const anchorX = x - 8; // slight padding from axis line
        return (
            <text x={anchorX} y={y} textAnchor="end" fontSize={11} fill="#374151">
                {lines.map((ln, i) => (
                    // first line offset slightly up, others stacked below
                    <tspan key={i} x={anchorX} dy={i === 0 ? -8 : 10}>
                        {ln}
                    </tspan>
                ))}
            </text>
        );
    };

    // Custom styles for react-select dark mode
    const selectStyles = {
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: 'var(--select-bg)',
            borderColor: state.isFocused ? '#8b5cf6' : 'var(--select-border)',
            borderRadius: '0.75rem',
            padding: '0.125rem',
            boxShadow: state.isFocused ? '0 0 0 2px rgba(139, 92, 246, 0.2)' : 'none',
            '&:hover': {
                borderColor: '#8b5cf6',
            },
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: 'var(--select-bg)',
            borderRadius: '0.75rem',
            border: '1px solid var(--select-border)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected
                ? '#8b5cf6'
                : state.isFocused
                    ? 'var(--select-hover)'
                    : 'transparent',
            color: state.isSelected ? 'white' : 'var(--select-text)',
            cursor: 'pointer',
            '&:active': {
                backgroundColor: '#7c3aed',
            },
        }),
        singleValue: (base: any) => ({
            ...base,
            color: 'var(--select-text)',
        }),
        input: (base: any) => ({
            ...base,
            color: 'var(--select-text)',
        }),
        placeholder: (base: any) => ({
            ...base,
            color: 'var(--select-placeholder)',
        }),
    };

    return (
        <div className="space-y-6 pb-8 overflow-x-hidden px-4 sm:px-0">
            <style jsx global>{`
                :root {
                    --select-bg: white;
                    --select-border: #d1d5db;
                    --select-hover: #f3f4f6;
                    --select-text: #111827;
                    --select-placeholder: #9ca3af;
                }
                .dark {
                    --select-bg: #374151;
                    --select-border: #4b5563;
                    --select-hover: #4b5563;
                    --select-text: #f9fafb;
                    --select-placeholder: #9ca3af;
                }
            `}</style>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mt-6 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Rekap Jabatan</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                Visualisasi dan analisis data jabatan
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={loadData}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Data
                </button>
            </div>

            {/* Filters */}
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter Data</h3>
                    {(selectedBiro || selectedJenis || selectedLokasi) && (
                        <span className="ml-auto text-xs px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium">
                            Filter Aktif
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            Unit Kerja / Biro
                        </label>
                        <Select
                            options={biroOptions}
                            value={selectedBiro}
                            onChange={setSelectedBiro}
                            styles={selectStyles}
                            placeholder="Semua Unit Kerja"
                            isClearable
                            className="react-select-container"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Jenis Jabatan
                        </label>
                        <Select
                            options={jenisOptions}
                            value={selectedJenis}
                            onChange={setSelectedJenis}
                            styles={selectStyles}
                            placeholder="Semua Jenis"
                            isClearable
                            className="react-select-container"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Lokasi
                        </label>
                        <Select
                            options={lokasiOptions}
                            value={selectedLokasi}
                            onChange={setSelectedLokasi}
                            styles={selectStyles}
                            placeholder="Semua Lokasi"
                            isClearable
                            className="react-select-container"
                        />
                    </div>
                    {(selectedBiro || selectedJenis || selectedLokasi) && (
                        <div className="flex items-end">
                            <button
                                onClick={() => {
                                    setSelectedBiro(null);
                                    setSelectedJenis(null);
                                    setSelectedLokasi(null);
                                }}
                                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all font-medium flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Reset Filter
                            </button>
                        </div>
                    )}
                </div>
            </div>


            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard
                    title="Total Jabatan"
                    value={summary.total_jabatan}
                    icon="📊"
                    color="bg-blue-500"
                    subtitle=""
                />
                <SummaryCard
                    title="Bezetting"
                    value={summary.total_besetting}
                    icon="👥"
                    color="bg-green-500"
                    subtitle=""
                />
                <SummaryCard
                    title="Kebutuhan"
                    value={summary.total_kebutuhan}
                    icon="🎯"
                    color="bg-purple-500"
                    subtitle=""
                />
                <SummaryCard
                    title="Selisih"
                    value={summary.total_selisih}
                    icon={summary.total_selisih >= 0 ? "📈" : "📉"}
                    color={summary.total_selisih >= 0 ? "bg-orange-500" : "bg-red-500"}
                    subtitle={summary.total_selisih >= 0 ? "" : ""}
                />
            </div>

            {/* Jabatan Breakdown Cards */}
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Total Per Jenis Jabatan</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Rincian jumlah untuk setiap jenis jabatan</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedByJenis.map((item, index) => (
                        <div
                            key={index}
                            className="bg-white dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                        {item.jenis}
                                    </h4>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {item.jumlah_jabatan}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">jabatan</span>
                                    </div>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm"
                                    style={{ backgroundColor: `${COLORS[index % COLORS.length]}20`, color: COLORS[index % COLORS.length] }}
                                >
                                    {index === 0 ? "👔" : index === 1 ? "🎓" : index === 2 ? "⚙️" : "📋"}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">Bezetting</span>
                                    <span className="font-semibold text-green-600 dark:text-green-400">
                                        {item.besetting.toLocaleString("id-ID")}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">Kebutuhan</span>
                                    <span className="font-semibold text-purple-600 dark:text-purple-400">
                                        {item.kebutuhan.toLocaleString("id-ID")}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200 dark:border-gray-600">
                                    <span className="text-gray-600 dark:text-gray-400">Selisih</span>
                                    <span className={`font-semibold ${
                                        item.selisih >= 0
                                            ? "text-orange-600 dark:text-orange-400"
                                            : "text-red-600 dark:text-red-400"
                                    }`}>
                                        {item.selisih >= 0 ? "+" : ""}{item.selisih.toLocaleString("id-ID")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart Row 2: Top Biro */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Top 10 Unit Kerja
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Berdasarkan Kebutuhan Pegawai</p>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={byBiro} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis
                            dataKey="unit_kerja"
                            type="category"
                            width={yAxisWidth}
                            tick={renderYAxisTick}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="besetting" fill="#10b981" name="Bezetting" radius={[0, 8, 8, 0]} />
                        <Bar dataKey="kebutuhan" fill="#8b5cf6" name="Kebutuhan" radius={[0, 8, 8, 0]} />
                        <Bar dataKey="selisih" fill="#f59e0b" name="Selisih" radius={[0, 8, 8, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>


            {/* Total Per Nama Jabatan */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Total Per Nama Jabatan
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total Jabatan berdasarkan kebutuhan pegawai</p>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full table-fixed">
                        <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-12">
                                No
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Nama Jabatan
                                </div>
                            </th>
                            
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Bezetting
                                </div>
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Kebutuhan
                                </div>
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                    Selisih
                                </div>
                            </th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {byNamaJabatan.map((item, index) => (
                            <tr
                                key={index}
                                className={`hover:bg-indigo-50 dark:hover:bg-gray-700/50 transition-colors ${
                                    index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/50'
                                }`}
                            >
                                <td className="px-3 py-3 whitespace-normal break-words text-center">
                                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                            {index + 1}
                                        </span>
                                </td>
                                <td className="px-3 py-3 break-words">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {item.nama_jabatan}
                                    </div>
                                </td>
                                
                                <td className="px-3 py-3 whitespace-normal break-words text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                            {item.besetting.toLocaleString("id-ID")}
                                        </span>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                                            {item.kebutuhan.toLocaleString("id-ID")}
                                        </span>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            item.selisih >= 0
                                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                        }`}>
                                            {item.selisih >= 0 ? '-' : ''}{item.selisih.toLocaleString("id-ID")}
                                        </span>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table: Detail Breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0a2 2 0 012 2v6a2 2 0 01-2 2m-6 0a2 2 0 002 2h2a2 2 0 002-2" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Detail Breakdown Per Unit Kerja
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Data lengkap semua unit kerja</p>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                        <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800">
                        <tr>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-12">
                                No
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    Unit Kerja
                                </div>
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Bezetting
                                </div>
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Kebutuhan
                                </div>
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                    Selisih
                                </div>
                            </th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {byBiro.map((item, index) => (
                            <tr
                                key={index}
                                className={`hover:bg-indigo-50 dark:hover:bg-gray-700/50 transition-colors ${
                                    index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/50'
                                }`}
                            >
                                <td className="px-3 py-3 whitespace-normal break-words text-center">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{index + 1}</span>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {item.unit_kerja}
                                    </div>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                            {item.besetting}
                                        </span>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                                            {item.kebutuhan}
                                        </span>
                                </td>
                                <td className="px-3 py-3 whitespace-normal break-words">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            item.selisih >= 0
                                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                        }`}>
                                            {item.selisih >= 0 ? '-' : ''}{item.selisih}
                                        </span>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({
                         title,
                         value,
                         icon,
                         color,
                         subtitle,
                     }: {
    title: string;
    value: number;
    icon: string;
    color: string;
    subtitle?: string;
}) {
    const gradientClasses: Record<string, string> = {
        "bg-blue-500": "from-blue-500 to-blue-600",
        "bg-green-500": "from-green-500 to-green-600",
        "bg-purple-500": "from-purple-500 to-purple-600",
        "bg-orange-500": "from-orange-500 to-orange-600",
        "bg-red-500": "from-red-500 to-red-600",
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${gradientClasses[color] || "from-gray-500 to-gray-600"} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
                    {icon}
                </div>
                {subtitle && (
                    <span className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                        {subtitle}
                    </span>
                )}
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                {value.toLocaleString("id-ID")}
            </p>
        </div>
    );
}