"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Select from "react-select";
import { useMe } from "@/context/MeContext";
import {
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

type SummaryData = {
    total_jabatan: number;
    total_bezetting: number;
    total_kebutuhan: number;
    total_selisih: number;
    bezetting_pns: number;
    bezetting_pppk: number;
};

type BreakdownItem = {
    jenis?: string;
    lokasi?: string;
    unit_kerja?: string;
    nama_jabatan?: string;
    jenis_jabatan?: string;
    bezetting: number;
    kebutuhan: number;
    selisih: number;
};

type PegawaiInfo = {
    name: string;
    nip: string;
    role: string;
};

type PetaJabatanItem = {
    id: number;
    nama_jabatan: string;
    unit_kerja: string;
    jenis_jabatan: string;
    pejabat: PegawaiInfo[];
    bezetting: number;
    kebutuhan_pegawai: number;
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

type SummaryCardProps = {
    title: string;
    value: number;
    icon: string;
    color: string;
    subtitle?: string;
    breakdown?: { label: string; value: number }[];
};

const COLORS = ["#8FC54A", "#80C15D", "#6DB980", "#3CA8CD", "#48ADBC", "#83C7E8"];

export default function DashboardPage() {
    const { isAdmin, isAdminJf, loading: meLoading } = useMe();
    const router = useRouter();

    useEffect(() => {
        if (!meLoading && !(isAdmin || isAdminJf)) {
            router.replace("/");
        }
    }, [meLoading, isAdmin, isAdminJf, router]);
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // modal removed — jenis cards now act as filters
    const [sortField, setSortField] = useState<string>("");
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [searchNama, setSearchNama] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    // Overrides for kebutuhan khusus fungsional: key => `${nama}|||${unit}` -> string|number
    // We keep string here to allow empty-string during editing (so leading zero can be removed on focus)
    const [overrides, setOverrides] = useState<Record<string, string | number>>({});
    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const itemsPerPage = 100;

    // Filters
    const [selectedBiro, setSelectedBiro] = useState<{ value: string; label: string } | null>(null);
    const [selectedJenis, setSelectedJenis] = useState<{ value: string; label: string } | null>(null);
    const [selectedLokasi, setSelectedLokasi] = useState<{ value: string; label: string } | null>(null);
    const [expandedJenis, setExpandedJenis] = useState<string | null>(null);
    const [expandedSubJenis, setExpandedSubJenis] = useState<string | null>(null);

    // Responsive YAxis width: mobile -> 150, desktop -> 220
    const [yAxisWidth, setYAxisWidth] = useState<number>(220);
    // Responsive chart height: mobile smaller to avoid huge vertical overflow
    const [chartHeight, setChartHeight] = useState<number>(400);
    useEffect(() => {
        const setW = () => {
            const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
            setYAxisWidth(w < 640 ? 150 : 220);
            setChartHeight(w < 640 ? 260 : 400);
        };
        setW();
        window.addEventListener('resize', setW);
        return () => window.removeEventListener('resize', setW);
    }, []);

    const skipNextLoadRef = useRef(false);
    const lastFetchUrlRef = useRef<string | null>(null);
    const isInitialMount = useRef(true);

    useEffect(() => {
        // Skip on initial mount - let the role-based effect handle first load
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        if (skipNextLoadRef.current) {
            skipNextLoadRef.current = false;
            return;
        }

        // compute same URL as loadData to detect redundant fetches
        const params = new URLSearchParams();
        if (selectedBiro?.value) params.append("biro", selectedBiro.value);
        if (selectedJenis?.value) params.append("jenis_jabatan", selectedJenis.value);
        if (selectedLokasi?.value) params.append("lokasi", selectedLokasi.value);
        const url = `/api/dashboard/jabatan?${params.toString()}`;
        if (lastFetchUrlRef.current === url) return; // already fetched this exact URL
        loadData();
    }, [selectedBiro, selectedJenis, selectedLokasi]);

    // If current user is admin-jf, auto-select and restrict jenis filter to fungsional
    useEffect(() => {
        if (!isAdminJf) return;
        const list = (data?.filters?.jenisList || []);
        const found = list.find((j: string) => /fungsional/i.test(String(j || '')));
        if (!found) return;
        setSelectedJenis((prev) => {
            if (prev && /fungsional/i.test(String(prev.value || ''))) return prev;
            return { value: found, label: 'JABATAN FUNGSIONAL' };
        });
    }, [isAdminJf, data]);

    // Initial load after user authentication completes
    const hasLoadedOnce = useRef(false);
    useEffect(() => {
        if (meLoading) return; // wait until user info resolved
        if (hasLoadedOnce.current) return; // already loaded once

        // clear last fetch marker so the normal load effect doesn't skip the new load
        lastFetchUrlRef.current = null;
        hasLoadedOnce.current = true;
        // force reload without cache to ensure fresh summary data
        loadData(true).catch(() => { });
    }, [meLoading]);

    async function loadData(forceNoCache: boolean = false): Promise<DashboardData | null> {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedBiro?.value) params.append("biro", selectedBiro.value);
            if (selectedJenis?.value) params.append("jenis_jabatan", selectedJenis.value);
            if (selectedLokasi?.value) params.append("lokasi", selectedLokasi.value);

            const url = `/api/dashboard/jabatan?${params.toString()}`;
            const res = await apiFetch(url, forceNoCache ? { cache: 'no-store' } : undefined);
            if (!res.ok) {
                const j = await res.json().catch(() => null as any);
                const msg = j?.error || j?.message || `Failed to fetch dashboard data (${res.status})`;
                throw new Error(msg);
            }
            const json = await res.json();
            setData(json);
            lastFetchUrlRef.current = url;
            return json;
        } catch (e: any) {
            setError(e.message || "Gagal memuat data");
        } finally {
            setLoading(false);
        }
        return null;
    }

    if (meLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen no-print">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Memuat...</p>
                </div>
            </div>
        );
    }

    if (!(isAdmin || isAdminJf)) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md text-center">
                    <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Akses Ditolak</h3>
                    <p className="text-red-600 dark:text-red-300 text-sm">Halaman ini hanya dapat diakses oleh Admin</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen no-print">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
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
                            onClick={() => loadData()}
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



    // Handler to save overrides: collect overrides entries and call API
    async function handleSaveOverrides() {
        try {
            const edits: Array<{ nama_jabatan: string; unit_kerja: string; kebutuhan_khusus: number }> = [];
            for (const key of Object.keys(overrides)) {
                const [nama, unit] = key.split('|||');
                const raw = overrides[key];
                const num = raw === '' ? 0 : Number(raw);
                edits.push({ nama_jabatan: nama || '', unit_kerja: unit || '', kebutuhan_khusus: Number.isFinite(num) ? num : 0 });
            }
            if (!edits.length) return;
            // send to API
            // Prevent automatic effects from reloading data while we perform a controlled reload
            skipNextLoadRef.current = true;
            const res = await saveOverridesApi(edits);
            const j = await res.json().catch(() => ({}));
            if (!res.ok || j?.error) throw new Error(j?.error || `HTTP ${res.status}`);
            const newData = await loadData(true);
            // Ensure admin-jf keeps the jenis filter set to an actual fungsional value if available,
            // otherwise clear the filter to avoid showing an empty table.
            if (isAdminJf) {
                const list = newData?.filters?.jenisList || [];
                const found = list.find((jj: string) => /fungsional/i.test(String(jj || '')));
                // Prevent the selectedJenis change from triggering another automatic loadData()
                skipNextLoadRef.current = true;
                if (found) {
                    setSelectedJenis({ value: found, label: 'JABATAN FUNGSIONAL' });
                } else {
                    setSelectedJenis(null);
                }
            }
            setOverrides({});
            setUnsavedChanges(false);
            console.log('Perubahan kebutuhan fungsional telah disimpan.');
        } catch (err: any) {
            console.error('Gagal menyimpan overrides:', err);
        }
    }

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
        // Sort by kebutuhan if same rank
        return (b.kebutuhan || 0) - (a.kebutuhan || 0);
    });

    // For admin-jf users, show only a single aggregated "JABATAN FUNGSIONAL" card
    const displayByJenis = (isAdminJf)
        ? (() => {
            const fRows = sortedByJenis.filter((r) => /fungsional/i.test(String(r.jenis || '')));
            const agg = {
                jenis: 'JABATAN FUNGSIONAL',
                jumlah_jabatan: fRows.reduce((s, r) => s + (Number((r as any).jumlah_jabatan) || 0), 0),
                bezetting: fRows.reduce((s, r) => s + (Number((r as any).bezetting) || 0), 0),
                kebutuhan: fRows.reduce((s, r) => s + (Number((r as any).kebutuhan) || 0), 0),
                selisih: fRows.reduce((s, r) => s + (Number((r as any).selisih) || 0), 0),
            } as any;
            return [agg];
        })()
        : sortedByJenis;

    // Dedupe by (nama_jabatan, unit_kerja) to avoid exact duplicate rows
    const dedupeByNamaUnitMap: Record<string, BreakdownItem> = {};
    for (const item of byNamaJabatan) {
        const nama = String(item.nama_jabatan || '').trim();
        const unit = String(item.unit_kerja || '').trim();
        const key = `${nama}|||${unit}`;
        if (!nama) continue;
        if (!dedupeByNamaUnitMap[key]) {
            // keep the first occurrence (preserve original per-row behavior)
            dedupeByNamaUnitMap[key] = { ...item, display_label: `${nama} — ${unit || 'Unit Tidak Diketahui'}` } as any;
        }
        // if duplicate exact pair appears later, ignore it
    }
    const dedupedByNamaJabatan = Object.values(dedupeByNamaUnitMap) as Array<BreakdownItem & { display_label?: string }>;

    // Prepare sortable data for Total Per Nama Jabatan
    const getSortedByNama = () => {
        const arr = [...byNamaJabatan];
        const field = sortField;

        // If no sort field is set, return original order from API
        if (!field) {
            return arr;
        }

        const dir = sortDir === 'desc' ? -1 : 1;
        arr.sort((a: any, b: any) => {
            const va = (a as any)[field];
            const vb = (b as any)[field];
            if (field === 'nama_jabatan' || field === 'unit_kerja') {
                return (String(va || '').localeCompare(String(vb || ''))) * dir;
            }
            // numeric
            const na = Number(va ?? 0);
            const nb = Number(vb ?? 0);
            if (na === nb) return 0;
            return (na - nb) * dir;
        });
        return arr;
    };

    const sortedNamaJabatan = getSortedByNama();
    const displayedNamaJabatan = sortedNamaJabatan.filter((it: any) => {
        if (!searchNama) return true;
        return String(it.nama_jabatan || '').toLowerCase().includes(searchNama.toLowerCase());
    });

    const totalPages = Math.max(1, Math.ceil(displayedNamaJabatan.length / itemsPerPage));
    if (currentPage > totalPages) setCurrentPage(totalPages);
    const currentPageItems = displayedNamaJabatan.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    const maxPageButtons = 3;
    const halfWindow = Math.floor(maxPageButtons / 2);
    let startPage = Math.max(1, currentPage - halfWindow);
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    if (endPage - startPage + 1 < maxPageButtons) {
        startPage = Math.max(1, endPage - maxPageButtons + 1);
    }
    const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
    const showLeftEllipsis = startPage > 1;
    const showRightEllipsis = endPage < totalPages;

    // Prepare Top-10 datasets for charts (positive uses selisih, negative uses absolute selisih)
    const topPositive = dedupedByNamaJabatan
        .filter(d => d.selisih > 0)
        .sort((a, b) => (b.selisih || 0) - (a.selisih || 0))
        .slice(0, 10)
        .map(d => ({ ...d, display_label: d.display_label || `${d.nama_jabatan} — ${d.unit_kerja}` }));

    const topNegative = dedupedByNamaJabatan
        .filter(d => d.selisih < 0)
        .sort((a, b) => (a.selisih || 0) - (b.selisih || 0))
        .slice(0, 10)
        .map(d => ({ ...d, abs_selisih: Math.abs(d.selisih || 0), display_label: d.display_label || `${d.nama_jabatan} — ${d.unit_kerja}` }));

    function toggleSort(field: string) {
        if (sortField === field) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    // Prepare and trigger print using hidden iframe approach
    function handlePrintTotalJabatan() {
        try {
            // Use the full filtered & sorted dataset (not only current page)
            const rows = getSortedByNama().filter((it: any) => {
                if (!searchNama) return true;
                return String(it.nama_jabatan || '').toLowerCase().includes(searchNama.toLowerCase());
            });

            const filterLines: string[] = [];
            if (selectedBiro?.value) filterLines.push(`Biro: ${selectedBiro.label}`);
            if (selectedJenis?.value) filterLines.push(`Jenis: ${selectedJenis.label}`);
            if (selectedLokasi?.value) filterLines.push(`Lokasi: ${selectedLokasi.label}`);
            if (searchNama) filterLines.push(`Cari: ${searchNama}`);

            // Build complete HTML document
            let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Total Jabatan - Print</title>
    <style>
        @page { margin: 1cm; size: A4 portrait; }
        body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
        h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: bold; }
        p { margin: 0 0 10px 0; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; border: 1px solid #000; }
        thead { display: table-header-group; }
        tbody { display: table-row-group; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid #000; padding: 4px; text-align: left; }
        th { background: #f0f0f0; text-align: center; padding: 5px; font-weight: bold; }
        td.center { text-align: center; }
        td.right { text-align: right; }
        .total-row { background: #f0f0f0; font-weight: bold; }
        .footer { margin: 10px 0 0 0; font-size: 9px; color: #666; }
    </style>
</head>
<body>
    <h2>Total Jabatan</h2>`;

            if (filterLines.length > 0) {
                html += `    <p><strong>Filter aktif:</strong> ${filterLines.join(' | ')}</p>`;
            }

            html += `    <table>
        <thead>
            <tr>
                <th>No</th>
                <th>Jabatan</th>
                <th>Unit Kerja</th>
                <th>Kelas Jabatan</th>
                <th>Bezetting</th>
                <th>Kebutuhan</th>
                <th>Selisih</th>
            </tr>
        </thead>
        <tbody>`;

            let totalBezetting = 0;
            let totalKebutuhan = 0;
            let totalSelisih = 0;

            rows.forEach((r: any, i: number) => {
                const bezVal = Number(r.bezetting ?? 0);
                const kebVal = Number(r.kebutuhan ?? 0);
                const selVal = Number(r.selisih ?? 0);

                totalBezetting += bezVal;
                totalKebutuhan += kebVal;
                totalSelisih += selVal;

                const bez = bezVal.toLocaleString('id-ID');
                const keb = kebVal.toLocaleString('id-ID');
                const sel = selVal.toLocaleString('id-ID');
                const nama = String(r.nama_jabatan || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const unit = String(r.unit_kerja || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const kelas = String(r.kelas_jabatan || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                html += `            <tr>
                <td class="center">${i + 1}</td>
                <td>${nama}</td>
                <td>${unit}</td>
                <td class="center">${kelas}</td>
                <td class="right">${bez}</td>
                <td class="right">${keb}</td>
                <td class="right">${sel}</td>
            </tr>`;
            });

            html += `            <tr class="total-row">
                <td colspan="4" class="center">TOTAL</td>
                <td class="right">${totalBezetting.toLocaleString('id-ID')}</td>
                <td class="right">${totalKebutuhan.toLocaleString('id-ID')}</td>
                <td class="right">${totalSelisih.toLocaleString('id-ID')}</td>
            </tr>
        </tbody>
    </table>
    <p class="footer">Generated: ${new Date().toLocaleString('id-ID')}</p>
</body>
</html>`;

            // Create or reuse hidden iframe
            let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'print-iframe';
                iframe.style.position = 'absolute';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';
                iframe.style.visibility = 'hidden';
                document.body.appendChild(iframe);
            }

            // Write content to iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
                iframeDoc.open();
                iframeDoc.write(html);
                iframeDoc.close();

                // Wait for content to load then print
                iframe.onload = () => {
                    setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                    }, 100);
                };
            }
        } catch (err) {
            console.error('Print failed', err);
            alert('Gagal memulai print.');
        }
    }

    // Print function for Total Per Jenis Jabatan using hidden iframe approach
    function handlePrintJenisJabatan() {
        try {
            // Use the displayByJenis data (already filtered and sorted)
            const rows = displayByJenis;

            const filterLines: string[] = [];
            if (selectedBiro?.value) filterLines.push(`Biro: ${selectedBiro.label}`);
            if (selectedJenis?.value) filterLines.push(`Jenis: ${selectedJenis.label}`);
            if (selectedLokasi?.value) filterLines.push(`Lokasi: ${selectedLokasi.label}`);

            // Build complete HTML document
            let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Total Per Jenis Jabatan - Print</title>
    <style>
        @page { margin: 1cm; size: A4 portrait; }
        body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
        h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: bold; }
        p { margin: 0 0 10px 0; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; border: 1px solid #000; }
        thead { display: table-header-group; }
        tbody { display: table-row-group; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid #000; padding: 4px; text-align: left; }
        th { background: #f0f0f0; text-align: center; padding: 5px; font-weight: bold; }
        td.center { text-align: center; }
        td.right { text-align: right; }
        .total-row { background: #f0f0f0; font-weight: bold; }
        .footer { margin: 10px 0 0 0; font-size: 9px; color: #666; }
    </style>
</head>
<body>
    <h2>Total Per Jenis Jabatan</h2>`;

            if (filterLines.length > 0) {
                html += `    <p><strong>Filter aktif:</strong> ${filterLines.join(' | ')}</p>`;
            }

            html += `    <table>
        <thead>
            <tr>
                <th>No</th>
                <th>Jenis Jabatan</th>
                <th>Total Jenis Jabatan</th>
                <th>Bezetting</th>
                <th>Kebutuhan</th>
                <th>Selisih</th>
            </tr>
        </thead>
        <tbody>`;

            let totalJenisJabatan = 0;
            let totalBezetting = 0;
            let totalKebutuhan = 0;
            let totalSelisih = 0;

            rows.forEach((r: any, i: number) => {
                const jumlahVal = Number((r as any).jumlah_jabatan ?? 0);
                const bezVal = Number(r.bezetting ?? 0);
                const kebVal = Number(r.kebutuhan ?? 0);
                const selVal = Number(r.selisih ?? 0);

                totalJenisJabatan += jumlahVal;
                totalBezetting += bezVal;
                totalKebutuhan += kebVal;
                totalSelisih += selVal;

                const jumlah = jumlahVal.toLocaleString('id-ID');
                const bez = bezVal.toLocaleString('id-ID');
                const keb = kebVal.toLocaleString('id-ID');
                const sel = selVal.toLocaleString('id-ID');
                const jenis = String(r.jenis || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                html += `            <tr>
                <td class="center">${i + 1}</td>
                <td>${jenis}</td>
                <td class="right">${jumlah}</td>
                <td class="right">${bez}</td>
                <td class="right">${keb}</td>
                <td class="right">${sel}</td>
            </tr>`;
            });

            html += `            <tr class="total-row">
                <td colspan="2" class="center">TOTAL</td>
                <td class="right">${totalJenisJabatan.toLocaleString('id-ID')}</td>
                <td class="right">${totalBezetting.toLocaleString('id-ID')}</td>
                <td class="right">${totalKebutuhan.toLocaleString('id-ID')}</td>
                <td class="right">${totalSelisih.toLocaleString('id-ID')}</td>
            </tr>
        </tbody>
    </table>
    <p class="footer">Generated: ${new Date().toLocaleString('id-ID')}</p>
</body>
</html>`;

            // Create or reuse hidden iframe
            let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'print-iframe';
                iframe.style.position = 'absolute';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';
                iframe.style.visibility = 'hidden';
                document.body.appendChild(iframe);
            }

            // Write content to iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
                iframeDoc.open();
                iframeDoc.write(html);
                iframeDoc.close();

                // Wait for content to load then print
                iframe.onload = () => {
                    setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                    }, 100);
                };
            }
        } catch (err) {
            console.error('Print failed', err);
            alert('Gagal memulai print.');
        }
    }





    // Convert filters to react-select format
    const biroOptions = (isAdminJf)
        ? filters.biroList
            .filter((biro) => /^\s*Biro\b/i.test(String(biro || '')))
            .map((biro) => ({ value: biro, label: biro }))
        : filters.biroList.map((biro) => ({ value: biro, label: biro }));
    const jenisOptions = (isAdminJf)
        ? (() => {
            // Restrict to a single fungsional option for admin-jf only if the API provides one.
            const found = (filters.jenisList || []).find((j: string) => /fungsional/i.test(String(j || '')));
            if (found) return [{ value: found, label: 'JABATAN FUNGSIONAL' }];
            return [] as { value: string; label: string }[];
        })()
        : filters.jenisList.map((jenis) => ({ value: jenis, label: jenis }));
    const lokasiOptions = [
        { value: "pusat", label: "Pusat" },
        { value: "daerah", label: "Daerah" },
    ];

    // Custom YAxis tick renderer to wrap long unit names into multiple lines
    const renderYAxisTick = (props: any) => {
        const { x, y, payload } = props;
        const raw: string = String(payload?.value ?? "");
        // If Y axis value is a combined display_label like "Nama Jabatan — Unit",
        // only show the Nama Jabatan part on the axis.
        const labelSource = raw.includes(' — ') ? raw.split(' — ')[0] : raw;

        // Max characters per line (try to break on spaces) — increased to allow longer words
        const maxLen = 36;
        const words = String(labelSource).split(/\s+/);
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

        // Limit to 4 lines, ellipsize the last line if still too long
        if (lines.length > 4) {
            const first = lines.slice(0, 3);
            let last = lines.slice(3).join(" ");
            if (last.length > maxLen) last = last.slice(0, maxLen - 3) + "...";
            lines.length = 0; lines.push(...first, last);
        }

        // Render with tspans; center the multi-line label around the tick (so text sits centered
        // vertically relative to the grid line). Compute a start offset based on line gap.
        const anchorX = x - 4; // slight padding from axis line
        const lineGap = 11; // px between lines
        // Use SVG dominantBaseline='middle' so the whole text block centers on the tick y coordinate.
        // First tspan stays at dy=0, subsequent lines shift by lineGap.
        return (
            <text x={anchorX} y={y} textAnchor="end" fontSize={10} fill="#374151" dominantBaseline="middle">
                {lines.map((ln, i) => (
                    <tspan key={i} x={anchorX} dy={i === 0 ? 0 : lineGap}>
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
            borderColor: state.isFocused ? 'var(--select-border)' : 'var(--select-border)',
            borderRadius: '0.75rem',
            padding: '0.125rem',
            boxShadow: 'none',
            '&:hover': {
                borderColor: 'var(--select-border)',
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
            backgroundColor: state.isFocused
                ? 'var(--select-hover)'
                : 'transparent',
            color: 'var(--select-text)',
            cursor: 'pointer',
            '&:active': {
                backgroundColor: 'var(--select-hover)',
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
        <>
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

            <div className="space-y-6 pb-8 px-4 sm:px-0">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mt-6 mb-2">
                            <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
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
                        onClick={() => loadData()}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl hover:from-brand-700 hover:to-brand-800 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Data
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900/30 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter Data</h3>
                        {(selectedBiro || selectedJenis || selectedLokasi) && (
                            <span className="ml-auto text-xs px-2.5 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full font-medium">
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
                        {!isAdminJf && (
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
                        )}
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
                        {!isAdminJf && (selectedBiro || selectedJenis || selectedLokasi) && (
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
                        title="Total Jenis Jabatan"
                        value={summary.total_jabatan}
                        icon="📊"
                        color="bg-blue-500"
                    />
                    <SummaryCard
                        title="Bezetting"
                        value={summary.total_bezetting}
                        icon="👥"
                        color="bg-green-500"
                        breakdown={[
                            { label: 'PNS', value: summary.bezetting_pns || 0 },
                            { label: 'PPPK', value: summary.bezetting_pppk || 0 }
                        ]}
                    />
                    <SummaryCard
                        title="Kebutuhan"
                        value={summary.total_kebutuhan}
                        icon="🎯"
                        color="bg-blue-light-500"
                    />
                    <SummaryCard
                        title="Selisih"
                        value={summary.total_selisih}
                        icon={summary.total_selisih >= 0 ? "📈" : "📉"}
                        color={summary.total_selisih >= 0 ? "bg-orange-500" : "bg-red-500"}
                    />
                </div>

                {/* Jabatan Breakdown Cards */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Total Per Jenis Jabatan</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Rincian jumlah untuk setiap jenis jabatan</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {selectedJenis && !isAdminJf && (
                                <button
                                    onClick={() => setSelectedJenis(null)}
                                    className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    Reset Filter
                                </button>
                            )}
                            <button
                                onClick={handlePrintJenisJabatan}
                                className="px-3 py-2 rounded-lg text-sm transition-colors flex-shrink-0 bg-brand-600 text-white hover:bg-brand-700"
                                title="Print tabel Total Per Jenis Jabatan"
                            >
                                Print
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-flow-row-dense">
                        {displayByJenis.map((item, index) => {
                            // Use API-provided deduped jumlah_jabatan when available;
                            // fallback to deduping by nama_jabatan in byNamaJabatan
                            const jumlahJabatan = Number((item as any).jumlah_jabatan ?? (() => {
                                const set = new Set<string>();
                                for (const j of byNamaJabatan) {
                                    if ((j.jenis_jabatan || '') === (item.jenis || '')) {
                                        const name = String(j.nama_jabatan || '').trim().toLowerCase();
                                        if (name) set.add(name);
                                    }
                                }
                                return set.size;
                            })());

                            // Split jenis on '/' to show secondary label on a second line
                            const jenisParts = String(item.jenis || '').split('/').map(s => s.trim()).filter(Boolean);

                            const isExpandable = /pelaksana|fungsional/i.test(item.jenis || '');
                            const isExpanded = expandedJenis === item.jenis;

                            let details: any[] = [];
                            if (isExpanded) {
                                const map: Record<string, { nama: string; bezetting: number; kebutuhan: number; selisih: number; subItems: any[] }> = {};
                                for (const d of byNamaJabatan) {
                                    if ((d.jenis_jabatan || '') !== item.jenis) continue;
                                    let baseNama = String(d.nama_jabatan || '').trim();
                                    const originalNama = baseNama;
                                    const isFungsional = /fungsional/i.test(item.jenis || '');

                                    if (isFungsional) {
                                        baseNama = baseNama.replace(/\s+(?:ahli\s+pertama|ahli\s+muda|ahli\s+madya|ahli\s+utama|pertama|muda|madya|utama|pelaksana\s+lanjutan|pelaksana|penyelia|terampil|mahir)(?:\s*\([^)]*\))?$/i, '').trim();
                                    }
                                    if (!baseNama) continue;
                                    const key = baseNama.toLowerCase();
                                    if (!map[key]) map[key] = { nama: baseNama, bezetting: 0, kebutuhan: 0, selisih: 0, subItems: [] };
                                    map[key].bezetting += Number(d.bezetting || 0);
                                    map[key].kebutuhan += Number(d.kebutuhan || 0);
                                    map[key].selisih += Number(d.selisih || 0);

                                    if (isFungsional) {
                                        const subKey = originalNama.toLowerCase();
                                        const existingSub = map[key].subItems.find(s => s.originalNama.toLowerCase() === subKey);
                                        if (existingSub) {
                                            existingSub.bezetting += Number(d.bezetting || 0);
                                            existingSub.kebutuhan += Number(d.kebutuhan || 0);
                                            existingSub.selisih += Number(d.selisih || 0);
                                        } else {
                                            map[key].subItems.push({
                                                originalNama,
                                                bezetting: Number(d.bezetting || 0),
                                                kebutuhan: Number(d.kebutuhan || 0),
                                                selisih: Number(d.selisih || 0)
                                            });
                                        }
                                    }
                                }
                                details = Object.values(map).sort((a: any, b: any) => a.nama.localeCompare(b.nama, 'id'));
                                details.forEach(d => {
                                    if (d.subItems) {
                                        d.subItems.sort((a: any, b: any) => a.originalNama.localeCompare(b.originalNama, 'id'));
                                    }
                                });
                            }

                            return (
                                <Fragment key={index}>
                                    <div className={`relative group flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl transition-all ${isExpanded ? 'ring-2 ring-brand-500 border-brand-500 shadow-md' : ''}`}>
                                        <div className="flex-1 w-full flex flex-col bg-gradient-to-br from-brand-100/60 to-blue-light-100/60 dark:bg-gray-700/50 rounded-xl p-4 border-2 border-transparent hover:border-white shadow-sm hover:shadow-lg transition-all duration-200 group-hover:-translate-y-0.5 relative z-10">
                                            <button
                                                onClick={() => {
                                                    // Set the Jenis filter (behaves like the Jenis dropdown)
                                                    setSelectedJenis({ value: item.jenis || '', label: item.jenis || '' });
                                                }}
                                                className="w-full text-left outline-none cursor-pointer flex-1 flex flex-col"
                                            >
                                                <div className="flex items-start justify-between mb-3 w-full">
                                                    <div className="flex-1 mr-2">
                                                        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                            {jenisParts[0]}
                                                            {jenisParts.length > 1 && (
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                                    {jenisParts.slice(1).join(' / ')}
                                                                </div>
                                                            )}
                                                        </h4>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                                                {jumlahJabatan}
                                                            </span>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">jabatan</span>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className="w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center text-xl shadow-sm"
                                                        style={{ backgroundColor: `${COLORS[index % COLORS.length]}20`, color: COLORS[index % COLORS.length] }}
                                                    >
                                                        {index === 0 ? "👔" : index === 1 ? "🎓" : index === 2 ? "💼" : index === 3 ? "⚙️" : index === 4 ? "📋" : "🖥️"}
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 mt-auto w-full">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-600 dark:text-gray-400">Bezetting</span>
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {(item.bezetting ?? 0).toLocaleString("id-ID")}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-600 dark:text-gray-400">Kebutuhan</span>
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {(item.kebutuhan ?? 0).toLocaleString("id-ID")}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200 dark:border-gray-600">
                                                        <span className="text-gray-600 dark:text-gray-400">Selisih</span>
                                                        <span className={`font-semibold ${(item.selisih === 0)
                                                            ? 'text-green-600 dark:text-green-400'
                                                            : (item.selisih > 0)
                                                                ? 'text-red-600 dark:text-red-400'
                                                                : 'text-yellow-600 dark:text-yellow-400'
                                                            }`}>
                                                            {item.selisih > 0 ? '+' : ''}{(item.selisih ?? 0).toLocaleString("id-ID")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>

                                            {isExpandable && (
                                                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600 flex justify-center relative z-20 w-full">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedJenis(isExpanded ? null : (item.jenis || null));
                                                        }}
                                                        className={`p-2 rounded-full transition-colors ${isExpanded
                                                            ? 'text-white bg-brand-600 hover:bg-brand-700 shadow-md'
                                                            : 'text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:text-gray-400 dark:hover:text-brand-400 dark:hover:bg-gray-700'
                                                            }`}
                                                        title={isExpanded ? "Tutup Detail" : "Buka Detail"}
                                                    >
                                                        {isExpanded ? (
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                                        ) : (
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden animate-fadeIn relative z-0 mt-2 mb-4">
                                            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Detail {item.jenis}</h4>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pilih jabatan untuk memfilter tabel</p>
                                            </div>
                                            <div className="p-4 max-h-[400px] overflow-y-auto w-full">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {details.map((d, i) => {
                                                        const isFungsional = /fungsional/i.test(item.jenis || '');
                                                        const hasSubItems = isFungsional && d.subItems && d.subItems.length > 1; // display if more than 1 variation exists or at least something unique
                                                        const isSubExpanded = expandedSubJenis === d.nama;

                                                        return (
                                                            <Fragment key={i}>
                                                                <div className={`flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 hover:shadow-md transition-all group/btn relative ${isSubExpanded ? 'ring-2 ring-brand-400 border-brand-400 dark:border-brand-500' : ''}`}>
                                                                    <div className="flex flex-col h-full cursor-pointer p-3"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedJenis({ value: item.jenis || '', label: item.jenis || '' });
                                                                            setSearchNama(d.nama);
                                                                            setCurrentPage(1);
                                                                            setTimeout(() => {
                                                                                document.getElementById('total-jabatan-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                                            }, 100);
                                                                        }}
                                                                    >
                                                                        <div className="flex justify-between items-start w-full gap-2 mb-2">
                                                                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-normal w-full" style={{ wordBreak: 'break-word' }}>
                                                                                {d.nama}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex justify-between items-end w-full text-xs mt-auto">
                                                                            <div className="flex flex-col gap-1">
                                                                                <span className="text-gray-500 dark:text-gray-400">Bezetting: {(d.bezetting || 0).toLocaleString('id-ID')}</span>
                                                                                <span className="text-gray-500 dark:text-gray-400">Kebutuhan: {(d.kebutuhan || 0).toLocaleString('id-ID')}</span>
                                                                            </div>
                                                                            <div className={`px-2 py-1 rounded-md font-bold ${(d.selisih === 0) ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                                                                                (d.selisih > 0) ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
                                                                                }`}>
                                                                                {d.selisih > 0 ? '+' : ''}{(d.selisih || 0).toLocaleString('id-ID')}
                                                                            </div>
                                                                        </div>

                                                                        {hasSubItems && (
                                                                            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-center w-full" onClick={e => e.stopPropagation()}>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setExpandedSubJenis(isSubExpanded ? null : d.nama);
                                                                                    }}
                                                                                    className={`p-1.5 rounded-full transition-colors ${isSubExpanded
                                                                                        ? 'text-white bg-brand-600 hover:bg-brand-700 shadow-sm'
                                                                                        : 'text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:text-gray-400 dark:hover:text-brand-400 dark:hover:bg-gray-700'
                                                                                        }`}
                                                                                    title={isSubExpanded ? "Tutup Rincian" : "Lihat Rincian Jabatan"}
                                                                                >
                                                                                    {isSubExpanded ? (
                                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                                                                    ) : (
                                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                                                    )}
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {isSubExpanded && hasSubItems && (
                                                                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 w-full animate-fadeIn bg-gradient-to-br from-brand-50/50 to-white dark:from-gray-800/80 dark:to-gray-800 border border-brand-200 dark:border-gray-600 shadow-sm rounded-xl p-4 mt-1">
                                                                        <div className="flex items-center gap-2 mb-3 text-brand-600 dark:text-brand-400 pb-2 border-b border-brand-100/50 dark:border-gray-700">
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                                            <h5 className="text-sm font-semibold">Rincian: {d.nama}</h5>
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-3">
                                                                            {d.subItems.map((sub: any, idx: number) => (
                                                                                <button
                                                                                    key={idx}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setSelectedJenis({ value: item.jenis || '', label: item.jenis || '' });
                                                                                        setSearchNama(sub.originalNama);
                                                                                        setCurrentPage(1);
                                                                                        setTimeout(() => {
                                                                                            document.getElementById('total-jabatan-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                                                        }, 100);
                                                                                    }}
                                                                                    className="flex-grow sm:flex-grow-0 sm:basis-[220px] max-w-full flex-shrink-0 flex flex-col text-left p-3 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-sm transition-all"
                                                                                >
                                                                                    <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 mb-2 whitespace-normal leading-relaxed">
                                                                                        {sub.originalNama}
                                                                                    </div>
                                                                                    <div className="flex justify-between items-end w-full text-[11px] mt-auto">
                                                                                        <div className="flex flex-col gap-0.5">
                                                                                            <span className="text-gray-500 dark:text-gray-400">Bezetting: {(sub.bezetting || 0).toLocaleString('id-ID')}</span>
                                                                                            <span className="text-gray-500 dark:text-gray-400">Kebutuhan: {(sub.kebutuhan || 0).toLocaleString('id-ID')}</span>
                                                                                        </div>
                                                                                        <div className={`px-1.5 py-0.5 rounded font-bold ${(sub.selisih === 0) ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' :
                                                                                            (sub.selisih > 0) ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                                                                                            }`}>
                                                                                            {sub.selisih > 0 ? '+' : ''}{(sub.selisih || 0).toLocaleString('id-ID')}
                                                                                        </div>
                                                                                    </div>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </Fragment>
                                                        );
                                                    })}
                                                    {details.length === 0 && (
                                                        <div className="col-span-full py-8 text-center text-gray-500 dark:text-gray-400">
                                                            Tidak ada data detail.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Total Per Nama Jabatan (moved up) */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
                    <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-brand-50 to-blue-light-50 dark:from-gray-800 dark:to-gray-800">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">
                                        Total Jabatan
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Jabatan berdasarkan selisih kebutuhan pegawai</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-auto w-full sm:w-auto sm:max-w-md">
                                <label className="sr-only">Cari Nama Jabatan</label>
                                <input
                                    value={searchNama}
                                    onChange={(e) => { setSearchNama(e.target.value); setCurrentPage(1); }}
                                    placeholder="Cari nama jabatan..."
                                    className="flex-1 sm:w-80 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                                />
                                <button
                                    onClick={() => { if (unsavedChanges) handleSaveOverrides(); else handlePrintTotalJabatan(); }}
                                    className={`px-3 py-2 rounded-lg text-sm transition-colors flex-shrink-0 ${unsavedChanges ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                                    title={unsavedChanges ? 'Simpan perubahan kebutuhan fungsional' : 'Print tabel Total Jabatan'}
                                >
                                    {unsavedChanges ? 'Simpan' : 'Print'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] sm:max-h-[600px] overflow-y-auto">
                        <table id="total-jabatan-table" className="w-full table-auto min-w-[720px]">
                            <thead className="bg-gradient-to-r from-gray-50 to-gray-50 dark:from-gray-700 dark:to-gray-800 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-14">
                                        No
                                    </th>
                                    <th onClick={() => toggleSort('nama_jabatan')} className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
                                        <div className="flex items-center gap-2 select-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            Jabatan {sortField === 'nama_jabatan' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </div>
                                    </th>
                                    <th onClick={() => toggleSort('unit_kerja')} className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
                                        <div className="flex items-center gap-2 select-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                            Unit Kerja {sortField === 'unit_kerja' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </div>
                                    </th>

                                    <th onClick={() => toggleSort('bezetting')} className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
                                        <div className="flex items-center justify-center gap-2 select-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                            Bezetting {sortField === 'bezetting' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </div>
                                    </th>
                                    <th onClick={() => toggleSort('kebutuhan')} className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
                                        <div className="flex items-center justify-center gap-2 select-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            Kebutuhan {sortField === 'kebutuhan' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </div>
                                    </th>
                                    <th onClick={() => toggleSort('selisih')} className="px-3 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
                                        <div className="flex items-center justify-center gap-2 select-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                            Selisih {sortField === 'selisih' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {currentPageItems.map((item, index) => (
                                    <tr
                                        key={index}
                                        className={`hover:bg-brand-50 dark:hover:bg-gray-700/50 transition-colors ${index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'
                                            }`}
                                    >
                                        <td className="px-3 py-3 whitespace-normal break-words text-center">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {(currentPage - 1) * itemsPerPage + index + 1}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 break-words">
                                            <div className="text-xs font-medium text-gray-900 dark:text-white">
                                                {item.nama_jabatan}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 break-words">
                                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                {item.unit_kerja}
                                            </div>
                                        </td>

                                        <td className="px-3 py-3 whitespace-normal break-words text-center">
                                            <span className="text-xs font-medium text-gray-900 dark:text-white">
                                                {(item.bezetting ?? 0).toLocaleString("id-ID")}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-normal break-words text-center">
                                            {(/fungsional/i).test(String(item.jenis_jabatan || '')) ? (
                                                (() => {
                                                    const key = `${String(item.nama_jabatan || '').trim()}|||${String(item.unit_kerja || '').trim()}`;
                                                    const existing = overrides.hasOwnProperty(key) ? overrides[key] : String(Number(item.kebutuhan ?? 0));
                                                    const displayed = existing === '' ? '' : String(existing);
                                                    return (
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            className="w-28 text-center rounded border px-2 py-1 text-sm"
                                                            value={displayed}
                                                            onFocus={() => {
                                                                // if current displayed value is '0', clear it so typing '12' doesn't produce '012'
                                                                const curr = overrides.hasOwnProperty(key) ? overrides[key] : String(Number(item.kebutuhan ?? 0));
                                                                if ((curr === 0 || curr === '0') && !overrides.hasOwnProperty(key)) {
                                                                    setOverrides((prev) => ({ ...prev, [key]: '' }));
                                                                }
                                                            }}
                                                            onBlur={() => {
                                                                // if user focused and left without typing, remove temporary override so original value shows again
                                                                if (overrides.hasOwnProperty(key) && overrides[key] === '') {
                                                                    setOverrides((prev) => {
                                                                        const next = { ...prev } as Record<string, string | number>;
                                                                        delete next[key];
                                                                        return next;
                                                                    });
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                // allow only digits and control keys while typing
                                                                if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
                                                                    e.preventDefault();
                                                                }
                                                            }}
                                                            onChange={(e) => {
                                                                const raw = e.target.value;
                                                                // keep raw string while editing; we'll coerce when saving
                                                                setOverrides((prev) => ({ ...prev, [key]: raw }));
                                                                setUnsavedChanges(true);
                                                            }}
                                                        />
                                                    );
                                                })()
                                            ) : (
                                                <span className="text-xs font-medium text-gray-900 dark:text-white">
                                                    {(item.kebutuhan ?? 0).toLocaleString("id-ID")}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-normal break-words text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(item.selisih === 0)
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                                : (item.selisih > 0)
                                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                                                }`}>
                                                {item.selisih > 0 ? '+' : ''}{(item.selisih ?? 0).toLocaleString("id-ID")}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="py-5 px-4 sm:p-6 border-t border-gray-100 dark:border-gray-700 flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                            Menampilkan {displayedNamaJabatan.length === 0 ? 0 : (currentPageItems.length)} dari {displayedNamaJabatan.length} jabatan
                        </div>
                        <div className="flex items-center gap-2 w-full justify-center sm:w-auto sm:justify-start px-2 sm:px-0">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage <= 1}
                                aria-label="First page"
                                title="First"
                                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm rounded-md disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17L6 12l5-5M18 17l-5-5 5-5" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                aria-label="Previous page"
                                title="Prev"
                                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm rounded-md disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            {showLeftEllipsis && (
                                <span className="px-2 text-sm text-gray-500">...</span>
                            )}

                            {visiblePages.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setCurrentPage(n)}
                                    className={`px-3 py-1 text-sm rounded-md ${currentPage === n ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600'}`}
                                >
                                    {n}
                                </button>
                            ))}

                            {showRightEllipsis && (
                                <span className="px-2 text-sm text-gray-500">...</span>
                            )}

                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                aria-label="Next page"
                                title="Next"
                                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm rounded-md disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage >= totalPages}
                                aria-label="Last page"
                                title="Last"
                                className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm rounded-md disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                                </svg>
                            </button>
                        </div>
                    </div>

                </div>

                {/* New: Top Biro (Agregat) - placed after Top Negative chart */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">Rekapitulasi Tiap Biro</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Selisih Bezetting dengan Kebutuhan tiap Biro</p>
                        </div>
                    </div>
                    {/* Increase chart height proportionally to number of rows so long labels have room */}
                    {(() => {
                        const rows = (byBiro || []).length || 0;
                        const dynamic = Math.max(chartHeight, Math.min(520, rows * 40));
                        return (
                            <ResponsiveContainer width="100%" height={dynamic}>
                                <BarChart data={(byBiro || []).slice().sort((a: any, b: any) => (a.selisih ?? 0) - (b.selisih ?? 0)).map((b: any) => ({ ...b, display_label: b.unit_kerja }))} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ffed" />
                                    <XAxis type="number" tick={{ fontSize: 12 }} />
                                    <YAxis dataKey="display_label" type="category" width={yAxisWidth} tick={renderYAxisTick} interval={0} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(240, 255, 244, 0.97)',
                                            border: '1px solid #d1fae5',
                                            borderRadius: '12px',
                                            boxShadow: '0 6px 12px rgba(0, 0, 0, 0.06)'
                                        }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const p = payload[0].payload;
                                                const s = Number(p.selisih ?? 0);
                                                const selisihCls = s > 0
                                                    ? 'text-blue-light-600 dark:text-blue-light-400'
                                                    : s < 0
                                                        ? 'text-orange-600 dark:text-orange-400'
                                                        : 'text-orange-600 dark:text-orange-400';
                                                return (
                                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                                                        <p className="font-semibold text-gray-900 dark:text-white text-sm mb-2">{p.unit_kerja}</p>
                                                        <p className="text-xs text-brand-600 dark:text-brand-400">Bezetting: {p.bezetting}</p>
                                                        <p className="text-xs text-blue-light-600 dark:text-blue-light-400">Kebutuhan: {p.kebutuhan}</p>
                                                        <p className={`text-xs ${selisihCls} font-semibold`}>Selisih: {s > 0 ? '+' : ''}{p.selisih}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="selisih" name="Selisih" radius={[0, 8, 8, 0]}>
                                        {(byBiro || []).map((entry: any, idx: number) => (
                                            <Cell key={`cell-biro-${idx}`} fill={entry.selisih > 0 ? '#3CA8CD' : entry.selisih < 0 ? '#8FC54A' : '#6DB980'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        );
                    })()}
                </div>

                {/* Top Jabatan (Selisih Positif) */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-blue-light-500 to-blue-light-600 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">
                                Top 10 Jabatan dengan Kelebihan Pegawai Terbanyak
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Jabatan dengan bezetting melebihi kebutuhan pegawai</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={topPositive} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" tick={{ fontSize: 12 }} />
                            <YAxis
                                dataKey="display_label"
                                type="category"
                                width={yAxisWidth}
                                tick={renderYAxisTick}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 245, 245, 0.97)',
                                    border: '1px solid #fee2e2',
                                    borderRadius: '12px',
                                    boxShadow: '0 6px 12px rgba(0, 0, 0, 0.06)'
                                }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                                                <p className="font-semibold text-gray-900 dark:text-white text-sm mb-2">{payload[0].payload.nama_jabatan}</p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2" style={{ whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 320 }}>Unit: {payload[0].payload.unit_kerja}</p>
                                                <p className="text-xs text-brand-600 dark:text-brand-400">Bezetting: {payload[0].payload.bezetting}</p>
                                                <p className="text-xs text-blue-light-600 dark:text-blue-light-400">Kebutuhan: {payload[0].payload.kebutuhan}</p>
                                                <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold">Selisih: +{payload[0].payload.selisih}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="selisih" fill="#3CA8CD" name="Kelebihan" radius={[0, 8, 8, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Top Jabatan (Selisih Negatif) */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-brand-400 to-brand-500 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">Top 10 Jabatan dengan Kekurangan Pegawai Terbanyak</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Jabatan dengan bezetting kurang dari kebutuhan pegawai</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={topNegative} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" tick={{ fontSize: 12 }} domain={[0, 'dataMax']} />
                            <YAxis
                                dataKey="display_label"
                                type="category"
                                width={yAxisWidth}
                                tick={renderYAxisTick}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 251, 235, 0.97)',
                                    border: '1px solid #fffbeb',
                                    borderRadius: '12px',
                                    boxShadow: '0 6px 12px rgba(0, 0, 0, 0.06)'
                                }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                                                <p className="font-semibold text-gray-900 dark:text-white text-sm mb-2">{payload[0].payload.nama_jabatan}</p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2" style={{ whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 320 }}>Unit: {payload[0].payload.unit_kerja}</p>
                                                <p className="text-xs text-brand-600 dark:text-brand-400">Bezetting: {payload[0].payload.bezetting}</p>
                                                <p className="text-xs text-blue-light-600 dark:text-blue-light-400">Kebutuhan: {payload[0].payload.kebutuhan}</p>
                                                <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold">Selisih: {payload[0].payload.selisih}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="abs_selisih" fill="#8FC54A" name="Kekurangan" radius={[0, 8, 8, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </div>
        </>
    );
}

// Save overrides to server
async function saveOverridesApi(payload: Array<{ nama_jabatan: string; unit_kerja: string; kebutuhan_khusus: number }>) {
    const res = await apiFetch('/api/dashboard/jabatan/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: payload })
    });
    return res;
}


function SummaryCard(props: SummaryCardProps) {
    const { title, value, icon, color, subtitle, breakdown } = props;

    return (
        <div className="relative group h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-200/70 to-blue-light-200/70 dark:from-brand-800/30 dark:to-blue-light-800/30 backdrop-blur-xl rounded-[2rem] border-4 border-white dark:border-white/90 shadow-lg transition-all duration-300 group-hover:scale-[1.02] dark:group-hover:from-brand-700/40 dark:group-hover:to-blue-light-700/40 group-hover:shadow-xl group-hover:border-brand-500 dark:group-hover:border-brand-400" />

            {/* Content */}
            <div className="relative p-6 h-full flex flex-col z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 flex-shrink-0 bg-white/50 dark:bg-white/10 rounded-2xl flex items-center justify-center text-2xl shadow-sm backdrop-blur-md border-2 border-white dark:border-white/30 text-brand-900 dark:text-brand-100 transition-all duration-300 group-hover:rotate-6 group-hover:border-brand-400 dark:group-hover:border-brand-300">
                        {icon}
                    </div>
                    {subtitle && (
                        <span className="text-[10px] px-3 py-1 bg-white/30 dark:bg-white/10 text-brand-900 dark:text-brand-100 rounded-full font-bold uppercase tracking-wider border border-white/30 shadow-sm backdrop-blur-sm">
                            {subtitle}
                        </span>
                    )}
                </div>

                <h3 className="text-base font-semibold text-brand-900/70 dark:text-brand-100/70 mb-1">{title}</h3>

                <p className="text-3xl font-semibold text-brand-950 dark:text-white tracking-tight leading-none mb-6 drop-shadow-sm">
                    {(value ?? 0).toLocaleString("id-ID")}
                </p>

                {breakdown && breakdown.length > 0 && (
                    <div className="mt-auto pt-4 border-t border-brand-900/10 dark:border-white/10 flex items-start gap-8">
                        {breakdown.map((item, idx) => (
                            <div key={idx} className="flex flex-col">
                                <span className="text-xs font-semibold text-brand-900/60 dark:text-brand-100/60 uppercase tracking-wide mb-1">{item.label}</span>
                                <span className="text-xl font-bold text-brand-900 dark:text-white leading-none">{item.value.toLocaleString('id-ID')}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}