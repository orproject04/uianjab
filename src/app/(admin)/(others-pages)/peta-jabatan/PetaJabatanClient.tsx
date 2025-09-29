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
    case "ESELON I": return 1;
    case "ESELON II": return 2;
    case "ESELON III": return 3;
    case "ESELON IV": return 4;
    case "JABATAN FUNGSIONAL": return 5;
    case "JABATAN PELAKSANA": return 6;
    case "PEGAWAI DPK": return 7;
    case "PEGAWAI CLTN": return 8;
    default: return 99;
  }
}

// Turunkan Inspektorat bila anak langsung SETJEN
function extraDepthOverride(parentSlug: string, childSlug: string, childName: string): number {
  const isParentSetjen = (parentSlug || "").toLowerCase() === "setjen";
  const childIsInspektoratByName = /^inspektorat$/i.test(childName || "");
  const childIsInspektoratBySlug = /^(inspektorat)/i.test((childSlug || ""));
  return (isParentSetjen && (childIsInspektoratByName || childIsInspektoratBySlug)) ? 1 : 0;
}

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
 * Skenario:
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
    for (const r of all) if (r.is_pusat === true && !jenisEq(r, "JABATAN FUNGSIONAL")) add(r.id);
    for (const id of Array.from(keep)) addWithAncestors(id);
    return {
      rows: all.filter(r => keep.has(r.id)),
      synthetic: { addKJFforEselonII: true, addSKDPforSetjen: true, addKJFforEselonIII: false, kjfForInspekturAsE4: true },
    };
  }

  // 2) Pusat + Fungsional
  if (pusat && fungsional) {
    for (const r of all) if (r.is_pusat === true && jenisRankLE(r, 2)) add(r.id);
    for (const r of all) if (r.is_pusat === true && jenisEq(r, "JABATAN FUNGSIONAL")) add(r.id);
    for (const id of Array.from(keep)) addWithAncestors(id);
    return {
      rows: all.filter(r => keep.has(r.id)),
      synthetic: { addKJFforEselonII: false, addSKDPforSetjen: false, addKJFforEselonIII: false, kjfForInspekturAsE4: false },
    };
  }

  // 3) Daerah + Struktural
  if (!pusat && !fungsional) {
    if (setjenId) add(setjenId);
    for (const r of all) if (r.is_pusat === false && !jenisEq(r, "JABATAN FUNGSIONAL") && isUnderSetjen(r.id)) add(r.id);
    for (const id of Array.from(keep)) addWithAncestors(id, setjenId);
    return {
      rows: all.filter(r => keep.has(r.id)),
      synthetic: { addKJFforEselonII: false, addSKDPforSetjen: false, addKJFforEselonIII: true, kjfForInspekturAsE4: false },
    };
  }

  // 4) Daerah + Fungsional
  if (setjenId) add(setjenId);
  for (const r of all) {
    const isE3 = jenisEq(r, "ESELON III");
    const isJF = jenisEq(r, "JABATAN FUNGSIONAL");
    if (r.is_pusat === false && (isE3 || isJF) && isUnderSetjen(r.id)) add(r.id);
  }
  for (const id of Array.from(keep)) addWithAncestors(id, setjenId);
  return {
    rows: all.filter(r => keep.has(r.id)),
    synthetic: { addKJFforEselonII: false, addSKDPforSetjen: false, addKJFforEselonIII: false, kjfForInspekturAsE4: false },
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

// ====== ENUM pilihan filter ======
type ScopeOpt = "PUSAT" | "DAERAH";
type FungsionalOpt = "STRUKTURAL" | "FUNGSIONAL";

export default function PetaJabatanClient() {
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
      const res = await apiFetch("/api/peta-jabatan", {cache: "no-store"});
      if (!res.ok) throw new Error(`Gagal mengambil data (${res.status})`);
      const data: APIRow[] = await res.json();
      setAllRows(data);
    } catch (e: any) {
      setErr(e?.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        containerRef.current.style.height = fs ? "100vh" : (window.innerWidth < 640 ? "80vh" : "70vh");
        containerRef.current.style.background = "#fff";
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const enterFullscreen = async () => { if (containerRef.current) try { await containerRef.current.requestFullscreen(); } catch {} };
  const exitFullscreen = async () => { if (document.fullscreenElement) try { await document.exitFullscreen(); } catch {} };

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

  // ---------- Breakpoints (berbasis lebar kontainer) ----------
  const bp = useMemo(() => {
    const w = containerSize.w || (typeof window !== "undefined" ? window.innerWidth : 0);
    return { isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, w };
  }, [containerSize.w]);

  // ==== Build tree roots (D3Node) ====
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

  // ==== Filter text ====
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

  // ==== Convert to RawNodeDatum ====
  function collectIds(node: RawNodeDatum): string[] {
    const attrs = node.attributes as any;
    const myId = attrs?.id;
    const ids = myId ? [myId] : [];
    if (node.children) for (const c of node.children) ids.push(...collectIds(c));
    return ids;
  }

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

  const rd3Data: RawNodeDatum[] = useMemo(
    () => filteredRoots.map(toRD3),
    [filteredRoots, collapseMap]
  );

  const toggleByDatum = useCallback((nodeDatum: CustomNodeElementProps["nodeDatum"], e?: React.MouseEvent<SVGGElement>) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const attrs = nodeDatum.attributes as any;
    if (!attrs?.id || attrs.ghost) return;
    setCollapseMap(prev => {
      const currentlyCollapsed = !!prev[attrs.id];
      if (currentlyCollapsed) {
        return {...prev, [attrs.id]: false};
      } else {
        const ids = collectIds(nodeDatum);
        const newMap = {...prev};
        ids.forEach(id => { newMap[id] = true; });
        return newMap;
      }
    });
  }, []);

  // -------- Responsive sizing tokens (card, fonts, node gap) --------
  const cardW = bp.isMobile ? 300 : bp.isTablet ? 420 : 520;
  const padX = bp.isMobile ? 12 : 14;
  const padY = bp.isMobile ? 10 : 12;

  const titleFontPx = bp.isMobile ? 12 : 13;
  const approxCharPx = 7.6;
  const usableTitleW = cardW - 2 * padX;
  const maxTitleChars = Math.max(20, Math.floor(usableTitleW / approxCharPx));

  const boxW = bp.isMobile ? 28 : 34;
  const boxH = bp.isMobile ? 22 : 24;
  const boxGap = 10;
  const textFieldH = bp.isMobile ? 30 : 34;

  const nodeSize = useMemo(() => {
    const x = cardW + (bp.isMobile ? 40 : 60);
    const y = bp.isMobile ? 180 : bp.isTablet ? 210 : 240;
    return { x, y };
  }, [cardW, bp.isMobile, bp.isTablet]);

  const initialZoom = bp.isMobile ? 0.55 : bp.isTablet ? 0.7 : 0.85;
  const separation = { siblings: bp.isMobile ? 1.05 : 1.2, nonSiblings: bp.isMobile ? 1.15 : 1.4 };
  const translate = useMemo(() => ({x: Math.max(24, containerSize.w / 2), y: bp.isMobile ? 80 : 110}), [containerSize, bp.isMobile]);

  // ==== Custom Node Renderer ====
  const renderNode = useCallback((props: CustomNodeElementProps) => {
    const { nodeDatum } = props;
    const attrs = nodeDatum.attributes as any;
    if (attrs.ghost) return <g />;

    // NODE SINTETIS
    if (attrs.syntheticSimple) {
      const W = cardW;
      const H = bp.isMobile ? 70 : 80;
      const xLeft = -W / 2;
      const yTop = -H / 2;
      const label: string = attrs.syntheticLabel || (nodeDatum.name || "");
      const isCollapsed = !!attrs.isCollapsed;
      const hasChildren = !!attrs.hasChildren;

      return (
        <g>
          <rect x={xLeft} y={yTop} width={W} height={H} rx={8} ry={8}
                fill="#F3E8FF" strokeWidth={1}
                style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))" }} />
          <text x={0} y={0} textAnchor="middle" alignmentBaseline="central"
                fill="#111827" style={{ fontSize: bp.isMobile ? "12px" : "13px", fontWeight: 200 }}>
            {String(label).toUpperCase()}
          </text>

          {hasChildren && (
            <g transform={`translate(${xLeft + W - (bp.isMobile ? 24 : 26)}, ${yTop + 8})`}
               onClick={(e) => toggleByDatum(nodeDatum, e)} style={{ cursor: "pointer" }}>
              <rect width={bp.isMobile ? 16 : 18} height={bp.isMobile ? 16 : 18} rx={5} ry={5}
                    fill="#fff" stroke="#c4c4c4" strokeWidth={1} />
              <path d="M6 5 L12 9 L6 13 Z" fill="#6b7280"
                    transform={isCollapsed ? "" : "rotate(90 9 9)"} />
            </g>
          )}
        </g>
      );
    }

    // NODE NORMAL
    const isCollapsed = !!attrs.isCollapsed;
    const hasChildren = !!attrs.hasChildren;

    const title = String(nodeDatum.name ?? "").toUpperCase();
    const titleLines = wrapText(title, maxTitleChars);
    const lineH = 16;

    const kelas: string = attrs.kelas_jabatan ?? "-";
    const kelasHLocal = bp.isMobile ? 16 : 18;
    const headerH = Math.max(bp.isMobile ? 36 : 40, titleLines.length * lineH + 6) + kelasHLocal + 8;

    const bez: number = attrs.bezetting ?? 0;
    const keb: number = attrs.kebutuhan_pegawai ?? 0;
    const sel: number = bez - keb;

    const namesArr: string[] = Array.isArray(attrs.nama_pejabat)
      ? (attrs.nama_pejabat as string[])
      : attrs.nama_pejabat ? [attrs.nama_pejabat as string] : [];
    const namaPejabatText = namesArr.join(", ");

    const labelGapTop = bp.isMobile ? 8 : 10;
    const metricsTotalW = boxW * 3 + boxGap * 2;
    const gapAfterBoxes = bp.isMobile ? 10 : 12;

    const cardH = padY + headerH + labelGapTop + 14 + 4 + boxH + gapAfterBoxes + textFieldH + padY;

    const xLeft = -cardW / 2;
    const yTop = -cardH / 2;

    const yHeaderTop = yTop + padY;
    const centerX = 0;

    const yTitleStart = yHeaderTop + 6;
    const yKelas = yTitleStart + titleLines.length * lineH + 4;

    const yLabelBKP = yHeaderTop + headerH + labelGapTop;
    const yBoxes = yLabelBKP + 14 + 4;

    const boxesStartX = -metricsTotalW / 2;

    const metricBox = (x: number, y: number, value: string, color = "#111827") => (
      <g>
        <rect x={x} y={y} width={boxW} height={boxH} rx={6} ry={6} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1}/>
        <text x={x + boxW / 2} y={y + boxH / 2} textAnchor="middle" alignmentBaseline="central"
              fill={color} strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>
          {value}
        </text>
      </g>
    );

    const pathStr: string = attrs.pathStr || "";
    const href = `/anjab/${pathStr}`;

    return (
      <g>
        {/* KARTU */}
        <rect x={xLeft} y={yTop} width={cardW} height={cardH}
              rx={8} ry={8} fill="#ffffff" stroke="#8200DB" strokeWidth={1}
              style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))" }} />

        {/* HEADER UNGU */}
        <rect x={xLeft + 1} y={yTop} width={cardW - 2} height={headerH + padY}
              rx={10} ry={10} fill="#F3E8FF" strokeOpacity={0.15} strokeWidth={1} />

        {/* JUDUL */}
        <a href={href} target="_self" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {titleLines.map((line, i) => (
            <text key={i} x={centerX} y={yTitleStart + i * lineH}
                  textAnchor="middle" alignmentBaseline="hanging"
                  fill="#111827" strokeWidth={1}
                  style={{ fontSize: `${titleFontPx}px`, fontWeight: 200, textDecoration: "underline", opacity: 0.85 }}>
              {line}
            </text>
          ))}
        </a>

        {/* KELAS JABATAN */}
        <text x={centerX} y={yKelas} textAnchor="middle" alignmentBaseline="hanging"
              strokeWidth={1} fill="#6b7280"
              style={{ fontSize: bp.isMobile ? "10px" : "11px", fontWeight: 50, opacity: 0.5 }}>
          {`Kelas Jabatan : ${kelas || "-"}`}
        </text>

        {/* LABEL B K ± */}
        <text x={boxesStartX + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
              fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>B</text>
        <text x={boxesStartX + boxW + boxGap + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
              fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>K</text>
        <text x={boxesStartX + (boxW + boxGap) * 2 + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
              fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>±</text>

        {/* KOTAK ANGKA */}
        {metricBox(boxesStartX + (boxW + boxGap) * 0, yBoxes, String(bez ?? 0))}
        {metricBox(boxesStartX + (boxW + boxGap) * 1, yBoxes, String(keb ?? 0))}
        {metricBox(boxesStartX + (boxW + boxGap) * 2, yBoxes, String(sel ?? 0))}

        {/* TEXT FIELD NAMA */}
        <g>
          <rect x={xLeft + padX} y={yBoxes + boxH +  (bp.isMobile ? 10 : 12)}
                width={cardW - padX * 2} height={textFieldH}
                rx={6} ry={6} fill="#ffffff" stroke="#c4c4c4" strokeWidth={1} />
          {namaPejabatText && (
            <text x={xLeft + padX + 10} y={yBoxes + boxH + (bp.isMobile ? 10 : 12) + textFieldH / 2}
                  textAnchor="start" alignmentBaseline="central"
                  fill="#111827" strokeWidth={1}
                  style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>
              {namaPejabatText}
            </text>
          )}
        </g>

        {/* Tombol panah/play */}
        {hasChildren && (
          <g transform={`translate(${xLeft + cardW - (bp.isMobile ? 28 : 32)}, ${yTop + 10})`}
             onClick={(e) => toggleByDatum(nodeDatum, e)} style={{ cursor: "pointer" }}>
            <rect width={bp.isMobile ? 20 : 22} height={bp.isMobile ? 20 : 22}
                  rx={6} ry={6} fill="#ffffff" stroke="#c4c4c4" />
            <path d="M8 6 L16 11 L8 16 Z" fill="#6b7280"
                  transform={isCollapsed ? "" : "rotate(90 11 11)"} />
          </g>
        )}
      </g>
    );
  }, [toggleByDatum, bp.isMobile, bp.isTablet, cardW, padX, padY, boxW, boxH, maxTitleChars, titleFontPx]);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {/* ===== TOP BAR (mobile seperti screenshot, desktop seperti semula) ===== */}
      {bp.isMobile ? (
        <div className="flex flex-col gap-2">
          {/* Baris 1: Search + Reset */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              placeholder="Cari Jabatan"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="px-3 py-2 rounded border text-sm"
            />
            <button
              onClick={() => setFilterText("")}
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
          {/* Baris 2: Reload & Fullscreen full-width */}
          <button
            onClick={load}
            disabled={loading}
            className="w-full px-3 py-2 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Memuat…" : "Reload"}
          </button>
          {!isFullscreen ? (
            <button
              onClick={enterFullscreen}
              className="w-full px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              Fullscreen
            </button>
          ) : (
            <button
              onClick={exitFullscreen}
              className="w-full px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              Exit Fullscreen
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Peta Jabatan</h1>
          <div className="flex items-center gap-2">
            <input
              placeholder="Cari Jabatan"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="px-3 py-2 rounded border text-sm w-[320px]"
            />
            <button
              onClick={() => setFilterText("")}
              className="px-2 py-2 rounded border text-sm hover:bg-gray-50"
            >
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
      )}

      {/* ===== BARIS FILTER (Wilayah/Jenis di bawah) ===== */}
      <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[{label: "Pusat", value: "PUSAT"}, {label: "Daerah", value: "DAERAH"}]}
            size={bp.isMobile ? "sm" : "md"}
          />
          <Segmented
            value={fungsionalMode}
            onChange={setFungsionalMode}
            options={[{label: "Struktural", value: "STRUKTURAL"}, {label: "Fungsional", value: "FUNGSIONAL"}]}
            size={bp.isMobile ? "sm" : "md"}
          />
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div
        ref={containerRef}
        style={{width: "100%", height: (isFullscreen ? "100vh" : (bp.isMobile ? "80vh" : "70vh")), border: "1px solid #e5e7eb", background: "#fff"}}
        className="rounded"
      >
        {/* Render Tree hanya jika ada data valid */}
        {typeof window !== "undefined" && rd3Data.length > 0 ? (
          <Tree
            data={rd3Data}
            orientation="vertical"
            translate={translate}
            zoomable
            collapsible={false}
            zoom={initialZoom}
            pathFunc="step"
            nodeSize={nodeSize}
            separation={separation}
            transitionDuration={250}
            renderCustomNodeElement={renderNode}
          />
        ) : (
          !loading && (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
              {rows.length === 0 ? "Data kosong." : "Tidak ada yang cocok dengan filter/cari."}
            </div>
          )
        )}
      </div>

      <div className="text-[10px] sm:text-xs text-gray-500">
        • Drag background untuk pan, scroll untuk zoom. Klik panah untuk collapse/expand subtree. Klik judul jabatan untuk buka halaman anjab.
      </div>
    </div>
  );
}
