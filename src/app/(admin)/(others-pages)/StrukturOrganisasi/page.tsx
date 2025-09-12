// src/app/StrukturOrganisasi/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {apiFetch} from "@/lib/apiFetch";

// react-d3-tree (client only)
const Tree = dynamic(() => import("react-d3-tree").then((m) => m.default), { ssr: false });

type APIRow = {
    id: string;
    parent_id: string | null;
    name: string;
    slug: string;
    level: number;
    order_index: number;
};

type D3Node = {
    _id: string;
    _slug: string;
    name: string;
    children?: D3Node[];
    _collapsed?: boolean;
};

// --- util: bungkus teks menjadi beberapa baris ---
function wrapText(name: string, maxChars = 20): string[] {
    const words = (name || "").split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
        const test = (line ? line + " " : "") + w;
        if (test.length > maxChars) {
            if (line) lines.push(line);
            if (w.length > maxChars) {
                let i = 0;
                while (i < w.length) {
                    lines.push(w.slice(i, i + maxChars));
                    i += maxChars;
                }
                line = "";
            } else {
                line = w;
            }
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [name];
}

export default function StrukturOrganisasiPage() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

    const [rows, setRows] = useState<APIRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [filter, setFilter] = useState("");

    const [isFullscreen, setIsFullscreen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await apiFetch("/api/struktur-organisasi", { cache: "no-store" });
            if (!res.ok) throw new Error(`Gagal mengambil data (${res.status})`);
            const data: APIRow[] = await res.json();
            setRows(data);
        } catch (e: any) {
            setErr(e?.message || "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // pantau container untuk center awal
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) setContainerSize({ w: r.width, h: r.height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Fullscreen sync
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
        if (!containerRef.current) return;
        try {
            await containerRef.current.requestFullscreen();
        } catch {
            // noop
        }
    };
    const exitFullscreen = async () => {
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch {
                // noop
            }
        }
    };

    // flat -> tree (urut child by order_index, fallback name)
    const roots = useMemo<D3Node[]>(() => {
        if (!rows.length) return [];
        const byParent = new Map<string | null, APIRow[]>();
        for (const r of rows) {
            const arr = byParent.get(r.parent_id) || [];
            arr.push(r);
            byParent.set(r.parent_id, arr);
        }
        for (const [k, arr] of byParent.entries()) {
            arr.sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name, "id"));
            byParent.set(k, arr);
        }
        const build = (n: APIRow): D3Node => ({
            _id: n.id,
            _slug: n.slug,
            name: n.name,
            _collapsed: false,
            children: (byParent.get(n.id) || []).map(build),
        });
        return (byParent.get(null) || []).map(build);
    }, [rows]);

    // filter nama/slug
    const lcFilter = filter.trim().toLowerCase();
    const filteredRoots = useMemo<D3Node[]>(() => {
        if (!lcFilter) return roots;
        const match = (n: D3Node) =>
            n.name.toLowerCase().includes(lcFilter) || n._slug.toLowerCase().includes(lcFilter);

        const walk = (n: D3Node): D3Node | null => {
            const kids = n.children?.map(walk).filter(Boolean) as D3Node[] | undefined;
            if (match(n) || (kids && kids.length)) return { ...n, _collapsed: false, children: kids };
            return null;
        };
        return roots.map(walk).filter(Boolean) as D3Node[];
    }, [roots, lcFilter]);

    // data untuk react-d3-tree
    const toRD3 = (n: D3Node): any => ({
        name: n.name,
        collapsed: n._collapsed,
        children: n.children?.map(toRD3),
        __meta: { id: n._id, slug: n._slug },
    });
    const rd3Data = useMemo(() => filteredRoots.map(toRD3), [filteredRoots]);

    // posisi awal center X, offset Y 60
    const translate = useMemo(
        () => ({ x: Math.max(40, containerSize.w / 2), y: 60 }),
        [containerSize]
    );

    // parameter tampilan node
    const maxCharsPerLine = 20;
    const lineHeight = 16;
    const padY = 12;
    const boxWidth = 240;

    return (
        <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold mr-2">Struktur Organisasi</h1>
                <button className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50" onClick={load} disabled={loading}>
                    {loading ? "Memuat…" : "Reload"}
                </button>

                <div className="ml-auto flex items-center gap-2">
                    <input
                        placeholder="Cari Jabatan"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-3 py-1.5 rounded border text-sm w-[220px]"
                    />
                    <button className="px-2 py-1.5 rounded border text-sm hover:bg-gray-50" onClick={() => setFilter("")}>
                        Reset
                    </button>

                    {!isFullscreen ? (
                        <button
                            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                            onClick={enterFullscreen}
                            title="Fullscreen"
                        >
                            Fullscreen
                        </button>
                    ) : (
                        <button
                            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                            onClick={exitFullscreen}
                            title="Exit Fullscreen"
                        >
                            Exit Fullscreen
                        </button>
                    )}
                </div>
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}

            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: "70vh", // saat fullscreen akan otomatis jadi 100vh via listener
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                }}
                className="rounded"
            >
                {typeof window !== "undefined" && rd3Data.length > 0 && (
                    <Tree
                        data={rd3Data as any}
                        orientation="vertical"
                        translate={translate}
                        zoomable
                        collapsible
                        nodeSize={{ x: 260, y: 150 }}
                        separation={{ siblings: 1.2, nonSiblings: 1.4 }}
                        pathFunc="step"                 // elbow -> step
                        transitionDuration={450}        // animasi expand/collapse
                        renderCustomNodeElement={({ nodeDatum, toggleNode }) => {
                            const lines = wrapText(nodeDatum.name, maxCharsPerLine);
                            const boxHeight = lines.length * lineHeight + padY * 2;
                            const yTop = -(boxHeight / 2);
                            const xLeft = -(boxWidth / 2);

                            return (
                                <g>
                                    {/* KOTAK NODE */}
                                    <rect
                                        width={boxWidth}
                                        height={boxHeight}
                                        x={xLeft}
                                        y={yTop}
                                        rx={12}
                                        ry={12}
                                        fill="#2F5597"
                                        stroke="#b6c2d2"
                                        strokeWidth={1}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleNode();
                                        }}
                                        style={{
                                            cursor: "pointer",
                                            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.08))",
                                            transition: "opacity 200ms ease",
                                        }}
                                    />
                                    {/* TEKS MULTI-BARIS */}
                                    {lines.map((line, i) => {
                                        const baselineY = yTop + padY + lineHeight / 2 + i * lineHeight;
                                        return (
                                            <text
                                                key={i}
                                                x={0}
                                                y={baselineY}
                                                textAnchor="middle"
                                                alignmentBaseline="central"
                                                fill="#ffffff"
                                                stroke="none"
                                                strokeWidth={0}
                                                style={{
                                                    fontFamily: "Arial, Helvetica, sans-serif",
                                                    fontSize: "13px",
                                                    fontWeight: "normal",
                                                    shapeRendering: "geometricPrecision",
                                                    textRendering: "optimizeLegibility",
                                                }}
                                                pointerEvents="none"
                                            >
                                                {line}
                                            </text>
                                        );
                                    })}

                                    {/* TOMBOL PANAH di TENGAH SISI KANAN */}
                                    {Array.isArray(nodeDatum.children) && nodeDatum.children.length > 0 && (
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleNode();
                                            }}
                                            style={{ cursor: "pointer" }}
                                            transform={`translate(${boxWidth / 2 - 12}, -9)`}
                                        >
                                            <rect width="18" height="18" rx="5" ry="5" fill="#ffffff" stroke="#c4c4c4" />
                                            <path
                                                d="M6 5 L12 9 L6 13 Z"
                                                fill="#6b7280"
                                                transform={nodeDatum.__rd3t?.collapsed ? "" : "rotate(90 9 9)"}
                                            />
                                        </g>
                                    )}
                                </g>
                            );
                        }}
                    />
                )}
                {!loading && rd3Data.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                        {rows.length === 0 ? "Data kosong." : "Tidak ada yang cocok dengan filter."}
                    </div>
                )}
            </div>

            <div className="text-xs text-gray-500">
                • Drag background untuk pan, scroll untuk zoom. Klik kotak atau panah untuk show/hide anak. Fullscreen didukung.
            </div>
        </div>
    );
}
