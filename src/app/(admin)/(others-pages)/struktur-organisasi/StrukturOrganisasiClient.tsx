'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import dynamic from "next/dynamic";
import {apiFetch} from "@/lib/apiFetch";
import type {RawNodeDatum, CustomNodeElementProps} from "react-d3-tree";

const Tree = dynamic(() => import("react-d3-tree").then((m) => m.default), {ssr: false});

// ---- Types dari backend
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
    nama_pejabat?: string | string[] | null;
};

// ---- Node internal + ghost
type D3Node = {
    _id: string;
    _slug: string;
    _path: string[];
    nama_jabatan: string;
    jenis_jabatan: string | null;
    bezetting: number | null;
    kebutuhan_pegawai: number | null;
    kelas_jabatan: string | null;
    nama_pejabat?: string | string[] | null;
    children: D3Node[];
    _ghost?: boolean;

    // sintetis sederhana (kotak ungu tanpa detail)
    _syntheticSimple?: boolean;
    _syntheticLabel?: string;
};

function wrapText(s: string, maxChars = 38): string[] {
    const words = (s || "").split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
        const test = (line ? line + " " : "") + w;
        if (test.length > maxChars) {
            if (line) lines.push(line);
            if (w.length > maxChars) {
                for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars));
                line = "";
            } else line = w;
        } else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [s];
}

function rankJenis(j: string | null | undefined): number {
    const t = (j || "").trim().toUpperCase();
    switch (t) {
        case "ESELON I":
            return 1;
        case "ESELON II":
            return 2;
        case "ESELON III":
            return 3;
        case "ESELON IV":
            return 4;
        case "JABATAN FUNGSIONAL":
            return 5;
        case "JABATAN PELAKSANA":
            return 6;
        case "PEGAWAI DPK":
            return 7;
        case "PEGAWAI CLTN":
            return 8;
        default:
            return 99;
    }
}

// Turunkan Inspektorat bila anak langsung SETJEN
function extraDepthOverride(parentSlug: string, childSlug: string, childName: string): number {
    const isParentSetjen = (parentSlug || "").toLowerCase() === "setjen";
    const childIsInspektoratByName = /^inspektorat$/i.test(childName || "");
    const childIsInspektoratBySlug = /^(inspektorat)/i.test((childSlug || ""));
    return (isParentSetjen && (childIsInspektoratByName || childIsInspektoratBySlug)) ? 1 : 0;
}

const fmtNum = (n: number | null | undefined) => (n ?? 0).toString();

type ScenarioSyntheticFlags = {
    addKJFforEselonII: boolean;
    addSKDPforSetjen: boolean;
    addKJFforEselonIII: boolean;
    kjfForInspekturAsE4: boolean;
};

type ScenarioResult = {
    rows: APIRow[];
    synthetic: ScenarioSyntheticFlags;
};

/**
 * Skenario (tetap sama):
 * 1) pusat=true,  fungsional=false (DEFAULT)
 * 2) pusat=true,  fungsional=true
 * 3) pusat=false, fungsional=false
 * 4) pusat=false, fungsional=true
 */
