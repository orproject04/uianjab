'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPetaJabatan } from '@/lib/getPetaJabatan';
import { OrgChart } from 'd3-org-chart';
import * as d3 from 'd3';

// Types
type PegawaiInfo = { name: string; nip: string; role: string; };
type APIRow = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja?: string | null;
    level: number;
    order_index: number | null;
    bezetting?: number | null;
    kebutuhan_pegawai?: number | null;
    is_pusat?: boolean;
    jenis_jabatan: string | null;
    kelas_jabatan?: string | null;
    pejabat?: PegawaiInfo[];
};

interface OrgChartNode {
    id: string;
    parentId: string | null;
    name: string;
    pejabat: string[];
    level: number;
    jenis: string;
    isSynthetic?: boolean;
    syntheticType?: 'KJF' | 'SKDP';
}

type ScopeOpt = 'PUSAT' | 'DAERAH';

// Clean unit name
function cleanUnitName(name: string): string {
    if (!name) return '';
    return name
        .replace(/^SEKRETARIS\s+JENDERAL\s*/i, 'SEKRETARIAT JENDERAL ')
        .replace(/^KEPALA\s+BAGIAN\s*/i, 'BAGIAN ')
        .replace(/^KEPALA\s+SUBBAGIAN\s*/i, 'SUBBAGIAN ')
        .replace(/^KEPALA\s+BIRO\s*/i, 'BIRO ')
        .replace(/^KEPALA\s+/i, '')
        .replace(/^SEKRETARIS\s+/i, 'SEKRETARIAT ')
        .replace(/^DIREKTUR\s+/i, 'DIREKTORAT ')
        .replace(/^INSPEKTUR\s+UTAMA\s*/i, 'INSPEKTORAT UTAMA ')
        .replace(/^INSPEKTUR\s*/i, 'INSPEKTORAT ')
        .replace(/^DEPUTI\s+/i, 'DEPUTI ')
        .replace(/^KA\.\s*/i, '')
        .replace(/^KABAG\s+/i, 'BAGIAN ')
        .replace(/^KASUBAG\s+/i, 'SUBBAGIAN ')
        .trim();
}

// Get eselon level
function getEselonLevel(jenis: string | null): number {
    const j = (jenis || '').toUpperCase();
    if (/ESELON\s*I(?:\s|$|\/)/i.test(j)) return 1;
    if (/ESELON\s*II(?:\s|$|\/)/i.test(j)) return 2;
    if (/ESELON\s*III(?:\s|$|\/)/i.test(j)) return 3;
    if (/ESELON\s*IV(?:\s|$|\/)/i.test(j)) return 4;
    return 99;
}

// Brand colors
const brandColors = {
    brand500: '#6DB980', brand600: '#5a9a69', brand700: '#487b53',
    gray900: '#373D3A', gray700: '#454a45',
};

