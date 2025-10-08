"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

type APIRow = {
  id: string;
  parent_id: string | null;
  nama_jabatan: string;
  slug: string;
  unit_kerja: string | null;
  level: number;
  order_index: number;
};

type SearchItem = {
  id: string;
  name: string;
  unit_kerja: string | null;
  path: string;
  searchable: string;
};

export default function HomeSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<any>(null);
  const resultsListRef = useRef<HTMLUListElement | null>(null);

  const buildItemsFromFlat = useCallback((rows: APIRow[]): SearchItem[] => {
    const byId = new Map<string, APIRow>();
    const children = new Map<string | null, APIRow[]>();

    for (const r of rows) {
      byId.set(r.id, r);
      const arr = children.get(r.parent_id) || [];
      arr.push(r);
      children.set(r.parent_id, arr);
    }

    for (const [k, arr] of children.entries()) {
      arr.sort(
        (a, b) =>
          (a.order_index ?? 0) - (b.order_index ?? 0) ||
          a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
      );
      children.set(k, arr);
    }

    const calcPath = (node: APIRow): string => {
      const segs: string[] = [];
      let cur: APIRow | null | undefined = node;
      while (cur) {
        segs.push(cur.slug);
        cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null;
      }
      segs.reverse();
      return `anjab/${segs.join("/")}`;
    };

    return rows.map((r) => ({
      id: r.id,
      name: r.nama_jabatan,
      unit_kerja: r.unit_kerja,
      path: calcPath(r),
      searchable: [r.nama_jabatan, r.unit_kerja ?? "", r.slug, calcPath(r)].join(" ").toLowerCase(),
    }));
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (allItems.length) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/peta-jabatan", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load peta jabatan (${res.status})`);
      const flat: APIRow[] = await res.json();
      setAllItems(buildItemsFromFlat(flat));
    } catch (e: any) {
      setErr(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [allItems.length, buildItemsFromFlat]);

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
      const filtered = allItems.filter((it) => it.searchable.includes(needle)).slice(0, 20);
      setResults(filtered);
      setActiveIdx(-1);
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, allItems]);

  useEffect(() => {
    if (!open) return;
    // Use 'click' instead of 'pointerdown' so that scrolling/dragging the page
    // (which often emits pointerdown events) does not immediately close the dropdown.
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      const inContainer = containerRef.current?.contains(t);
      if (inContainer) return;
      setOpen(false);
      setActiveIdx(-1);
    };
    document.addEventListener("click", onClickOutside as any);
    return () => document.removeEventListener("click", onClickOutside as any);
  }, [open]);

  // keep the active item visible when navigating with keyboard
  useEffect(() => {
    if (activeIdx < 0) return;
    const list = resultsListRef.current;
    if (!list) return;
    const child = list.children[activeIdx] as HTMLElement | undefined;
    if (!child) return;
    // scroll the button (or the list item) into view, but keep it local to the list
    const btn = child.querySelector('button') as HTMLElement | null;
    (btn || child).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeIdx]);

  const goToItem = (item: SearchItem) => {
    setOpen(false);
    setActiveIdx(-1);
    const href = `/${item.path.replace(/^\/+/g, "")}`;
    router.push(href);
  };

  const onKeyDownInput: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i < 0 ? (results.length ? 0 : -1) : Math.min((results.length || 0) - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i < 0 ? (results.length ? results.length - 1 : -1) : Math.max(0, i - 1)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < results.length) goToItem(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div className="w-full" ref={containerRef}>
      <div className="relative">
        <span className="absolute -translate-y-1/2 left-3 top-1/2 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx={11} cy={11} r={7} />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </span>

        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setOpen(true);
            void ensureLoaded();
          }}
          onKeyDown={onKeyDownInput}
          placeholder="Cari Jabatan atau Unit..."
          className="w-full h-14 rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-lg text-gray-700 outline-none shadow-sm focus:ring-2 focus:ring-violet-400"
        />

        {open && (
          <div
            className="absolute left-0 right-0 z-[1000] mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Memuat…</div>
            ) : err ? (
              <div className="px-3 py-2 text-sm text-red-600">{err}</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Tidak ada hasil</div>
            ) : (
              <ul
                ref={resultsListRef}
                className="max-h-64 overflow-auto py-1 overscroll-contain touch-pan-y"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {results.map((it, idx) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => goToItem(it)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full text-left px-3 py-2 text-sm ${idx === activeIdx ? 'bg-violet-50 text-violet-700' : 'hover:bg-gray-50'}`}>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-[11px] text-gray-500">{it.path} {it.unit_kerja ? `• ${it.unit_kerja}` : ''}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
