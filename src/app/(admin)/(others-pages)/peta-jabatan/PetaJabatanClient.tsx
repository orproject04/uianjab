'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { getPetaJabatan } from '@/lib/getPetaJabatan';
import type { RawNodeDatum, CustomNodeElementProps } from "react-d3-tree";
import { useMe } from "@/context/MeContext";

const Tree = dynamic(() => import("react-d3-tree").then((m) => m.default), { ssr: false });

// ---- Types dari backend
type PegawaiInfo = {
  name: string;
  nip: string;
  role: string;
};

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

// Type for search matches with name-level granularity
type SearchMatch = {
  nodeId: string;
  matchedNameIndices: number[]; // indices of matched pejabat names, empty if jabatan name matched
  matchType: 'jabatan' | 'pejabat'; // what was matched
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
  pejabat?: PegawaiInfo[];
  children: D3Node[];
  _ghost?: boolean;

  // sintetis sederhana (kotak ungu tanpa detail)
  _syntheticSimple?: boolean;
  _syntheticLabel?: string;
};

function wrapText(s: string, maxChars = 32): string[] {
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
  if (!t) return 99;
  // More tolerant matching using word boundaries to catch variations
  if (/\bESELON\s*I\b/.test(t)) return 1;
  if (/\bESELON\s*II\b/.test(t)) return 2;
  if (/\bESELON\s*III\b/.test(t)) return 3;
  if (/\bESELON\s*IV\b/.test(t)) return 4;
  if (/JABATAN\s+FUNGSIONAL/.test(t)) return 5;
  if (/JABATAN\s+PELAKSANA/.test(t)) return 6;
  return 99;
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

  const jenisEq = (r: APIRow, s: string) => {
    const val = (r.jenis_jabatan || "").toUpperCase();
    const target = (s || "").toUpperCase();
    if (!val || !target) return false;
    if (val === target) return true;
    if (val.startsWith(target)) return true; // accept 'ESELON II / ...'
    return false;
  };
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
            className={`${pad} rounded-md transition ${active ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
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
  const router = useRouter();
  const { isAdmin } = useMe();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const [allRows, setAllRows] = useState<APIRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filter UI (default: Pusat + Struktural)
  const [scope, setScope] = useState<ScopeOpt>("PUSAT");
  const [fungsionalMode, setFungsionalMode] = useState<FungsionalOpt>("STRUKTURAL");
  const [filterText, setFilterText] = useState("");
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]); // Detailed match info
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // collapse map
  const [collapseMap, setCollapseMap] = useState<Record<string, boolean>>({});
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const hasFocusedOnce = useRef(false);
  const [highlightUpdate, setHighlightUpdate] = useState(0); // Counter to force re-render for highlight
  const [showTips, setShowTips] = useState(false); // State for tips tooltip visibility
  const [translate, setTranslate] = useState<{ x: number; y: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number | null>(null); // Dynamic zoom for search navigation
  const lastCenteredIndexRef = useRef<number>(-1); // Track last centered index to prevent loops
  const [isFullscreenPanelOpen, setIsFullscreenPanelOpen] = useState(false); // Control fullscreen panel visibility - default collapsed on mobile
  const [isIOS, setIsIOS] = useState(false); // Detect iOS devices

  // Persesjen documents state
  const [petaJabatanDoc, setPetaJabatanDoc] = useState<string | null>(null);
  const [kelasJabatanDoc, setKelasJabatanDoc] = useState<string | null>(null);

  // Copy to clipboard state - track which name was just copied
  const [copiedNameId, setCopiedNameId] = useState<string | null>(null);


  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (Object.keys(collapseMap).length > 0) {
      sessionStorage.setItem('petaJabatan_collapseMap', JSON.stringify(collapseMap));
    }
  }, [collapseMap]);

  // Fetch latest persesjen documents
  useEffect(() => {
    const fetchPersesjen = async () => {
      try {
        const res = await fetch("/api/persesjen");
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data || [];
        
        // Get latest Peta Jabatan
        const petaJabatan = data
          .filter((d: any) => d.jenis_persesjen === "Peta Jabatan" && d.persesjen_path)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (petaJabatan) setPetaJabatanDoc(petaJabatan.persesjen_path);

        // Get latest Kelas Jabatan
        const kelasJabatan = data
          .filter((d: any) => d.jenis_persesjen === "Kelas Jabatan" && d.persesjen_path)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (kelasJabatan) setKelasJabatanDoc(kelasJabatan.persesjen_path);
      } catch (error) {
        console.error("Error fetching persesjen:", error);
      }
    };
    fetchPersesjen();
  }, []);

  useEffect(() => {
    sessionStorage.setItem('petaJabatan_scope', scope);
  }, [scope]);

  useEffect(() => {
    sessionStorage.setItem('petaJabatan_fungsionalMode', fungsionalMode);
  }, [fungsionalMode]);

  useEffect(() => {
    if (filterText) {
      sessionStorage.setItem('petaJabatan_filterText', filterText);
    }
  }, [filterText]);

  // Helper function to build path for a row
  const buildPathForRow = useCallback((row: APIRow, allData: APIRow[]): string => {
    const byId = new Map(allData.map(r => [r.id, r]));
    const path: string[] = [];
    let current: APIRow | undefined = row;

    while (current) {
      path.unshift(current.slug);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }

    return path.join('/');
  }, []);

  // Helper function to expand all nodes along a path
  const expandNodesAlongPath = useCallback((targetPath: string, allRows: APIRow[]): Record<string, boolean> => {
    const map: Record<string, boolean> = {};

    // Initialize all nodes as collapsed (true)
    for (const r of allRows) {
      map[r.id] = true;
    }

    // Build a map of path -> id
    const byId = new Map(allRows.map(r => [r.id, r]));
    const pathToId = new Map<string, string>();

    // Build path for each row
    for (const row of allRows) {
      const path = buildPathForRow(row, allRows);
      pathToId.set(path, row.id);
    }

    // Split the target path and expand all segments
    const segments = targetPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const nodeId = pathToId.get(currentPath);

      if (nodeId) {
        // Expand this node (set to false = not collapsed)
        map[nodeId] = false;

        // Also expand all its ancestors
        let current = byId.get(nodeId);
        while (current && current.parent_id) {
          map[current.parent_id] = false;
          current = byId.get(current.parent_id);
        }
      }
    }

    return map;
  }, [buildPathForRow]);

  // Reset handler function
  const handleReset = useCallback(() => {
    // Clear only peta jabatan specific sessionStorage keys
    sessionStorage.removeItem('petaJabatan_filterText');
    sessionStorage.removeItem('petaJabatan_lastClickedPath');
    sessionStorage.removeItem('petaJabatan_collapseMap');
    sessionStorage.removeItem('petaJabatan_scope');
    sessionStorage.removeItem('petaJabatan_fungsionalMode');
    sessionStorage.removeItem('petaJabatan_returnFromAnjab');

    // Reset all state to defaults
    setFilterText("");
    setLastClickedPath(null);
    setSearchMatches([]);
    setCurrentMatchIndex(0);
    setCurrentZoom(null);
    setScope("PUSAT");
    setFungsionalMode("STRUKTURAL");
    hasFocusedOnce.current = false;
    
    // Collapse all nodes to initial state
    const initialCollapseMap: Record<string, boolean> = {};
    for (const r of allRows) {
      initialCollapseMap[r.id] = true; // true = collapsed
    }
    setCollapseMap(initialCollapseMap);

    // Force reload the data to ensure clean state
    load();
  }, [allRows]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data: APIRow[] = await getPetaJabatan();
      setAllRows(data);

      // Restore state from sessionStorage after data loaded
      const savedCollapseMap = sessionStorage.getItem('petaJabatan_collapseMap');
      const savedScope = sessionStorage.getItem('petaJabatan_scope');
      const savedFungsionalMode = sessionStorage.getItem('petaJabatan_fungsionalMode');
      const savedFilterText = sessionStorage.getItem('petaJabatan_filterText');
      const savedLastPath = sessionStorage.getItem('petaJabatan_lastClickedPath');
      const returnFromAnjab = sessionStorage.getItem('petaJabatan_returnFromAnjab');

      if (savedScope && (savedScope === 'PUSAT' || savedScope === 'DAERAH')) {
        setScope(savedScope as ScopeOpt);
      }

      if (savedFungsionalMode && (savedFungsionalMode === 'STRUKTURAL' || savedFungsionalMode === 'FUNGSIONAL')) {
        setFungsionalMode(savedFungsionalMode as FungsionalOpt);
      }

      if (savedFilterText) {
        setFilterText(savedFilterText);
      }

      // Only restore lastClickedPath if returning from anjab page
      if (returnFromAnjab === 'true' && savedLastPath) {
        setLastClickedPath(savedLastPath);
        // Clear the flag after using it
        sessionStorage.removeItem('petaJabatan_returnFromAnjab');
      }
    } catch (e: any) {
      setErr(e?.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Detect iOS devices
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry?.contentRect) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(fs);
      if (containerRef.current) {
        containerRef.current.style.height = fs ? "100vh" : (window.innerWidth < 640 ? "80vh" : "70vh");
        containerRef.current.style.background = "#fff";
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    // Safari support
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const enterFullscreen = async () => {
    if (!containerRef.current) return;
    
    // For iOS devices, use alternative approach (expand to full viewport)
    if (isIOS) {
      setIsFullscreen(true);
      if (containerRef.current) {
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.top = '0';
        containerRef.current.style.left = '0';
        containerRef.current.style.width = '100vw';
        containerRef.current.style.height = '100vh';
        containerRef.current.style.zIndex = '9999';
        containerRef.current.style.background = '#fff';
        // Prevent scrolling on body
        document.body.style.overflow = 'hidden';
      }
      return;
    }
    
    try {
      // Try standard Fullscreen API
      if (containerRef.current.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
      // Safari support
      else if ((containerRef.current as any).webkitRequestFullscreen) {
        await (containerRef.current as any).webkitRequestFullscreen();
      }
      // For mobile devices, use alternative approach
      else if ((containerRef.current as any).webkitEnterFullscreen) {
        (containerRef.current as any).webkitEnterFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen error:', e);
      // Fallback to iOS-style fullscreen
      setIsFullscreen(true);
      if (containerRef.current) {
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.top = '0';
        containerRef.current.style.left = '0';
        containerRef.current.style.width = '100vw';
        containerRef.current.style.height = '100vh';
        containerRef.current.style.zIndex = '9999';
        containerRef.current.style.background = '#fff';
        document.body.style.overflow = 'hidden';
      }
    }
  };

  const exitFullscreen = async () => {
    // For iOS or custom fullscreen mode
    if (isIOS || (isFullscreen && !document.fullscreenElement && !(document as any).webkitFullscreenElement)) {
      setIsFullscreen(false);
      if (containerRef.current) {
        containerRef.current.style.position = '';
        containerRef.current.style.top = '';
        containerRef.current.style.left = '';
        containerRef.current.style.width = '';
        containerRef.current.style.height = window.innerWidth < 640 ? '80vh' : '70vh';
        containerRef.current.style.zIndex = '';
        // Restore body scrolling
        document.body.style.overflow = '';
      }
      return;
    }
    
    try {
      if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen && (document as any).webkitFullscreenElement) {
        await (document as any).webkitExitFullscreen();
      }
    } catch (e) {
      console.error('Exit fullscreen error:', e);
      // Fallback
      setIsFullscreen(false);
      if (containerRef.current) {
        containerRef.current.style.position = '';
        containerRef.current.style.top = '';
        containerRef.current.style.left = '';
        containerRef.current.style.width = '';
        containerRef.current.style.height = window.innerWidth < 640 ? '80vh' : '70vh';
        containerRef.current.style.zIndex = '';
        document.body.style.overflow = '';
      }
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

  // Reset collapse state ONLY when scope changes (PUSAT <-> DAERAH)
  useEffect(() => {
    if (rows.length === 0) return;

    // Reset and collapse all when scope changes
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.id] = true;
    setCollapseMap(map);
    hasFocusedOnce.current = false; // Allow focus to work again if needed
  }, [scope]); // Only reset when scope changes, NOT fungsionalMode

  useEffect(() => {
    if (rows.length === 0) return;

    // If we have a last clicked path and haven't focused yet, expand to that path
    if (lastClickedPath && rows.length > 0 && !hasFocusedOnce.current) {
      console.log('Expanding path to:', lastClickedPath);
      const expandedMap = expandNodesAlongPath(lastClickedPath, rows);
      setCollapseMap(expandedMap);
      hasFocusedOnce.current = true;
    } else if (!lastClickedPath && !hasFocusedOnce.current) {
      // Initial load without focus - collapse all
      const map: Record<string, boolean> = {};
      for (const r of rows) map[r.id] = true;
      setCollapseMap(map);
      hasFocusedOnce.current = true; // Mark as focused to prevent re-expansion on user clicks
    }
    // Don't re-collapse when lastClickedPath is cleared
  }, [rows, lastClickedPath, expandNodesAlongPath]);

  // Auto-expand and highlight matching nodes when searching (with debounce)
  useEffect(() => {
    if (!filterText.trim() || rows.length === 0) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      setCurrentZoom(null); // Reset zoom when search cleared
      return;
    }

    // Debounce search for better performance
    const timeoutId = setTimeout(() => {
      const lcFilter = filterText.trim().toLowerCase();
      const matches: SearchMatch[] = [];

      // Find all matching nodes with detailed info
      for (const row of rows) {
        const nameMatch = (row.nama_jabatan || "").toLowerCase().includes(lcFilter);
        const slugMatch = (row.slug || "").toLowerCase().includes(lcFilter);
        const unitMatch = (row.unit_kerja || "").toLowerCase().includes(lcFilter);
        
        // Check which pejabat names match
        const matchedNameIndices: number[] = [];
        (row.pejabat || []).forEach((p, idx) => {
          if ((p.name || "").toLowerCase().includes(lcFilter)) {
            matchedNameIndices.push(idx);
          }
        });

        if (nameMatch || slugMatch || unitMatch) {
          // Jabatan name matched - highlight whole card
          matches.push({
            nodeId: row.id,
            matchedNameIndices: [],
            matchType: 'jabatan'
          });
        } else if (matchedNameIndices.length > 0) {
          // Only pejabat name(s) matched - highlight specific names
          matches.push({
            nodeId: row.id,
            matchedNameIndices,
            matchType: 'pejabat'
          });
        }
      }

      setSearchMatches(matches);
      setCurrentMatchIndex(0);
      
      // Reset centered ref when new search starts
      if (matches.length > 0) {
        lastCenteredIndexRef.current = -1;
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [filterText, rows]);

  // ==== Show only current match (collapse all others) ====
  useEffect(() => {
    if (searchMatches.length === 0) return;
    
    const currentMatch = searchMatches[currentMatchIndex];
    if (!currentMatch) return;

    const expandMap: Record<string, boolean> = {};
    
    // Collapse everything first
    for (const r of rows) expandMap[r.id] = true;

    // Find the current match row and expand only its path
    const currentRow = rows.find(r => r.id === currentMatch.nodeId);
    if (currentRow) {
      let current: APIRow | undefined = currentRow;
      while (current) {
        expandMap[current.id] = false; // false = expanded
        current = current.parent_id ? rows.find(r => r.id === current!.parent_id) : undefined;
      }
    }

    setCollapseMap(expandMap);
    
    // Reset centered ref when collapsemap changes for search
    lastCenteredIndexRef.current = -1;
  }, [currentMatchIndex, searchMatches, rows]);

  // ---------- Breakpoints (berbasis lebar kontainer) ----------
  // Adjusted for 14-inch laptops (~1366px width)
  const bp = useMemo(() => {
    const w = containerSize.w || (typeof window !== "undefined" ? window.innerWidth : 0);
    return {
      isMobile: w < 640,
      isTablet: w >= 640 && w < 1366, // Extended tablet range to cover 14-inch laptops
      isDesktop: w >= 1366,
      w
    };
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
          pejabat: [],
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
        pejabat: n.pejabat ?? [],
        children: [],
      };

      const rawKids = (byParent.get(n.id) || []).map(child => build(child, myPath));
      const synthetic: D3Node[] = [];

      // ESELON II → KJF (E3; Inspektur/Inspektorat → E4)
      if (syntheticFlags.addKJFforEselonII && rankJenis(n.jenis_jabatan) === 2) {
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
          pejabat: [],
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
          nama_jabatan: "Kantor DPD RI di Ibu Kota Provinsi",
          jenis_jabatan: "ESELON III",
          bezetting: null,
          kebutuhan_pegawai: null,
          kelas_jabatan: null,
          pejabat: [],
          children: [],
          _syntheticSimple: true,
          _syntheticLabel: "KANTOR DPD RI DI IBU KOTA PROVINSI",
        });
      }

      // ESELON III → KJF (E4) untuk skenario daerah-struktural
      if (syntheticFlags.addKJFforEselonIII && rankJenis(n.jenis_jabatan) === 3) {
        synthetic.push({
          _id: `synthetic-kjf-e3:${n.id}`,
          _slug: "kjf",
          _path: [...myPath, "kjf"],
          nama_jabatan: "Kelompok Jabatan Fungsional",
          jenis_jabatan: "ESELON IV",
          bezetting: null,
          kebutuhan_pegawai: null,
          kelas_jabatan: null,
          pejabat: [],
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
    
    // If we have search matches and a valid currentMatchIndex, show only the path to that node
    if (searchMatches.length > 0 && currentMatchIndex >= 0 && currentMatchIndex < searchMatches.length) {
      const currentMatch = searchMatches[currentMatchIndex];
      
      // Build path set from root to current match (using rows for real nodes)
      const pathIds = new Set<string>();
      const currentRow = rows.find(r => r.id === currentMatch.nodeId);
      if (currentRow) {
        let current: APIRow | undefined = currentRow;
        while (current) {
          pathIds.add(current.id);
          current = current.parent_id ? rows.find(r => r.id === current!.parent_id) : undefined;
        }
      }
      
      // Walk tree and keep nodes that are in path OR are ghost/synthetic with children in path
      const walkPath = (n: D3Node): D3Node | null => {
        // Check children first
        const kids = n.children.map(walkPath).filter(Boolean) as D3Node[];
        
        // Include node if:
        // 1. It's in the path (real node that matches)
        // 2. It's a ghost/synthetic node AND has children in the path
        const isInPath = pathIds.has(n._id);
        const isGhostWithKids = (n._ghost || n._syntheticSimple) && kids.length > 0;
        
        if (isInPath || isGhostWithKids) {
          return { ...n, children: kids };
        }
        
        return null;
      };
      
      return roots.map(walkPath).filter(Boolean) as D3Node[];
    }
    
    // Original filter logic when no specific match is selected
    const match = (n: D3Node) =>
      (n.nama_jabatan || "").toLowerCase().includes(lcFilter) ||
      (n._slug || "").toLowerCase().includes(lcFilter) ||
      (n.pejabat || []).some(p => (p.name || "").toLowerCase().includes(lcFilter));
    const walk = (n: D3Node): D3Node | null => {
      const kids = n.children.map(walk).filter(Boolean) as D3Node[];
      if (match(n) || kids.length) return { ...n, children: kids };
      return null;
    };
    return roots.map(walk).filter(Boolean) as D3Node[];
  }, [roots, lcFilter, searchMatches, currentMatchIndex, rows]);

  // ==== Convert to RawNodeDatum ====
  function collectIds(node: RawNodeDatum): string[] {
    const attrs = node.attributes as any;
    const myId = attrs?.id;
    const ids = myId ? [myId] : [];
    if (node.children) for (const c of node.children) ids.push(...collectIds(c));
    return ids;
  }

  // -------- Responsive sizing tokens (card, fonts, node gap) --------
  // Optimized for 14-inch laptops and mobile devices
  const cardW = bp.isMobile ? 280 : bp.isTablet ? 340 : 400;
  const padX = bp.isMobile ? 14 : 16;
  const padY = bp.isMobile ? 12 : 14;

  const titleFontPx = bp.isMobile ? 11 : bp.isTablet ? 12 : 13;
  const approxCharPx = 8; // Increased from 5 to account for uppercase font width
  const usableTitleW = cardW - (bp.isMobile ? 80 : 100); // Leave room for the toggle button on the right
  const maxTitleChars = Math.max(20, Math.floor(usableTitleW / approxCharPx));

  const boxW = bp.isMobile ? 28 : 32;
  const boxH = bp.isMobile ? 22 : 24;
  const boxGap = 8;
  const labelGapTop = bp.isMobile ? 10 : 12;
  const gapAfterBoxes = bp.isMobile ? 12 : 14;
  const textFieldH = bp.isMobile ? 24 : 28;

  const nodeSize = useMemo(() => {
    // Reduced horizontal spacing for better fit on smaller screens
    const x = cardW + (bp.isMobile ? 60 : bp.isTablet ? 80 : 100);
    // Increased vertical spacing to prevent cramping
    const y = bp.isMobile ? 300 : bp.isTablet ? 300 : 380;
    return { x, y };
  }, [cardW, bp.isMobile, bp.isTablet]);

  // Lower zoom for better overview on 14-inch laptops
  const initialZoom = bp.isMobile ? 0.45 : bp.isTablet ? 0.55 : 0.65;
  // Balanced separation - not too cramped, not too wide
  const separation = { siblings: bp.isMobile ? 1.15 : 1.25, nonSiblings: bp.isMobile ? 1.25 : 1.35 };

  const toRD3 = (n: D3Node): RawNodeDatum => {
    const id = n._id;
    const isGhost = !!n._ghost;
    const hasChildren = n.children.length > 0;
    const isCollapsed = !isGhost && !!collapseMap[id];
    const pathStr = n._path.join("/");
    // Pre-compute visual sizing info so we can align sibling top edges
    const title = String(n.nama_jabatan || "").toUpperCase();
    const titleLines = wrapText(title, maxTitleChars);
    const lineH = bp.isMobile ? 24 : bp.isTablet ? 26 : 28;
    const kelasHLocal = bp.isMobile ? 16 : bp.isTablet ? 18 : 20;
    const headerH = Math.max(bp.isMobile ? 36 : bp.isTablet ? 40 : 44, titleLines.length * lineH + 8) + kelasHLocal + 10;

    const namesArrLocal: string[] = Array.isArray(n.pejabat) 
      ? (n.pejabat as PegawaiInfo[]).map(p => {
          // Only show role for JABATAN FUNGSIONAL (rank 5) and JABATAN PELAKSANA (rank 6)
          const jenisRank = rankJenis(n.jenis_jabatan);
          const showRole = jenisRank === 5 || jenisRank === 6;
          const role = showRole && p.role ? ` (${p.role})` : '';
          return `${p.name}${role}`;
        }) 
      : [];
    const namesCountLocal = namesArrLocal.length;
    const boxGapVerticalLocal = bp.isMobile ? 6 : 8;
    const totalNamesHeightLocal = namesCountLocal > 0
      ? (textFieldH * namesCountLocal) + (boxGapVerticalLocal * (namesCountLocal - 1))
      : textFieldH;

    const baseCardH = padY + headerH + labelGapTop + 14 + 4 + boxH + gapAfterBoxes + textFieldH + padY;

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
        pejabat: n.pejabat ?? [],
        syntheticSimple: n._syntheticSimple === true,
        syntheticLabel: n._syntheticLabel || null,
        // sizing hints
        _titleLines: titleLines.length,
        baseCardH,
      } as any,
      children: isCollapsed ? [] : n.children.map(toRD3),
    };
  };

  const rd3Data: RawNodeDatum[] = useMemo(() => {
    const data = filteredRoots.map(toRD3);

    // collect all nodes and compute sibling max baseCardH
    const all: RawNodeDatum[] = [];
    const collect = (n: RawNodeDatum, parentId: string | null) => {
      const attrs = n.attributes as any;
      attrs.parentId = parentId;
      all.push(n);
      if (n.children) n.children.forEach((c: RawNodeDatum) => collect(c, attrs.id || null));
    };
    data.forEach(d => collect(d, null));

    const byParent = new Map<string | null, RawNodeDatum[]>();
    for (const n of all) {
      const p = (n.attributes as any).parentId ?? null;
      const arr = byParent.get(p) || [];
      arr.push(n);
      byParent.set(p, arr);
    }

    for (const [p, arr] of byParent.entries()) {
      const maxBase = Math.max(...arr.map(a => (a.attributes as any).baseCardH || 0));
      for (const a of arr) {
        (a.attributes as any).siblingMaxBaseCardH = maxBase;
      }
    }

    return data;
  }, [filteredRoots, collapseMap, bp.isMobile, bp.isTablet]);

  const toggleByDatum = useCallback((nodeDatum: CustomNodeElementProps["nodeDatum"], e?: React.MouseEvent<SVGGElement>) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const attrs = nodeDatum.attributes as any;
    if (!attrs?.id || attrs.ghost) return;
    setCollapseMap(prev => {
      const currentlyCollapsed = !!prev[attrs.id];
      if (currentlyCollapsed) {
        return { ...prev, [attrs.id]: false };
      } else {
        const ids = collectIds(nodeDatum);
        const newMap = { ...prev };
        ids.forEach(id => { newMap[id] = true; });
        return newMap;
      }
    });
  }, []);



  // Function to calculate subtree width (for proper horizontal positioning)
  const calculateSubtreeWidth = useCallback((node: RawNodeDatum): number => {
    if (!node.children || node.children.length === 0) {
      return nodeSize.x; // Leaf node takes up one node width
    }

    let totalWidth = 0;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childWidth = calculateSubtreeWidth(child);
      totalWidth += childWidth;

      // Add spacing between siblings (except after the last one)
      if (i < node.children.length - 1) {
        totalWidth += nodeSize.x * separation.siblings;
      }
    }

    return totalWidth;
  }, [nodeSize, separation]);

  // Function to find node position in tree structure (using d3-tree layout algorithm)
  const findNodePosition = useCallback((targetPath: string, data: RawNodeDatum[], depth: number = 0, xOffset: number = 0): { x: number; y: number } | null => {
    for (const node of data) {
      const attrs = node.attributes as any;
      const pathStr = attrs?.pathStr || "";

      if (pathStr === targetPath) {
        // Found the target node
        const y = depth * nodeSize.y;
        console.log(`Found target at depth ${depth}, xOffset ${xOffset}`);
        return { x: xOffset, y };
      }

      // Check children
      if (node.children && node.children.length > 0) {
        // Calculate total width of all children
        let totalWidth = 0;
        const childWidths: number[] = [];
        
        for (let i = 0; i < node.children.length; i++) {
          const childWidth = calculateSubtreeWidth(node.children[i]);
          childWidths.push(childWidth);
          totalWidth += childWidth;
          
          // Add spacing between siblings (except after the last one)
          if (i < node.children.length - 1) {
            totalWidth += nodeSize.x * separation.siblings;
          }
        }

        // Start position: parent center - half of total width
        let currentX = xOffset - (totalWidth / 2);

        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const childAttrs = child.attributes as any;
          const childPathStr = childAttrs?.pathStr || "";

          // Center position of this child's subtree
          const childCenterX = currentX + (childWidths[i] / 2);

          if (childPathStr === targetPath) {
            const y = (depth + 1) * nodeSize.y;
            console.log(`Found target child at depth ${depth + 1}, childCenterX ${childCenterX}`);
            return { x: childCenterX, y };
          }

          // Recursively search in this child's subtree
          const result = findNodePosition(targetPath, [child], depth + 1, childCenterX);
          if (result) return result;

          // Move to next sibling position
          currentX += childWidths[i];
          if (i < node.children.length - 1) {
            currentX += nodeSize.x * separation.siblings;
          }
        }
      }
    }
    return null;
  }, [nodeSize, separation, calculateSubtreeWidth]);

  // Effect: Scroll to node when currentMatchIndex changes (navigation)
  useEffect(() => {
    // Skip if no matches
    if (searchMatches.length === 0) {
      return;
    }
    
    // Skip if already centered this index (and it's a valid index)
    if (currentMatchIndex === lastCenteredIndexRef.current) {
      console.log('🔍 Already centered index', currentMatchIndex, ', skipping');
      return;
    }
    
    if (!containerRef.current || !containerSize.w) return;
    
    const currentMatch = searchMatches[currentMatchIndex];
    if (!currentMatch) return;
    
    console.log('🔍 Navigation: Attempting to center match index:', currentMatchIndex, 'Match:', currentMatch);
    
    // Use longer timeout to ensure tree is fully rendered after collapse changes
    const timeoutId = setTimeout(() => {
      // Re-check after timeout
      if (!containerRef.current || !containerSize.w || rd3Data.length === 0 || rows.length === 0) {
        console.log('❌ Dependencies not ready, skipping');
        return;
      }
      
      // Find the matching row to get path
      const matchRow = rows.find(r => r.id === currentMatch.nodeId);
      if (!matchRow) {
        console.log('❌ Row not found for matchId:', currentMatch.nodeId);
        return;
      }
     
      const matchPath = buildPathForRow(matchRow, rows);
      console.log('✓ Found match path:', matchPath);
      
      // Find node position in tree coordinates (starting from x=0 center)
      const nodePos = findNodePosition(matchPath, rd3Data);
      
      if (nodePos) {
        console.log('✓ Found node position in tree coords:', nodePos);
        console.log('Current translate:', translate);
        console.log('Container size:', { w: containerSize.w, h: containerRef.current.clientHeight });
        
        // Calculate distance from center to determine if we need to adjust zoom
        const distanceFromCenter = Math.abs(nodePos.x);
        const containerHalfWidth = containerSize.w / 2;
        
        // If node is far from center, we might need to zoom out
        // Calculate required zoom to fit the node
        let zoom = initialZoom;
        const maxDistance = containerHalfWidth * 0.7; // Use 70% of half width as comfort zone
        
        if ((distanceFromCenter * zoom) > maxDistance) {
          // Node is too far, adjust zoom
          zoom = maxDistance / distanceFromCenter;
          zoom = Math.max(zoom, 0.3); // Minimum zoom 0.3
          zoom = Math.min(zoom, initialZoom); // Don't zoom in more than initial
          console.log(`📏 Node is far (${distanceFromCenter}px), adjusting zoom from ${initialZoom} to ${zoom}`);
        }
        
        // Calculate new translate to center the node
        const centerX = containerSize.w / 2;
        const centerY = containerRef.current.clientHeight / 2;
        
        const newTranslate = {
          x: centerX - (nodePos.x * zoom),
          y: centerY - (nodePos.y * zoom)
        };
        
        console.log('✅ Setting new translate:', newTranslate, `(zoom: ${zoom}, will center node at`, nodePos, ')');
        
        // Mark this index as centered BEFORE updating state
        lastCenteredIndexRef.current = currentMatchIndex;
        
        // Update both translate and zoom together
        setTranslate(newTranslate);
        setCurrentZoom(zoom);
        
      } else {
        console.log('❌ Node position not found for path:', matchPath);
        console.log('Available rd3Data length:', rd3Data.length);
        if (rd3Data.length > 0 && rd3Data[0].attributes) {
          console.log('First node path:', (rd3Data[0].attributes as any).pathStr);
        }
      }
    }, 800); // Longer timeout for tree rendering after collapse changes
    
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatchIndex, searchMatches, rd3Data, collapseMap]); // Trigger when rd3Data or collapseMap changes

  // Effect: Focus on root node after reset (when no search)
  useEffect(() => {
    // Only run if there's no search and container is ready
    if (searchMatches.length > 0 || !containerRef.current || !containerSize.w) return;
    
    // If filterText is empty and we haven't focused on root yet, center on root
    if (!filterText && !hasFocusedOnce.current && translate) {
      console.log('🏠 Focusing on root node (Setjen)');
      
      const timeoutId = setTimeout(() => {
        if (!containerRef.current || !containerSize.w) return;
        
        // Center on root at x=0, y=0
        const centerX = containerSize.w / 2;
        const centerY = containerRef.current.clientHeight / 2;
        
        const newTranslate = {
          x: centerX,
          y: centerY - 100 // Slight offset to show root better
        };
        
        console.log('✅ Centering on root:', newTranslate);
        setTranslate(newTranslate);
        setCurrentZoom(null); // Reset to initial zoom
        hasFocusedOnce.current = true;
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [searchMatches, filterText, containerSize.w, translate]);

  // Re-center when entering/exiting fullscreen
  useEffect(() => {
    if (!containerRef.current || !containerSize.w) return;
    
    console.log('📺 Fullscreen state changed:', isFullscreen);
    
    // Auto-open panel when entering fullscreen (only on desktop)
    if (isFullscreen && window.innerWidth >= 640) {
      setIsFullscreenPanelOpen(true);
    }
    
    // Re-center on root when entering/exiting fullscreen
    const timeoutId = setTimeout(() => {
      if (!containerRef.current || !containerSize.w) return;
      
      const centerX = containerSize.w / 2;
      const centerY = isFullscreen 
        ? window.innerHeight / 2  // Use full viewport height in fullscreen
        : containerRef.current.clientHeight / 2;
      
      const newTranslate = {
        x: centerX,
        y: centerY - 100
      };
      
      console.log('✅ Re-centering for fullscreen mode:', newTranslate);
      setTranslate(newTranslate);
      setCurrentZoom(null);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [isFullscreen, containerSize.w]);

  // Initialize translate once
  useEffect(() => {
    if (!translate && containerSize.w) {
      const defaultTranslate = { x: Math.max(24, containerSize.w / 2), y: bp.isMobile ? 80 : 110 };
      setTranslate(defaultTranslate);
    }
  }, [translate, containerSize.w, bp.isMobile]);

  // Copy to clipboard function
  const handleCopyName = useCallback((name: string, nodeId: string, idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove role suffix if present (text in parentheses)
    const cleanName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanName)
        .then(() => {
          const copyId = `${nodeId}-${idx}`;
          setCopiedNameId(copyId);
          setTimeout(() => setCopiedNameId(null), 2000); // Reset after 2 seconds
        })
        .catch(err => {
          console.error('Failed to copy:', err);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = cleanName;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            const copyId = `${nodeId}-${idx}`;
            setCopiedNameId(copyId);
            setTimeout(() => setCopiedNameId(null), 2000);
          } catch (err2) {
            console.error('Fallback copy failed:', err2);
          }
          document.body.removeChild(textArea);
        });
    }
  }, []);

  // ==== Custom Node Renderer ====
  const renderNode = useCallback((props: CustomNodeElementProps) => {
    const { nodeDatum } = props;
    const attrs = nodeDatum.attributes as any;
    if (attrs.ghost) return <g />;

    // NODE SINTETIS
    if (attrs.syntheticSimple) {
      const W = cardW; // Same width as regular nodes for consistency
      const label: string = attrs.syntheticLabel || (nodeDatum.name || "");
      const isCollapsed = !!attrs.isCollapsed;
      const hasChildren = !!attrs.hasChildren;

      // Wrap text for long labels
      const maxCharsPerLine = bp.isMobile ? 25 : bp.isTablet ? 35 : 45;
      const labelLines = wrapText(label, maxCharsPerLine);
      const lineHeight = bp.isMobile ? 18 : 20;
      const H = Math.max(bp.isMobile ? 60 : bp.isTablet ? 70 : 80, labelLines.length * lineHeight + 30);

      const xLeft = -W / 2;
      const yTop = -H / 2;
      const centerY = 0;

      return (
        <g data-node-id={attrs.id}>
          <rect x={xLeft} y={yTop} width={W} height={H} rx={8} ry={8}
            fill="#E8F5D9" stroke="#6DB980" strokeWidth={1}
            style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))" }} />

          {/* Multi-line text for synthetic labels */}
          {labelLines.map((line, i) => (
            <text
              key={i}
              x={0}
              y={centerY - ((labelLines.length - 1) * lineHeight) / 2 + i * lineHeight}
              textAnchor="middle"
              alignmentBaseline="middle"
              fill="#111827"
              style={{
                fontSize: bp.isMobile ? "10px" : bp.isTablet ? "11px" : "12px",
                fontWeight: 600
              }}
            >
              {String(line).toUpperCase()}
            </text>
          ))}

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
    const lineH = bp.isMobile ? 24 : bp.isTablet ? 26 : 28;

    const kelas: string = attrs.kelas_jabatan ?? "-";
    const kelasHLocal = bp.isMobile ? 16 : bp.isTablet ? 18 : 20;
    const headerH = Math.max(bp.isMobile ? 36 : bp.isTablet ? 40 : 44, titleLines.length * lineH + 8) + kelasHLocal + 10;

    const bez: number = attrs.bezetting ?? 0;
    const keb: number = attrs.kebutuhan_pegawai ?? 0;
    const sel: number = bez - keb;

    const namesArr: string[] = Array.isArray(attrs.pejabat)
      ? (attrs.pejabat as PegawaiInfo[]).map(p => {
          // Only show role for JABATAN FUNGSIONAL (rank 5) and JABATAN PELAKSANA (rank 6)
          const jenisRank = rankJenis(attrs.jenis);
          const showRole = jenisRank === 5 || jenisRank === 6;
          const role = showRole && p.role ? ` (${p.role})` : '';
          return `${p.name}${role}`;
        })
      : [];
    const namaPejabatText = namesArr.join(", ");

    const labelGapTop = bp.isMobile ? 10 : 12;
    const metricsTotalW = boxW * 3 + boxGap * 2;
    const gapAfterBoxes = bp.isMobile ? 12 : 14;

    // Hitung tinggi untuk multiple boxes (setiap nama punya kotak sendiri)
    const namesCount = namesArr.length;
    const boxGapVertical = bp.isMobile ? 6 : 8; // Jarak antar kotak
    const totalNamesHeight = namesCount > 0
      ? (textFieldH * namesCount) + (boxGapVertical * (namesCount - 1))
      : textFieldH;

    // Hitung tinggi base card (dengan 1 nama field)
    const baseCardH = padY + headerH + labelGapTop + 14 + 4 + boxH + gapAfterBoxes + textFieldH + padY;

    // Hitung tinggi card sebenarnya dengan semua nama
    const cardH = padY + headerH + labelGapTop + 14 + 4 + boxH + gapAfterBoxes + totalNamesHeight + padY;

    const xLeft = -cardW / 2;
    // Use sibling max baseCardH (if available) so sibling top edges align. Fallback to local baseCardH.
    const siblingMaxBase = (attrs && attrs.siblingMaxBaseCardH) ? attrs.siblingMaxBaseCardH : baseCardH;
    const yTop = -siblingMaxBase / 2;

    const yHeaderTop = yTop + padY;
    const centerX = 0;

    const yTitleStart = yHeaderTop + 6;
    const yKelas = yTitleStart + titleLines.length * lineH + 4;

    const yLabelBKP = yHeaderTop + headerH + labelGapTop;
    const yBoxes = yLabelBKP + 14 + 4;

    const boxesStartX = -metricsTotalW / 2;

    const metricBox = (x: number, y: number, value: string, color = "#111827") => (
      <g>
        <rect x={x} y={y} width={boxW} height={boxH} rx={6} ry={6} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1} />
        <text x={x + boxW / 2} y={y + boxH / 2} textAnchor="middle" alignmentBaseline="central"
          fill={color} strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200 }}>
          {value}
        </text>
      </g>
    );

    const pathStr: string = attrs.pathStr || "";
    const href = `/anjab/${pathStr}`;

    const handleJabatanClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Exit fullscreen before opening new tab (for better UX)
      if (isFullscreen || document.fullscreenElement || (document as any).webkitFullscreenElement) {
        try {
          await exitFullscreen();
          // Small delay after exit fullscreen
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.log('Exit fullscreen before navigation:', err);
        }
      }

      // Save to sessionStorage for highlighting only
      sessionStorage.setItem('petaJabatan_lastClickedPath', pathStr);

      // Open in new tab and focus on it
      window.open(href, '_blank', 'noopener,noreferrer');

      // Force re-render to update highlight WITHOUT triggering useEffect
      setHighlightUpdate(prev => prev + 1);
    };

    // Check if this is the last clicked node - read from sessionStorage to avoid dependency
    const sessionLastClicked = typeof window !== 'undefined' ? sessionStorage.getItem('petaJabatan_lastClickedPath') : null;
    const isLastClicked = sessionLastClicked === pathStr;

    // Check if this node matches current search
    const currentMatch = searchMatches.find(m => m.nodeId === attrs.id);
    const isSearchMatch = !!currentMatch;
    const isCurrentSearchMatch = isSearchMatch && searchMatches[currentMatchIndex]?.nodeId === attrs.id;
    const matchedNameIndices = currentMatch?.matchedNameIndices || [];
    const matchType = currentMatch?.matchType || 'jabatan';

    // Determine border style based on state
    let borderColor = "#6DB980"; // default green
    let borderWidth = 1;
    let shadowFilter = "drop-shadow(0 2px 3px rgba(0,0,0,0.08))";

    if (isCurrentSearchMatch && matchType === 'jabatan') {
      // Current search match for jabatan name - green with pulsing effect
      borderColor = "#10B981";
      borderWidth = 4;
      shadowFilter = "drop-shadow(0 4px 8px rgba(16,185,129,0.4))";
    } else if (isCurrentSearchMatch && matchType === 'pejabat') {
      // Current search match for pejabat name - use orange for card
      borderColor = "#F59E0B";
      borderWidth = 2;
      shadowFilter = "drop-shadow(0 3px 6px rgba(245,158,11,0.3))";
    } else if (isSearchMatch && matchType === 'jabatan') {
      // Other search matches - yellow
      borderColor = "#F59E0B";
      borderWidth = 2;
      shadowFilter = "drop-shadow(0 3px 6px rgba(245,158,11,0.3))";
    } else if (isLastClicked) {
      // Last clicked - orange
      borderColor = "#FF6B00";
      borderWidth = 3;
      shadowFilter = "drop-shadow(0 4px 6px rgba(255,107,0,0.3))";
    }

    return (
      <g data-node-id={attrs.id}>
        {/* KARTU - Clickable except toggle button */}
        <rect x={xLeft} y={yTop} width={cardW} height={cardH}
          rx={8} ry={8} fill="#ffffff"
          stroke={borderColor}
          strokeWidth={borderWidth}
          style={{ filter: shadowFilter, cursor: 'pointer' }}
          onClick={handleJabatanClick} />

        {/* HEADER*/}
        <rect x={xLeft + 1} y={yTop} width={cardW - 2} height={headerH + padY}
          rx={10} ry={10} fill="#E8F5D9" strokeOpacity={0.15} strokeWidth={1}
          style={{ cursor: 'pointer', pointerEvents: 'none' }} />

        {/* JUDUL */}
        <g style={{ cursor: 'pointer', pointerEvents: 'none' }}>
          {titleLines.map((line, i) => (
            <text key={i} x={centerX} y={yTitleStart + i * lineH}
              textAnchor="middle" alignmentBaseline="hanging"
              fill="#111827" strokeWidth={1}
              style={{ fontSize: `${titleFontPx}px`, fontWeight: 500, opacity: 0.85, color: "#152E6D" }}>
              {line}
            </text>
          ))}
        </g>

        {/* KELAS JABATAN */}
        <text x={centerX} y={yKelas} textAnchor="middle" alignmentBaseline="hanging"
          strokeWidth={1} fill="#6b7280"
          style={{ fontSize: bp.isMobile ? "10px" : "11px", fontWeight: 50, opacity: 0.5, pointerEvents: 'none' }}>
          {`Kelas Jabatan : ${kelas || "-"}`}
        </text>

        {/* LABEL B K ± */}
        <text x={boxesStartX + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
          fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200, pointerEvents: 'none' }}>B</text>
        <text x={boxesStartX + boxW + boxGap + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
          fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200, pointerEvents: 'none' }}>K</text>
        <text x={boxesStartX + (boxW + boxGap) * 2 + boxW / 2} y={yLabelBKP} textAnchor="middle" alignmentBaseline="hanging"
          fill="#111827" strokeWidth={1} style={{ fontSize: bp.isMobile ? "11px" : "12px", fontWeight: 200, pointerEvents: 'none' }}>±</text>

        {/* KOTAK ANGKA */}
        <g style={{ pointerEvents: 'none' }}>
          {metricBox(boxesStartX + (boxW + boxGap) * 0, yBoxes, String(bez ?? 0))}
          {metricBox(boxesStartX + (boxW + boxGap) * 1, yBoxes, String(keb ?? 0))}
          {metricBox(boxesStartX + (boxW + boxGap) * 2, yBoxes, String(sel ?? 0))}
        </g>

        {/* TEXT FIELD NAMA - Setiap nama punya kotak sendiri */}
        <g>
          {namesArr.length > 0 ? (
            namesArr.map((name, idx) => {
              const yBoxStart = yBoxes + boxH + (bp.isMobile ? 10 : 12) + (idx * (textFieldH + boxGapVertical));
              const isEselonCentered = rankJenis(attrs.jenis) <= 4;
              const textAlign = isEselonCentered ? "middle" : "start";
              const textX = isEselonCentered ? centerX : xLeft + padX + 10;
              
              // ID for tracking copied state
              const copyId = `${attrs.id}-${idx}`;
              const isCopied = copiedNameId === copyId;
              
              // Check if this specific name is matched in search
              const isNameMatched = matchType === 'pejabat' && matchedNameIndices.includes(idx);
              const isCurrentNameMatch = isCurrentSearchMatch && isNameMatched;
              
              // Determine border color for this name box
              let nameBorderColor = "#c4c4c4"; // default gray
              let nameBorderWidth = 1;
              
              if (isCurrentNameMatch) {
                // This specific name matches current search - bright yellow/gold
                nameBorderColor = "#F59E0B";
                nameBorderWidth = 3;
              } else if (isNameMatched) {
                // This name matches but not current index - lighter yellow
                nameBorderColor = "#FBBF24";
                nameBorderWidth = 2;
              }
              
              // Copy button position (on the right side of the box)
              const buttonSize = bp.isMobile ? 20 : 22;
              const buttonX = xLeft + padX + (cardW - padX * 2) - buttonSize - 6;
              const buttonY = yBoxStart + (textFieldH - buttonSize) / 2;

              return (
                <g key={idx}>
                  {/* Kotak untuk setiap nama - with conditional border */}
                  <rect x={xLeft + padX} y={yBoxStart}
                    width={cardW - padX * 2} height={textFieldH}
                    rx={6} ry={6} 
                    fill={isCurrentNameMatch ? "#FEF3C7" : "#ffffff"} 
                    stroke={nameBorderColor} 
                    strokeWidth={nameBorderWidth}
                    style={{ 
                      pointerEvents: 'none',
                      filter: isCurrentNameMatch ? "drop-shadow(0 2px 4px rgba(245,158,11,0.3))" : "none"
                    }} />
                  
                  {/* Text nama - selectable and copyable */}
                  <text x={textX} y={yBoxStart + textFieldH / 2}
                    textAnchor={textAlign} alignmentBaseline="central"
                    fill="#111827" strokeWidth={1}
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                      fontSize: bp.isMobile ? "11px" : "12px", 
                      fontWeight: 200,
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      MozUserSelect: 'text',
                      msUserSelect: 'text',
                      cursor: 'text',
                      pointerEvents: 'auto'
                    }}>
                    {name}
                  </text>
                  
                  {/* Copy button */}
                  <g 
                    transform={`translate(${buttonX}, ${buttonY})`}
                    onClick={(e) => handleCopyName(name, attrs.id, idx, e)}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  >
                    {/* Button background */}
                    <rect 
                      width={buttonSize} 
                      height={buttonSize} 
                      rx={4} 
                      ry={4}
                      fill={isCopied ? "#10B981" : "#f3f4f6"}
                      stroke={isCopied ? "#059669" : "#d1d5db"}
                      strokeWidth={1}
                      style={{ transition: 'all 0.2s' }}
                    />
                    
                    {isCopied ? (
                      /* Checkmark icon when copied */
                      <path
                        d="M6 11 L9 14 L16 7"
                        stroke="#ffffff"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ) : (
                      /* Copy icon */
                      <g>
                        <rect
                          x={5}
                          y={6}
                          width={9}
                          height={11}
                          rx={1.5}
                          ry={1.5}
                          fill="none"
                          stroke="#6b7280"
                          strokeWidth={1.5}
                        />
                        <path
                          d="M8 6 V5 Q8 4 9 4 H15 Q16 4 16 5 V14 Q16 15 15 15 H14"
                          fill="none"
                          stroke="#6b7280"
                          strokeWidth={1.5}
                        />
                      </g>
                    )}
                  </g>
                </g>
              );
            })
          ) : (
            // Jika tidak ada nama, tampilkan kotak kosong
            <rect x={xLeft + padX} y={yBoxes + boxH + (bp.isMobile ? 10 : 12)}
              width={cardW - padX * 2} height={textFieldH}
              rx={6} ry={6} fill="#ffffff" stroke="#c4c4c4" strokeWidth={1} />
          )}
        </g>

        {/* Tombol panah/play */}
        {hasChildren && (
          <g className="p-2" transform={`translate(${xLeft + cardW - (bp.isMobile ? 48 : 52)}, ${yTop + 10})`}
            onClick={(e) => toggleByDatum(nodeDatum, e)} style={{ cursor: "pointer" }}>
            <rect width={bp.isMobile ? 30 : 32} height={bp.isMobile ? 30 : 32}
              rx={6} ry={6} fill="#ffffff" stroke="#c4c4c4" />
            <path d="M10 9 L22 16 L10 23 Z" fill="#6b7280"
              transform={isCollapsed ? "" : "rotate(90 16 16)"} />
          </g>
        )}
      </g>
    );
  }, [toggleByDatum, bp.isMobile, bp.isTablet, cardW, padX, padY, boxW, boxH, maxTitleChars, titleFontPx, lastClickedPath, searchMatches, currentMatchIndex, router, isFullscreen, exitFullscreen, copiedNameId, handleCopyName]);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 peta-jabatan-container">
      {/* ===== TOP BAR (mobile seperti screenshot, desktop seperti semula) ===== */}
      {bp.isMobile ? (
        <div className="flex flex-col gap-2">
          {/* Baris 1: Search + Reset */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              placeholder="Cari Jabatan atau Nama Pejabat"
              value={filterText}
              onChange={(e) => {
                const newValue = e.target.value;
                setFilterText(newValue);
                // Trigger reset if input is cleared
                if (newValue === "") {
                  handleReset();
                }
              }}
              className="px-3 py-2 rounded border text-sm"
            />
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
          {/* Search Results Navigation Mobile */}
          {searchMatches.length > 0 && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-sm text-green-700 font-medium">
                {searchMatches.length} hasil ({currentMatchIndex + 1}/{searchMatches.length})
              </span>
              {searchMatches.length > 1 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentMatchIndex((prev) => (prev > 0 ? prev - 1 : searchMatches.length - 1))}
                    className="p-1 hover:bg-green-100 rounded transition-colors"
                    title="Sebelumnya"
                  >
                    <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentMatchIndex((prev) => (prev < searchMatches.length - 1 ? prev + 1 : 0))}
                    className="p-1 hover:bg-green-100 rounded transition-colors"
                    title="Berikutnya"
                  >
                    <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
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
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-2 mb-2">Peta Jabatan</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Cari Jabatan atau Nama Pejabat"
              value={filterText}
              onChange={(e) => {
                const newValue = e.target.value;
                setFilterText(newValue);
                // Trigger reset if input is cleared
                if (newValue === "") {
                  handleReset();
                }
              }}
              className="px-3 py-2 rounded border text-sm w-[320px]"
            />
            <button
              onClick={handleReset}
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
            options={[{ label: "Pusat", value: "PUSAT" }, { label: "Daerah", value: "DAERAH" }]}
            size={bp.isMobile ? "sm" : "md"}
          />
          <Segmented
            value={fungsionalMode}
            onChange={setFungsionalMode}
            options={[{ label: "Struktural", value: "STRUKTURAL" }, { label: "Fungsional", value: "FUNGSIONAL" }]}
            size={bp.isMobile ? "sm" : "md"}
          />
        </div>

        {/* Search Results Navigation */}
        {searchMatches.length > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <span className="text-sm text-green-700 font-medium">
              {searchMatches.length} hasil ditemukan
            </span>
            {searchMatches.length > 1 && (
              <>
                <span className="text-xs text-green-600">
                  ({currentMatchIndex + 1}/{searchMatches.length})
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentMatchIndex((prev) => (prev > 0 ? prev - 1 : searchMatches.length - 1))}
                    className="p-1 hover:bg-green-100 rounded transition-colors"
                    title="Hasil sebelumnya"
                  >
                    <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentMatchIndex((prev) => (prev < searchMatches.length - 1 ? prev + 1 : 0))}
                    className="p-1 hover:bg-green-100 rounded transition-colors"
                    title="Hasil berikutnya"
                  >
                    <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Tips Navigasi - Collapsible tooltip */}
      {!loading && rd3Data.length > 0 && (
        <div className="space-y-2">
          {/* Desktop: Tips dan Persesjen dalam satu baris */}
          <div className="hidden sm:flex sm:items-center sm:justify-between gap-3">
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg text-sm hover:bg-brand-100 transition-colors"
            >
              <svg className="w-5 h-5 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-brand-900">Tips Navigasi</span>
              <svg 
                className={`w-4 h-4 text-brand-600 transition-transform ${showTips ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Persesjen Buttons - Desktop */}
            <div className="flex items-center gap-2">
              {petaJabatanDoc && (
                <button
                  onClick={() => window.open(petaJabatanDoc, '_blank')}
                  className="px-3 py-2 rounded border text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2"
                  title="Lihat Peta Jabatan (Persesjen)"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate">Persesjen Peta Jabatan</span>
                </button>
              )}
              {isAdmin && kelasJabatanDoc && (
                <button
                  onClick={() => window.open(kelasJabatanDoc, '_blank')}
                  className="px-3 py-2 rounded border text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2"
                  title="Lihat Kelas Jabatan (Persesjen)"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate">Persesjen Kelas Jabatan</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile: Tips button saja */}
          <button
            onClick={() => setShowTips(!showTips)}
            className="sm:hidden flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg text-sm hover:bg-brand-100 transition-colors w-full justify-center"
          >
            <svg className="w-5 h-5 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-brand-900">Tips Navigasi</span>
            <svg 
              className={`w-4 h-4 text-brand-600 transition-transform ${showTips ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Tips content */}
          {showTips && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <ul className="list-disc list-inside space-y-0.5 text-xs text-brand-900">
                <li>Gunakan scroll mouse atau pinch gesture untuk zoom in/out</li>
                <li>Drag background untuk menggeser tampilan</li>
                <li>Klik panah di card untuk expand/collapse cabang</li>
                {bp.isMobile && <li className="text-brand-600 font-medium">💡 Rotate device ke landscape untuk tampilan lebih luas</li>}
              </ul>
            </div>
          )}

          {/* Mobile: Persesjen Buttons di bawah tips */}
          <div className="sm:hidden flex flex-col gap-2">
            {petaJabatanDoc && (
              <button
                onClick={() => window.open(petaJabatanDoc, '_blank')}
                className="px-3 py-2 rounded border text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                title="Lihat Peta Jabatan (Persesjen)"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">Persesjen Peta Jabatan</span>
              </button>
            )}
            {isAdmin && kelasJabatanDoc && (
              <button
                onClick={() => window.open(kelasJabatanDoc, '_blank')}
                className="px-3 py-2 rounded border text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                title="Lihat Kelas Jabatan (Persesjen)"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">Persesjen Kelas Jabatan</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: (isFullscreen ? "100vh" : (bp.isMobile ? "80vh" : "70vh")),
          border: "1px solid #e5e7eb",
          background: "#fff",
          overflow: "auto",
          position: "relative"
        }}
        className="rounded custom-scrollbar"
      >
        {/* Fullscreen Controls - Top Right */}
        {isFullscreen && (
          <>
            {/* Toggle Button (always visible) */}
            <button
              onClick={() => setIsFullscreenPanelOpen(!isFullscreenPanelOpen)}
              className="absolute top-4 right-4 z-50 p-2.5 bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              title={isFullscreenPanelOpen ? "Sembunyikan Panel" : "Tampilkan Panel"}
            >
              {isFullscreenPanelOpen ? (
                // Collapse/Hide icon (chevron right or minimize)
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              ) : (
                // Menu/Show icon (hamburger)
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {/* Control Panel (collapsible) */}
            {isFullscreenPanelOpen && (
              <div className="absolute top-16 right-4 z-50 w-72 sm:w-80 max-w-[calc(100vw-2rem)]">
                <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-2.5 sm:p-3 space-y-2 sm:space-y-3">
                  {/* Header with Exit Button */}
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="text-xs sm:text-sm font-semibold text-gray-700">Filter & Pencarian</span>
                    <button
                      onClick={exitFullscreen}
                      className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded transition-colors touch-manipulation"
                      title="Exit Fullscreen"
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Row 1: Scope and Mode Filters - More compact on mobile */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <Segmented
                      value={scope}
                      onChange={setScope}
                      options={[{ label: "Pusat", value: "PUSAT" }, { label: "Daerah", value: "DAERAH" }]}
                      size="sm"
                    />
                    <Segmented
                      value={fungsionalMode}
                      onChange={setFungsionalMode}
                      options={[{ label: "Struktural", value: "STRUKTURAL" }, { label: "Fungsional", value: "FUNGSIONAL" }]}
                      size="sm"
                    />
                  </div>
                  
                  {/* Row 2: Search Input - More compact on mobile */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      placeholder="Cari..."
                      value={filterText}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setFilterText(newValue);
                        // Trigger reset if input is cleared
                        if (newValue === "") {
                          handleReset();
                        }
                      }}
                      className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      autoFocus={false}
                    />
                    <button
                      onClick={handleReset}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 rounded border text-xs sm:text-sm hover:bg-gray-50 whitespace-nowrap"
                      title="Reset"
                    >
                      Reset
                    </button>
                  </div>
                  
                  {/* Row 3: Search Results Navigation - More compact */}
                  {searchMatches.length > 0 && (
                    <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t bg-green-50 -mx-2.5 sm:-mx-3 -mb-2.5 sm:-mb-3 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-b-lg">
                      <span className="text-xs sm:text-sm text-green-700 font-medium">
                        {searchMatches.length} hasil ({currentMatchIndex + 1}/{searchMatches.length})
                      </span>
                      {searchMatches.length > 1 && (
                        <div className="flex gap-0.5 sm:gap-1">
                          <button
                            onClick={() => setCurrentMatchIndex((prev) => (prev > 0 ? prev - 1 : searchMatches.length - 1))}
                            className="p-1 sm:p-1.5 hover:bg-green-100 active:bg-green-200 rounded transition-colors touch-manipulation"
                            title="Previous"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setCurrentMatchIndex((prev) => (prev < searchMatches.length - 1 ? prev + 1 : 0))}
                            className="p-1 sm:p-1.5 hover:bg-green-100 active:bg-green-200 rounded transition-colors touch-manipulation"
                            title="Next"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
              <p className="text-sm text-gray-600">Memuat peta jabatan...</p>
            </div>
          </div>
        )}

        {/* Render Tree hanya jika ada data valid */}
        {!loading && typeof window !== "undefined" && rd3Data.length > 0 ? (
          <>
            <Tree
              data={rd3Data}
              orientation="vertical"
              translate={translate || { x: Math.max(24, containerSize.w / 2), y: bp.isMobile ? 80 : 110 }}
              zoomable
              collapsible={false}
              zoom={currentZoom || initialZoom}
              pathFunc="step"
              nodeSize={nodeSize}
              separation={separation}
              transitionDuration={500}
              scaleExtent={{ min: 0.1, max: 2 }}
              renderCustomNodeElement={renderNode}
              enableLegacyTransitions={false}
            />
          </>
        ) : (
          !loading && (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
              {rows.length === 0 ? "Data kosong" : "Tidak ada yang cocok"}
            </div>
          )
        )}
      </div>
    </div>
  );
}