// Segmented control
function Segmented<T extends string>({ value, onChange, options }: {
    value: T; onChange: (v: T) => void; options: { label: string; value: T }[];
}) {
    return (
        <div className="inline-flex rounded-lg border bg-white p-0.5">
            {options.map((opt) => (
                <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-md transition ${value === opt.value ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export default function StrukturOrganisasiClient() {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<OrgChart<OrgChartNode> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [allRows, setAllRows] = useState<APIRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [scope, setScope] = useState<ScopeOpt>('PUSAT');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Focus mode - when a Biro is clicked, show its full structure
    const [focusedBiroId, setFocusedBiroId] = useState<string | null>(null);
    const [focusedBiroName, setFocusedBiroName] = useState<string>('');

    // Load data
    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const data: APIRow[] = await getPetaJabatan();
            setAllRows(data);
        } catch (e: any) {
            setErr(e?.message || 'Gagal memuat data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Filter structural data based on scope
    const structuralRows = useMemo(() => {
        if (!allRows.length) return [];

        const byId = new Map<string, APIRow>(allRows.map(r => [r.id, r]));
        const setjenNode = allRows.find(r => (r.slug || '').toLowerCase() === 'setjen');
        const setjenId = setjenNode?.id ?? null;

        const keep = new Set<string>();

        const addWithAncestors = (id: string, stopAtId?: string | null) => {
            let cur: string | null = id;
            while (cur) {
                keep.add(cur);
                if (stopAtId && cur === stopAtId) break;
                cur = byId.get(cur)?.parent_id || null;
            }
        };

        const isUnderSetjen = (id: string) => {
            if (!setjenId) return true;
            let cur: string | null = id;
            while (cur) {
                if (cur === setjenId) return true;
                cur = byId.get(cur)?.parent_id || null;
            }
            return false;
        };

        const isFungsionalOrPelaksana = (r: APIRow) => {
            const jenis = (r.jenis_jabatan || '').toUpperCase();
            return jenis.includes('FUNGSIONAL') || jenis.includes('PELAKSANA');
        };

        if (scope === 'PUSAT') {
            for (const r of allRows) {
                if (r.is_pusat === true && !isFungsionalOrPelaksana(r)) keep.add(r.id);
            }
            for (const id of Array.from(keep)) addWithAncestors(id);
        } else {
            if (setjenId) keep.add(setjenId);
            for (const r of allRows) {
                if (r.is_pusat === false && !isFungsionalOrPelaksana(r) && isUnderSetjen(r.id)) keep.add(r.id);
            }
            for (const id of Array.from(keep)) addWithAncestors(id, setjenId);
        }

        return allRows.filter(r => keep.has(r.id));
    }, [allRows, scope]);

    // Build org data with synthetic nodes (KJF, SKDP)
    const orgData: OrgChartNode[] = useMemo(() => {
        if (!structuralRows.length) return [];

        const nodes: OrgChartNode[] = [];
        const setjenNode = structuralRows.find(r => (r.slug || '').toLowerCase() === 'setjen');
        const setjenId = setjenNode?.id ?? null;

        if (focusedBiroId) {
            // FOCUS MODE: Show focused Biro/Bagian and all descendants
            const descendants = new Set<string>();
            descendants.add(focusedBiroId);

            const addDescendants = (parentId: string) => {
                for (const row of structuralRows) {
                    if (row.parent_id === parentId) {
                        descendants.add(row.id);
                        addDescendants(row.id);
                    }
                }
            };
            addDescendants(focusedBiroId);

            // Get focused row info
            const focusedRow = structuralRows.find(r => r.id === focusedBiroId);
            const focusedLevel = focusedRow ? getEselonLevel(focusedRow.jenis_jabatan) : 99;

            // Add the focused node first (root)
            if (focusedRow) {
                nodes.push({
                    id: focusedRow.id,
                    parentId: null, // Root node
                    name: cleanUnitName(focusedRow.nama_jabatan || ''),
                    pejabat: Array.isArray(focusedRow.pejabat) ? focusedRow.pejabat.map(p => p.name) : [],
                    level: focusedLevel,
                    jenis: focusedRow.jenis_jabatan || '',
                });
            }

            // Add KJF directly under Biro (before Bagian nodes) - uses a synthetic intermediate node
            if (focusedRow && focusedLevel === 2) {
                // Create a synthetic container for KJF that will be positioned separately
                nodes.push({
                    id: `kjf-${focusedBiroId}`,
                    parentId: focusedBiroId,
                    name: 'KELOMPOK JABATAN FUNGSIONAL',
                    pejabat: [],
                    level: 99, // Special level to position it last
                    jenis: 'SYNTHETIC',
                    isSynthetic: true,
                    syntheticType: 'KJF',
                });
            }

            // Add descendant nodes (Bagian, Subbagian, etc.) - sorted by level then by name
            const descendantRows = structuralRows
                .filter(row => descendants.has(row.id) && row.id !== focusedBiroId)
                .sort((a, b) => {
                    const levelA = getEselonLevel(a.jenis_jabatan);
                    const levelB = getEselonLevel(b.jenis_jabatan);
                    if (levelA !== levelB) return levelA - levelB;
                    return (a.nama_jabatan || '').localeCompare(b.nama_jabatan || '');
                });

            for (const row of descendantRows) {
                nodes.push({
                    id: row.id,
                    parentId: row.parent_id,
                    name: cleanUnitName(row.nama_jabatan || ''),
                    pejabat: Array.isArray(row.pejabat) ? row.pejabat.map(p => p.name) : [],
                    level: getEselonLevel(row.jenis_jabatan),
                    jenis: row.jenis_jabatan || '',
                });
            }

        } else {
            // FULL VIEW: Show up to Bagian level (Eselon III) - NO KJF in full view
            for (const row of structuralRows) {
                const level = getEselonLevel(row.jenis_jabatan);
                if (level <= 3) { // Up to Bagian
                    nodes.push({
                        id: row.id,
                        parentId: row.parent_id,
                        name: cleanUnitName(row.nama_jabatan || ''),
                        pejabat: Array.isArray(row.pejabat) ? row.pejabat.map(p => p.name) : [],
                        level,
                        jenis: row.jenis_jabatan || '',
                    });
                }
            }

            // Only add SKDP under Setjen (no KJF in full view)
            if (setjenId) {
                nodes.push({
                    id: 'skdp-setjen',
                    parentId: setjenId,
                    name: 'SEKRETARIAT KANTOR DPD RI DI IBU KOTA PROVINSI',
                    pejabat: [],
                    level: 3,
                    jenis: 'SYNTHETIC',
                    isSynthetic: true,
                    syntheticType: 'SKDP',
                });
            }
        }

        return nodes;
    }, [structuralRows, focusedBiroId]);

    // Get node color
    const getNodeColor = (level: number, isSynthetic?: boolean, syntheticType?: string): { bg: string; border: string; text: string; iconBg: string } => {
        if (isSynthetic && syntheticType === 'KJF') {
            return { bg: '#f0fdf4', border: '#86efac', text: '#166534', iconBg: '#22c55e' };
        }
        if (isSynthetic && syntheticType === 'SKDP') {
            return { bg: '#fff7ed', border: '#fdba74', text: '#9a3412', iconBg: '#f97316' };
        }
        switch (level) {
            case 1: return { bg: brandColors.gray900, border: brandColors.brand600, text: '#ffffff', iconBg: brandColors.brand600 };
            case 2: return { bg: brandColors.brand700, border: brandColors.brand500, text: '#ffffff', iconBg: brandColors.brand500 };
            case 3: return { bg: brandColors.brand600, border: brandColors.brand700, text: '#ffffff', iconBg: brandColors.brand700 };
            case 4: return { bg: '#e8f5d9', border: brandColors.brand500, text: brandColors.gray900, iconBg: brandColors.brand500 };
            default: return { bg: '#ffffff', border: '#94a3b8', text: '#334155', iconBg: '#64748b' };
        }
    };

    // Handle Biro click
    const handleBiroClick = useCallback((biroId: string, biroName: string) => {
        setFocusedBiroId(biroId);
        setFocusedBiroName(biroName);
    }, []);

    // Handle Bagian click - go to parent Biro
    const handleBagianClick = useCallback((bagianId: string) => {
        // Find parent Biro of this Bagian
        const bagian = structuralRows.find(r => r.id === bagianId);
        if (bagian && bagian.parent_id) {
            const parent = structuralRows.find(r => r.id === bagian.parent_id);
            if (parent && getEselonLevel(parent.jenis_jabatan) === 2) {
                setFocusedBiroId(parent.id);
                setFocusedBiroName(cleanUnitName(parent.nama_jabatan || ''));
            }
        }
    }, [structuralRows]);

    // Handle back
    const handleBack = useCallback(() => {
        setFocusedBiroId(null);
        setFocusedBiroName('');
    }, []);

    // Initialize chart
    useEffect(() => {
        if (!chartContainerRef.current || !orgData.length || loading) return;

        if (chartRef.current) {
            d3.select(chartContainerRef.current).selectAll('*').remove();
        }

        const chart = new OrgChart<OrgChartNode>();
        chartRef.current = chart;

        // Calculate node dimensions based on mode - compact like reference
        const getNodeWidth = (d: any) => {
            if (d.data.isSynthetic) return 180;
            if (focusedBiroId) {
                // Focus mode
                return d.data.level === 2 ? 240 : d.data.level === 3 ? 200 : 180;
            }
            // Full view - compact nodes
            return d.data.level === 1 ? 260 : d.data.level === 2 ? 200 : 180;
        };

        const getNodeHeight = (d: any) => {
            if (d.data.isSynthetic) return 50;
            if (focusedBiroId) {
                return d.data.level === 2 ? 80 : 70;
            }
            return d.data.level === 1 ? 80 : 70;
        };

        chart
            .container(chartContainerRef.current as any)
            .data(orgData as any)
            .layout('top') // Top-down layout
            .nodeWidth(getNodeWidth)
            .nodeHeight(getNodeHeight)
            .childrenMargin(() => 50) // Vertical spacing between parent and children
            .compactMarginBetween(() => 15) // Vertical spacing between siblings in compact mode
            .compactMarginPair(() => 30) // Spacing between pairs in compact mode
            .siblingsMargin(() => 25) // Horizontal spacing between siblings
            .neighbourMargin(() => 40) // Spacing between neighbor branches
            .compact(true) // Enable compact mode to stack children vertically
            .initialExpandLevel(10)
            .buttonContent(({ node }: any) => {
                const children = node._directSubordinates || 0;
                if (children === 0 || node.data.isSynthetic) return '';
                const isExpanded = node.children && node.children.length > 0;
                return `<div style="width:24px;height:24px;border-radius:50%;background:${brandColors.brand500};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:#fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.2);">${isExpanded ? '−' : '+'}</div>`;
            })
            .linkUpdate(function (d: any) {
                d3.select(this)
                    .attr('stroke', brandColors.brand500)
                    .attr('stroke-width', 2)
                    .attr('opacity', 0.8);
            })
            .nodeContent((d: any) => {
                const data = d.data as OrgChartNode;
                const colors = getNodeColor(data.level, data.isSynthetic, data.syntheticType);
                const pejabatStr = data.pejabat.length > 0 ? data.pejabat[0] + (data.pejabat.length > 1 ? ` (+${data.pejabat.length - 1})` : '') : '';

                // Synthetic KJF node - simple box with dashed border (styled like reference)
                if (data.isSynthetic && data.syntheticType === 'KJF') {
                    return `<div style="width:${d.width}px;height:${d.height}px;background:#ffffff;border:2px dashed #666;border-radius:4px;display:flex;align-items:center;justify-content:center;padding:8px;">
            <div style="font-size:10px;font-weight:600;color:#333;text-align:center;text-transform:uppercase;">${data.name}</div>
          </div>`;
                }

                // Synthetic SKDP node
                if (data.isSynthetic && data.syntheticType === 'SKDP') {
                    return `<div style="width:${d.width}px;height:${d.height}px;background:#ffffff;border:2px dashed #666;border-radius:4px;display:flex;align-items:center;justify-content:center;padding:8px;">
            <div style="font-size:9px;font-weight:600;color:#333;text-align:center;text-transform:uppercase;line-height:1.3;">${data.name}</div>
          </div>`;
                }

                // Regular node - styled like reference (simple rectangular boxes)
                const titleFontSize = data.level === 1 ? '12px' : data.level === 2 ? '11px' : '10px';
                const pejabatFontSize = '9px';
                const iconSize = data.level <= 2 ? 36 : 32;
                const svgSize = data.level <= 2 ? 20 : 18;
                const canClick = (data.level === 2 || data.level === 3) && !focusedBiroId;

                // Use different styles based on level
                const isHighLevel = data.level <= 2;
                const bgColor = isHighLevel ? colors.bg : '#ffffff';
                const borderColor = isHighLevel ? colors.border : '#333';
                const textColor = isHighLevel ? colors.text : '#333';

                return `
          <div class="org-node" data-node-id="${data.id}" data-node-level="${data.level}" data-node-name="${data.name}"
            style="width:${d.width}px;height:${d.height}px;background:${bgColor};border:2px solid ${borderColor};border-radius:8px;display:flex;align-items:center;padding:10px;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);cursor:${canClick ? 'pointer' : 'default'};">
            <div style="width:${iconSize}px;height:${iconSize}px;min-width:${iconSize}px;border-radius:6px;background:${colors.iconBg};display:flex;align-items:center;justify-content:center;">
              <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
                <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
              </svg>
            </div>
            <div style="flex:1;overflow:hidden;min-width:0;">
              <div style="font-size:${titleFontSize};font-weight:700;color:${textColor};line-height:1.3;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-transform:uppercase;">${data.name}</div>
              ${pejabatStr ? `<div style="font-size:${pejabatFontSize};color:${isHighLevel ? 'rgba(255,255,255,0.85)' : '#666'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;">${pejabatStr}</div>` : ''}
            </div>
            ${canClick ? `<div style="width:20px;height:20px;border-radius:4px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${textColor}" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>` : ''}
          </div>
        `;
            })
            .render();

        // Add click handlers
        setTimeout(() => {
            const nodes = chartContainerRef.current?.querySelectorAll('.org-node');
            nodes?.forEach((node) => {
                const level = parseInt(node.getAttribute('data-node-level') || '0');
                const nodeId = node.getAttribute('data-node-id');
                const nodeName = node.getAttribute('data-node-name');

                if (!focusedBiroId && nodeId && nodeName) {
                    if (level === 2) { // Biro
                        node.addEventListener('click', () => handleBiroClick(nodeId, nodeName));
                    } else if (level === 3) { // Bagian
                        node.addEventListener('click', () => handleBagianClick(nodeId));
                    }
                }

                // Hover
                node.addEventListener('mouseenter', () => {
                    (node as HTMLElement).style.transform = 'translateY(-2px)';
                    (node as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
                });
                node.addEventListener('mouseleave', () => {
                    (node as HTMLElement).style.transform = 'translateY(0)';
                    (node as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
                });
            });

            chartRef.current?.fit();
        }, 200);

        return () => {
            if (chartRef.current && chartContainerRef.current) {
                d3.select(chartContainerRef.current).selectAll('*').remove();
            }
        };
    }, [orgData, loading, focusedBiroId, handleBiroClick, handleBagianClick]);

    // Fullscreen
    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await containerRef.current.requestFullscreen();
        } catch (e) { console.error(e); }
    };

    // Controls
    const handleZoomIn = () => chartRef.current?.zoomIn();
    const handleZoomOut = () => chartRef.current?.zoomOut();
    const handleFit = () => chartRef.current?.fit();
    const handleExpandAll = () => chartRef.current?.expandAll().render();
    const handleCollapseAll = () => chartRef.current?.collapseAll().render();

    // Export PDF
    const handleExportPDF = useCallback(() => {
        setIsExporting(true);
        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('Popup blocked.'); setIsExporting(false); return; }

        const svgElement = chartContainerRef.current?.querySelector('svg');
        if (!svgElement) { printWindow.close(); setIsExporting(false); return; }

        const svgClone = svgElement.cloneNode(true) as SVGElement;
        const bbox = svgElement.getBBox();
        svgClone.setAttribute('width', String(bbox.width + 100));
        svgClone.setAttribute('height', String(bbox.height + 100));
        svgClone.setAttribute('viewBox', `${bbox.x - 50} ${bbox.y - 50} ${bbox.width + 100} ${bbox.height + 100}`);

        printWindow.document.write(`<!DOCTYPE html><html><head><title>Struktur Organisasi</title>
      <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;background:#fff;}
      .header{text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #6DB980;}
      .header h1{font-size:18px;color:#373D3A;}.header p{font-size:10px;color:#666;margin-top:5px;}
      svg{display:block;margin:0 auto;max-width:100%;}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head>
      <body><div class="header"><h1>Struktur Organisasi${focusedBiroId ? ': ' + focusedBiroName : ''}</h1>
      <p>${scope === 'PUSAT' ? 'Kantor Pusat' : 'Kantor Daerah'} - ${new Date().toLocaleDateString('id-ID')}</p></div>
      ${svgClone.outerHTML}</body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); printWindow.close(); setIsExporting(false); }, 500);
    }, [scope, focusedBiroId, focusedBiroName]);

    // Reset on scope change
    useEffect(() => { setFocusedBiroId(null); setFocusedBiroName(''); }, [scope]);

    return (
        <div className="flex flex-col gap-3 p-3 sm:p-4 bg-gray-50 min-h-screen" ref={containerRef}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white rounded-xl p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Struktur Organisasi</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {focusedBiroId ? `📁 ${focusedBiroName}` : 'Klik pada Biro/Bagian untuk melihat detail struktur'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} disabled={loading} className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">
                        {loading ? '⟳' : '↻'} Reload
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl p-3 shadow-sm">
                {!focusedBiroId && (
                    <Segmented value={scope} onChange={setScope}
                        options={[{ label: 'Pusat', value: 'PUSAT' }, { label: 'Daerah', value: 'DAERAH' }]} />
                )}
                {focusedBiroId && <div />}

                <div className="flex items-center gap-2">
                    <button onClick={handleZoomIn} className="p-2 rounded-lg border hover:bg-gray-50" title="Zoom In">+</button>
                    <button onClick={handleZoomOut} className="p-2 rounded-lg border hover:bg-gray-50" title="Zoom Out">−</button>
                    <button onClick={handleFit} className="p-2 rounded-lg border hover:bg-gray-50" title="Fit">⊞</button>
                    <div className="w-px h-6 bg-gray-300" />
                    <button onClick={handleExpandAll} className="px-2 py-1 rounded-lg border text-sm hover:bg-gray-50">▼ Expand</button>
                    <button onClick={handleCollapseAll} className="px-2 py-1 rounded-lg border text-sm hover:bg-gray-50">▶ Collapse</button>
                    <div className="w-px h-6 bg-gray-300" />
                    <button onClick={handleExportPDF} disabled={isExporting}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-50">
                        📄 Export PDF
                    </button>
                    <button onClick={toggleFullscreen} className="px-2 py-1.5 rounded-lg border text-sm hover:bg-gray-50">
                        ⛶ {isFullscreen ? 'Exit' : 'Full'}
                    </button>
                </div>
            </div>

            {err && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{err}</div>}

            {/* Chart */}
            <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden relative" style={{ minHeight: isFullscreen ? '100vh' : '65vh' }}>
                {/* Back button inside canvas */}
                {focusedBiroId && (
                    <div className="absolute top-4 left-4 z-20">
                        <button onClick={handleBack}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border-2 border-brand-500 text-brand-700 text-sm font-medium shadow-lg hover:bg-brand-50">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Kembali
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                        <div className="text-center space-y-2">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto" />
                            <p className="text-sm text-gray-600">Memuat struktur organisasi...</p>
                        </div>
                    </div>
                )}

                {!loading && orgData.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-gray-500 text-sm">Data kosong.</p>
                    </div>
                )}

                <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
            </div>

            {/* Tips */}
            <div className="text-xs text-gray-500 bg-brand-50 border border-brand-200 rounded-lg p-3">
                <strong className="text-brand-700">💡 Tips:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {focusedBiroId ? (
                        <li>Tekan tombol <strong>Kembali</strong> untuk kembali ke struktur lengkap</li>
                    ) : (
                        <>
                            <li>Klik pada <strong>Biro</strong> atau <strong>Bagian</strong> untuk melihat struktur detail (sampai Subbagian)</li>
                            <li>Gunakan tombol <strong>+/-</strong> untuk expand/collapse</li>
                        </>
                    )}
                </ul>
            </div>
        </div>
    );
}