function filterByScenario(all: APIRow[], pusat: boolean, fungsional: boolean): ScenarioResult {
    const byId = new Map<string, APIRow>(all.map(r => [r.id, r]));
    const setjenNode = all.find(r => (r.slug || "").toLowerCase() === "setjen") || null;
    const setjenId = setjenNode?.id ?? null;

    const keep = new Set<string>();
    const add = (id: string) => keep.add(id);

    const addWithAncestors = (id: string, stopAtId?: string | null) => {
        let cur: string | null = id;
        while (cur) {
            add(cur);
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

    const jenisEq = (r: APIRow, s: string) => ((r.jenis_jabatan || "").toUpperCase() === s.toUpperCase());
    const jenisRankLE = (r: APIRow, n: number) => rankJenis(r.jenis_jabatan) <= n;

    // 1) Pusat + Struktural
    if (pusat && !fungsional) {
        for (const r of all) {
            if (r.is_pusat === true && !jenisEq(r, "JABATAN FUNGSIONAL")) add(r.id);
        }
        for (const id of Array.from(keep)) addWithAncestors(id);
        return {
            rows: all.filter(r => keep.has(r.id)),
            synthetic: {
                addKJFforEselonII: true,
                addSKDPforSetjen: true,
                addKJFforEselonIII: false,
                kjfForInspekturAsE4: true,
            },
        };
    }

    // 2) Pusat + Fungsional
    if (pusat && fungsional) {
        for (const r of all) {
            if (r.is_pusat === true && jenisRankLE(r, 2)) add(r.id);
        }
        for (const r of all) {
            if (r.is_pusat === true && jenisEq(r, "JABATAN FUNGSIONAL")) add(r.id);
        }
        for (const id of Array.from(keep)) addWithAncestors(id);
        return {
            rows: all.filter(r => keep.has(r.id)),
            synthetic: {
                addKJFforEselonII: false,
                addSKDPforSetjen: false,
                addKJFforEselonIII: false,
                kjfForInspekturAsE4: false,
            },
        };
    }

    // 3) Daerah + Struktural
    if (!pusat && !fungsional) {
        if (setjenId) add(setjenId);
        for (const r of all) {
            if (r.is_pusat === false && !jenisEq(r, "JABATAN FUNGSIONAL") && isUnderSetjen(r.id)) {
                add(r.id);
            }
        }
        for (const id of Array.from(keep)) addWithAncestors(id, setjenId);
        return {
            rows: all.filter(r => keep.has(r.id)),
            synthetic: {
                addKJFforEselonII: false,
                addSKDPforSetjen: false,
                addKJFforEselonIII: true, // E3 → KJF(E4)
                kjfForInspekturAsE4: false,
            },
        };
    }

    // 4) Daerah + Fungsional
    if (setjenId) add(setjenId);
    for (const r of all) {
        const isE3 = jenisEq(r, "ESELON III");
        const isJF = jenisEq(r, "JABATAN FUNGSIONAL");
        if (r.is_pusat === false && (isE3 || isJF) && isUnderSetjen(r.id)) {
            add(r.id);
        }
    }
    for (const id of Array.from(keep)) addWithAncestors(id, setjenId);
    return {
        rows: all.filter(r => keep.has(r.id)),
        synthetic: {
            addKJFforEselonII: false,
            addSKDPforSetjen: false,
            addKJFforEselonIII: false,
            kjfForInspekturAsE4: false,
        },
    };
}

/* ===== Segmented (tab kecil) ===== */
function Segmented<T extends string>({
                                         value, onChange, options, size = "md",
                                     }: {
    value: T;
    onChange: (v: T) => void;
    options: { label: string; value: T }[];
    size?: "sm" | "md";
}) {
    const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
    return (
        <div className="inline-flex rounded-lg border bg-white p-0.5">
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`${pad} rounded-md transition ${active ? "bg-purple-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                        aria-pressed={active}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ====== ENUM pilihan filter (revisi) ======
type ScopeOpt = "PUSAT" | "DAERAH";
type FungsionalOpt = "STRUKTURAL" | "FUNGSIONAL";

export default function StrukturOrganisasiClient() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerSize, setContainerSize] = useState({w: 0, h: 0});

    const [allRows, setAllRows] = useState<APIRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Filter UI (default: Pusat + Struktural)
    const [scope, setScope] = useState<ScopeOpt>("PUSAT");
    const [fungsionalMode, setFungsionalMode] = useState<FungsionalOpt>("STRUKTURAL");
    const [filterText, setFilterText] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);

    // collapse map
    const [collapseMap, setCollapseMap] = useState<Record<string, boolean>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch("/api/struktur-organisasi", {cache: "no-store"});
            if (!res.ok) throw new Error(`Gagal mengambil data (${res.status})`);
            const data: APIRow[] = await res.json();
            setAllRows(data);
        } catch (e: any) {
            setErr(e?.message || "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(([entry]) => {
            if (entry?.contentRect) setContainerSize({w: entry.contentRect.width, h: entry.contentRect.height});
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const onFs = () => {
            const fs = !!document.fullscreenElement;
            setIsFullscreen(fs);
            if (containerRef.current) {
                containerRef.current.style.height = fs ? "100vh" : "70vh";
                containerRef.current.style.background = "#fff";
            }
        };
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    const enterFullscreen = async () => {
        if (containerRef.current) try {
            await containerRef.current.requestFullscreen();
        } catch {
        }
    };
    const exitFullscreen = async () => {
        if (document.fullscreenElement) try {
            await document.exitFullscreen();
        } catch {
        }
    };

    // Map enum → skenario boolean
    const scenario = useMemo(() => {
        const pusat = scope === "PUSAT";
        const fungsional = fungsionalMode === "FUNGSIONAL";
        return filterByScenario(allRows, pusat, fungsional);
    }, [allRows, scope, fungsionalMode]);

    const rows = scenario.rows;
    const syntheticFlags = scenario.synthetic;

    useEffect(() => {
        const map: Record<string, boolean> = {};
        for (const r of rows) map[r.id] = true;
        setCollapseMap(map);
    }, [rows]);

    const roots: D3Node[] = useMemo(() => {
        if (!rows.length) return [];

        const byParent = new Map<string | null, APIRow[]>();
        for (const r of rows) {
            const arr = byParent.get(r.parent_id) || [];
            arr.push(r);
            byParent.set(r.parent_id, arr);
        }
        for (const [k, arr] of byParent.entries()) {
            arr.sort((a, b) =>
                (a.order_index ?? 0) - (b.order_index ?? 0) ||
                a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
            );
            byParent.set(k, arr);
        }

        const wrapWithGhost = (parentId: string, parentPath: string[], childNode: D3Node, layers: number): D3Node => {
            let result = childNode;
            for (let i = 1; i <= layers; i++) {
                result = {
                    _id: `ghost:${parentId}:${result._id}:L${i}`,
                    _slug: "",
                    _path: parentPath.slice(),
                    nama_jabatan: "",
                    jenis_jabatan: null,
                    bezetting: null,
                    kebutuhan_pegawai: null,
                    kelas_jabatan: null,
                    nama_pejabat: null,
                    _ghost: true,
                    children: [result],
                };
            }
            return result;
        };

        const build = (n: APIRow, parentPath: string[]): D3Node => {
            const myPath = [...parentPath, n.slug];
            const self: D3Node = {
                _id: n.id,
                _slug: n.slug,
                _path: myPath,
                nama_jabatan: n.nama_jabatan,
                jenis_jabatan: n.jenis_jabatan ?? null,
                bezetting: n.bezetting ?? null,
                kebutuhan_pegawai: n.kebutuhan_pegawai ?? null,
                kelas_jabatan: n.kelas_jabatan ?? null,
                nama_pejabat: n.nama_pejabat ?? null,
                children: [],
            };

            const rawKids = (byParent.get(n.id) || []).map(child => build(child, myPath));

            const synthetic: D3Node[] = [];

            // ESELON II → KJF (E3; Inspektur/Inspektorat → E4)
            if (syntheticFlags.addKJFforEselonII && (n.jenis_jabatan || "").toUpperCase() === "ESELON II") {
                const isInspektorat =
                    /(inspektur|inspektorat)/i.test(n.nama_jabatan || "") ||
                    /(inspektur|inspektorat)/i.test(n.slug || "");
                const kjfLevel = (syntheticFlags.kjfForInspekturAsE4 && isInspektorat) ? "ESELON IV" : "ESELON III";
                synthetic.push({
                    _id: `synthetic-kjf:${n.id}`,
                    _slug: "kjf",
                    _path: [...myPath, "kjf"],
                    nama_jabatan: "Kelompok Jabatan Fungsional",
                    jenis_jabatan: kjfLevel,
                    bezetting: null,
                    kebutuhan_pegawai: null,
                    kelas_jabatan: null,
                    nama_pejabat: null,
                    children: [],
                    _syntheticSimple: true,
                    _syntheticLabel: "KELOMPOK JABATAN FUNGSIONAL",
                });
            }

            // SETJEN → SKDP (E3)
            if (syntheticFlags.addSKDPforSetjen && (n.slug || "").toLowerCase() === "setjen") {
                synthetic.push({
                    _id: `synthetic-skdp:${n.id}`,
                    _slug: "skdp",
                    _path: [...myPath, "skdp"],
                    nama_jabatan: "Sekretariat Kantor DPD RI di Ibu Kota Provinsi",
                    jenis_jabatan: "ESELON III",
                    bezetting: null,
                    kebutuhan_pegawai: null,
                    kelas_jabatan: null,
                    nama_pejabat: null,
                    children: [],
                    _syntheticSimple: true,
                    _syntheticLabel: "SEKRETARIAT KANTOR DPD RI DI IBU KOTA PROVINSI",
                });
            }

            // ESELON III → KJF (E4) untuk skenario daerah-struktural
            if (syntheticFlags.addKJFforEselonIII && (n.jenis_jabatan || "").toUpperCase() === "ESELON III") {
                synthetic.push({
                    _id: `synthetic-kjf-e3:${n.id}`,
                    _slug: "kjf",
                    _path: [...myPath, "kjf"],
                    nama_jabatan: "Kelompok Jabatan Fungsional",
                    jenis_jabatan: "ESELON IV",
                    bezetting: null,
                    kebutuhan_pegawai: null,
                    kelas_jabatan: null,
                    nama_pejabat: null,
                    children: [],
                    _syntheticSimple: true,
                    _syntheticLabel: "KELOMPOK JABATAN FUNGSIONAL",
                });
            }

            const allKids = [...rawKids, ...synthetic];
            if (allKids.length) {
                const ranks = allKids.map(k => rankJenis(k.jenis_jabatan));
                const minRank = Math.min(...ranks);
                const adjusted = allKids.map((kid) => {
                    const childRank = rankJenis(kid.jenis_jabatan);
                    const baseOffset = Math.max(0, childRank - minRank);
                    const nameMin = extraDepthOverride(n.slug, kid._slug, kid.nama_jabatan);
                    const offset = Math.max(baseOffset, nameMin);
                    return offset > 0 ? wrapWithGhost(n.id, myPath, kid, offset) : kid;
                });
                self.children = adjusted;
            }

            return self;
        };

        return (byParent.get(null) || []).map(root => build(root, []));
    }, [rows, syntheticFlags]);

    const lcFilter = filterText.trim().toLowerCase();
    const filteredRoots: D3Node[] = useMemo(() => {
        if (!lcFilter) return roots;
        const match = (n: D3Node) =>
            (n.nama_jabatan || "").toLowerCase().includes(lcFilter) ||
            (n._slug || "").toLowerCase().includes(lcFilter);
        const walk = (n: D3Node): D3Node | null => {
            const kids = n.children.map(walk).filter(Boolean) as D3Node[];
            if (match(n) || kids.length) return {...n, children: kids};
            return null;
        };
        return roots.map(walk).filter(Boolean) as D3Node[];
    }, [roots, lcFilter]);

    const toRD3 = (n: D3Node): RawNodeDatum => {
        const id = n._id;
        const isGhost = !!n._ghost;
        const hasChildren = n.children.length > 0;
        const isCollapsed = !isGhost && !!collapseMap[id];
        const pathStr = n._path.join("/");

        return {
            name: n.nama_jabatan,
            attributes: {
                id,
                slug: n._slug,
                ghost: isGhost,
                jenis: n.jenis_jabatan,
                isCollapsed,
                hasChildren,
                pathStr,
                bezetting: n.bezetting,
                kebutuhan_pegawai: n.kebutuhan_pegawai,
                kelas_jabatan: n.kelas_jabatan,
                nama_pejabat: n.nama_pejabat ?? null,
                syntheticSimple: n._syntheticSimple === true,
                syntheticLabel: n._syntheticLabel || null,
            } as any,
            children: isCollapsed ? [] : n.children.map(toRD3),
        };
    };
    const rd3Data: RawNodeDatum[] = useMemo(() => filteredRoots.map(toRD3), [filteredRoots, collapseMap]);

    function collectIds(node: RawNodeDatum): string[] {
        const attrs = node.attributes as any;
        const myId = attrs?.id;
        const ids = myId ? [myId] : [];
        if (node.children) for (const c of node.children) ids.push(...collectIds(c));
        return ids;
    }

    const toggleByDatum = useCallback((nodeDatum: CustomNodeElementProps["nodeDatum"], e?: React.MouseEvent<SVGGElement>) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const attrs = nodeDatum.attributes as any;
        if (!attrs?.id || attrs.ghost) return;
        setCollapseMap(prev => {
            const currentlyCollapsed = !!prev[attrs.id];
            if (currentlyCollapsed) {
                return {...prev, [attrs.id]: false};
            } else {
                const ids = collectIds(nodeDatum);
                const newMap = {...prev};
                ids.forEach(id => {
                    newMap[id] = true;
                });
                return newMap;
            }
        });
    }, []);

    // Layout & ukuran
    const cardWidth = 520;
    const lineHeight = 16;
    const kelasH = 20;
    const metricsH = 30;
    const bodyGap = 8;
    const cardPadX = 12;
    const cardPadY = 10;

    const renderNode = useCallback((props: CustomNodeElementProps) => {
        const {nodeDatum} = props;
        const attrs = nodeDatum.attributes as any;
        if (attrs.ghost) return <g/>;

        // Node sintetis
        if (attrs.syntheticSimple) {
            const simpleW = cardWidth;
            const simpleH = 80;
            const xLeft = -(simpleW / 2);
            const yTop = -(simpleH / 2);
            const label: string = attrs.syntheticLabel || (nodeDatum.name || "");
            const isCollapsed = !!attrs.isCollapsed;
            const hasChildren = !!attrs.hasChildren;

            return (
                <g>
                    <rect x={xLeft} y={yTop} width={simpleW} height={simpleH} rx={8} ry={8}
                          fill="#F3E8FF" stroke="#6b21a8" strokeWidth={1}
                          style={{filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))"}}/>
                    <text x={0} y={0} textAnchor="middle" alignmentBaseline="central"
                          stroke="none"
                          strokeWidth={0}
                          fill="#000" style={{fontSize: "14px", fontWeight: 800}}>
                        {label.toUpperCase()}
                    </text>
                    {hasChildren && (
                        <g transform={`translate(${xLeft + simpleW - 26}, ${yTop + 8})`}
                           onClick={(e) => toggleByDatum(nodeDatum, e)} style={{cursor: "pointer"}}>
                            <rect width="18" height="18" rx="5" ry="5" fill="#fff" stroke="#c4c4c4"/>
                            <path d="M6 5 L12 9 L6 13 Z" fill="#6b7280"
                                  transform={isCollapsed ? "" : "rotate(90 9 9)"}/>
                        </g>
                    )}
                </g>
            );
        }

        // Node normal
        const isCollapsed = !!attrs.isCollapsed;
        const hasChildren = !!attrs.hasChildren;

        const jabatan = (nodeDatum.name ?? "").toUpperCase();
        const titleLines = wrapText(jabatan, 38);
        const titleBlockH = Math.max(40, titleLines.length * lineHeight + 14);

        const kelas: string = attrs.kelas_jabatan ?? "-";
        const bez: number = attrs.bezetting ?? 0;
        const keb: number = attrs.kebutuhan_pegawai ?? 0;
        const sel: number = bez - keb;
        const selColor = sel < 0 ? "#b91c1c" : sel > 0 ? "#065f46" : "#374151";

        const namesArr: string[] =
            Array.isArray(attrs.nama_pejabat) ? attrs.nama_pejabat :
                attrs.nama_pejabat ? [attrs.nama_pejabat as string] : [];

        const barPerNameH = 28;
        const barGap = 6;
        const numBars = Math.max(1, namesArr.length);
        const namesTotalH = numBars * barPerNameH + (numBars - 1) * barGap;

        const cardHeight = cardPadY + titleBlockH + 2 + kelasH + bodyGap + namesTotalH + cardPadY;
        const xLeft = -(cardWidth / 2);
        const yTop = -(cardHeight / 2);

        const yTitle = yTop + cardPadY;
        const yKelas = yTitle + titleBlockH + 2;
        const yBarsStart = yKelas + kelasH + bodyGap;

        const boxW = 48;
        const gap = 8;
        const metricsTotalW = boxW * 3 + gap * 2;
        const barsW = cardWidth - (cardPadX * 2) - metricsTotalW - 10;
        const barsX = xLeft + cardPadX;
        const metricsX = xLeft + cardWidth - cardPadX - metricsTotalW;

        const metricBox = (x: number, y: number, w: number, h: number, value: string, color = "#111827") => (
            <g>
                <rect x={x} y={y} width={w} height={h} rx={6} ry={6} fill="#ffffff" stroke="#d1d5db"/>
                <text x={x + w / 2} y={y + h / 2} textAnchor="middle" alignmentBaseline="central"
                      stroke="none"
                      strokeWidth={0}
                      fill={color} style={{fontSize: "14px", fontWeight: 800}}>
                    {value}
                </text>
            </g>
        );

        const labelY = yKelas + kelasH / 2;
        const pathStr: string = attrs.pathStr || "";
        const href = `/anjab/${pathStr}`;

        return (
            <g>
                {/* KARTU */}
                <rect x={xLeft} y={yTop} width={cardWidth} height={cardHeight}
                      rx={8} ry={8} fill="#ffffff" stroke="#8200DB" strokeWidth={1}
                      style={{filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))"}}/>

                {/* HEADER */}
                <rect x={xLeft + 1} y={yTitle - 8} width={cardWidth - 2} height={titleBlockH}
                      stroke="none"
                      strokeWidth={0}
                      rx={4} ry={4} fill="#F3E8FF"/>
                <a href={href} target="_self" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    {titleLines.map((line, i) => (
                        <text key={i} x={0}
                              y={(yTitle + titleBlockH / 2 - (titleLines.length - 1) * (lineHeight / 2) + i * lineHeight) - 8}
                              textAnchor="middle" alignmentBaseline="central"
                              stroke="none"
                              strokeWidth={0}
                              fill="#111827" style={{fontSize: "12.5px", fontWeight: 700, textDecoration: "underline"}}>
                            {line}
                        </text>
                    ))}
                </a>

                {/* KELAS + LABEL B/K/± */}
                <text x={0} y={labelY} textAnchor="middle" alignmentBaseline="central"
                      stroke="none"
                      strokeWidth={0}
                      fill="#111827" style={{fontSize: "12px", fontWeight: 600}}>
                    {`Kelas Jabatan = ${kelas}`}
                </text>
                <text x={metricsX + (boxW + 8) * 0 + boxW / 2} y={labelY} textAnchor="middle"
                      stroke="none"
                      strokeWidth={0}
                      alignmentBaseline="central" fill="#111827" style={{fontSize: "11px", fontWeight: 700}}>B
                </text>
                <text x={metricsX + (boxW + 8) * 1 + boxW / 2} y={labelY} textAnchor="middle"
                      stroke="none"
                      strokeWidth={0}
                      alignmentBaseline="central" fill="#111827" style={{fontSize: "11px", fontWeight: 700}}>K
                </text>
                <text x={metricsX + (boxW + 8) * 2 + boxW / 2} y={labelY} textAnchor="middle"
                      stroke="none"
                      strokeWidth={0}
                      alignmentBaseline="central" fill="#111827" style={{fontSize: "11px", fontWeight: 800}}>±
                </text>

                {/* BAR NAMA */}
                {Array.from({length: Math.max(1, namesArr.length || 0)}).map((_, idx) => {
                    const y = yBarsStart + idx * (28 + 6);
                    const nama = namesArr[idx] ?? "";
                    return (
                        <g key={idx}>
                            <rect x={barsX} y={y} width={barsW} height={28} rx={4} ry={4} fill="#ffffff"
                                  stroke="#c4c4c4"/>
                            {nama && (
                                <text x={barsX + barsW / 2} y={y + 14} textAnchor="middle"
                                      alignmentBaseline="central" fill="#111827"
                                      stroke="none"
                                      strokeWidth={0}
                                      style={{fontSize: "12px", fontWeight: 800}}>
                                    {nama}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* METRIK */}
                {metricBox(metricsX + (boxW + 8) * 0, yBarsStart, boxW, metricsH, fmtNum(bez))}
                {metricBox(metricsX + (boxW + 8) * 1, yBarsStart, boxW, metricsH, fmtNum(keb))}
                {metricBox(metricsX + (boxW + 8) * 2, yBarsStart, boxW, metricsH, fmtNum(sel), selColor)}

                {/* Panah collapse/expand */}
                {hasChildren && (
                    <g transform={`translate(${xLeft + cardWidth - 26}, ${yTop + 8})`}
                       onClick={(e) => toggleByDatum(nodeDatum, e)} style={{cursor: "pointer"}}>
                        <rect width="18" height="18" rx="5" ry="5" fill="#ffffff" stroke="#c4c4c4"/>
                        <path d="M6 5 L12 9 L6 13 Z" fill="#6b7280"
                              transform={isCollapsed ? "" : "rotate(90 9 9)"}/>
                    </g>
                )}
            </g>
        );
    }, [toggleByDatum]);

    const translate = useMemo(() => ({x: Math.max(40, containerSize.w / 2), y: 110}), [containerSize]);

    return (
        <div className="flex flex-col gap-3 p-4">
            {/* BARIS ATAS: Judul — Search & Fullscreen */}
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Peta Jabatan</h1>
                <div className="flex items-center gap-2">
                    <input
                        placeholder="Cari Jabatan"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="px-3 py-2 rounded border text-sm w-[320px]"
                    />
                    <button onClick={() => setFilterText("")}
                            className="px-2 py-2 rounded border text-sm hover:bg-gray-50">
                        Reset
                    </button>
                    {!isFullscreen ? (
                        <button onClick={enterFullscreen} className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
                            Fullscreen
                        </button>
                    ) : (
                        <button onClick={exitFullscreen} className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
                            Exit Fullscreen
                        </button>
                    )}
                </div>
            </div>

            {/* BARIS BAWAH: Reload + Segmented Filter */}
            <div className="mt-2 flex flex-wrap items-center gap-4">
                <button onClick={load} disabled={loading}
                        className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50">
                    {loading ? "Memuat…" : "Reload"}
                </button>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Wilayah:</span>
                    <Segmented
                        value={scope}
                        onChange={setScope}
                        options={[
                            {label: "Pusat", value: "PUSAT"},
                            {label: "Daerah", value: "DAERAH"},
                        ]}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Jenis:</span>
                    <Segmented
                        value={fungsionalMode}
                        onChange={setFungsionalMode}
                        options={[
                            {label: "Struktural", value: "STRUKTURAL"},
                            {label: "Fungsional", value: "FUNGSIONAL"},
                        ]}
                    />
                </div>
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}

            <div
                ref={containerRef}
                style={{width: "100%", height: "70vh", border: "1px solid #e5e7eb", background: "#fff"}}
                className="rounded"
            >
                {typeof window !== "undefined" && rd3Data.length > 0 && (
                    <Tree
                        data={rd3Data}
                        orientation="vertical"
                        translate={translate}
                        zoomable
                        collapsible={false}
                        zoom={0.85}
                        pathFunc="step"
                        nodeSize={{x: 560, y: 240}}
                        separation={{siblings: 1.2, nonSiblings: 1.4}}
                        transitionDuration={250}
                        renderCustomNodeElement={renderNode}
                    />
                )}
                {!loading && rd3Data.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                        {rows.length === 0 ? "Data kosong." : "Tidak ada yang cocok dengan filter/cari."}
                    </div>
                )}
            </div>

            <div className="text-xs text-gray-500">
                • Drag background untuk pan, scroll untuk zoom. Klik panah untuk collapse/expand subtree. Klik judul
                jabatan untuk buka halaman anjab.
            </div>
        </div>
    );
}
