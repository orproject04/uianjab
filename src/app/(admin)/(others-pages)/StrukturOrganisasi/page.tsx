'use client';

import * as React from 'react';
import * as go from 'gojs';

type Row = {
    id: string;
    name: string;
    parent_id: string | null;
};

export default function StrukturOrganisasi() {
    const diagramRef = React.useRef<HTMLDivElement | null>(null);
    const diagram = React.useRef<go.Diagram | null>(null);

    const [info, setInfo] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);

    // Modal states
    const [showAdd, setShowAdd] = React.useState(false);
    const [showDelete, setShowDelete] = React.useState(false);

    // Add form states
    const [addName, setAddName] = React.useState('Unit Baru');
    const [addSlug, setAddSlug] = React.useState('unit-baru');
    const [slugTouched, setSlugTouched] = React.useState(false);

    // Selection states
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [selectedName, setSelectedName] = React.useState<string>('');

    // util slugify
    const toSlug = (s: string) =>
        (s || 'unit')
            .toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 48) || 'unit';

    // ===== INIT DIAGRAM =====
    React.useEffect(() => {
        if (!diagramRef.current || diagram.current) return;
        const $ = go.GraphObject.make;

        const d = $(go.Diagram, diagramRef.current, {
            'undoManager.isEnabled': true,
            layout: $(go.TreeLayout, { angle: 90, layerSpacing: 35 }), // kebawah
            'draggingTool.dragsTree': true,
            'draggingTool.isGridSnapEnabled': false,
            initialContentAlignment: go.Spot.Center,
            allowMove: true,
            allowDrop: true,
        });

        // UX pan/drag/zoom
        d.toolManager.dragSelectingTool.isEnabled = false;
        d.toolManager.draggingTool.isEnabled = true;
        d.toolManager.panningTool.isEnabled = true;
        d.toolManager.mouseWheelBehavior = go.ToolManager.WheelZoom;
        d.animationManager.isEnabled = false;

        // Pan hanya di background (kalau di node → drag node)
        const origCanStartPan = d.toolManager.panningTool.canStart.bind(d.toolManager.panningTool);
        d.toolManager.panningTool.canStart = function () {
            const dia = this.diagram;
            if (!dia) return false;
            const e = dia.lastInput;
            const part = dia.findPartAt(e.documentPoint, true);
            if (part instanceof go.Node) return false;
            return origCanStartPan();
        };

        // Node template (highlight hijau saat drag over)
        d.nodeTemplate = $(
            go.Node, 'Auto',
            {
                cursor: 'pointer',
                mouseDragEnter: (_e, node) => {
                    const shape = node.findObject('SHAPE') as go.Shape | null;
                    if (shape) { shape.stroke = '#22c55e'; shape.strokeWidth = 3; }
                },
                mouseDragLeave: (_e, node) => {
                    const shape = node.findObject('SHAPE') as go.Shape | null;
                    if (shape) { shape.stroke = null; shape.strokeWidth = 0; }
                },
                mouseDrop: async (_e, target) => {
                    const dgm = target.diagram!;
                    const m = dgm.model as go.TreeModel;
                    const targetKey = (target.data as any).key as string;

                    dgm.startTransaction('reparent-on-drop');
                    const moved: string[] = [];
                    dgm.selection.each(part => {
                        if (!(part instanceof go.Node)) return;
                        const childKey = (part.data as any).key as string;

                        // cegah loop
                        let cur: any = target.data;
                        while (cur) {
                            if (cur.key === childKey) { cur = null; return; }
                            cur = cur.parent ? m.findNodeDataForKey(cur.parent) : null;
                        }

                        m.setParentKeyForNodeData(part.data, targetKey);
                        moved.push(childKey);
                    });
                    dgm.commitTransaction('reparent-on-drop');

                    // persist parent per node
                    try {
                        await Promise.allSettled(
                            moved.map(id =>
                                fetch(`/api/struktur-organisasi/node/${encodeURIComponent(id)}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ parent_id: targetKey })
                                })
                            )
                        );
                    } catch {/* safety net di Save All */}

                    // clear highlight
                    const shape = target.findObject('SHAPE') as go.Shape | null;
                    if (shape) { shape.stroke = null; shape.strokeWidth = 0; }
                }
            },
            $(go.Shape, 'RoundedRectangle',
                { name: 'SHAPE', fill: '#2F5597', strokeWidth: 0,
                    spot1: new go.Spot(0,0,4,4), spot2: new go.Spot(1,1,-4,-4) }),
            $(go.TextBlock,
                { name: 'TEXT', margin: 8, editable: true, stroke: 'white' },
                new go.Binding('text', 'name').makeTwoWay()
            )
        );

        // Link ortho
        d.linkTemplate = $(
            go.Link, { routing: go.Routing.Orthogonal, corner: 6, layerName: 'Background' },
            $(go.Shape, { stroke: '#869FBD', strokeWidth: 2 })
        );

        // Drop ke background → jadikan root + persist
        d.mouseDrop = async () => {
            const p = d.selection.first();
            if (!(p instanceof go.Node)) return;
            const m = d.model as go.TreeModel;

            d.startTransaction('make-root');
            m.setParentKeyForNodeData(p.data, undefined);
            d.commitTransaction('make-root');

            try {
                await fetch(`/api/struktur-organisasi/node/${encodeURIComponent((p.data as any).key)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parent_id: null })
                });
            } catch {/* safety net di Save All */}
        };

        // Rename inline → PATCH
        d.addDiagramListener('TextEdited', async (e) => {
            const tb = e.subject as go.TextBlock; if (!tb || !tb.part) return;
            const id = (tb.part as any).data?.key as string; const newName = tb.text || '';
            if (!id) return;
            try {
                await fetch(`/api/struktur-organisasi/node/${encodeURIComponent(id)}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
            } catch {/* safety net di Save All */}
        });

        // Track selection
        d.addDiagramListener('ChangedSelection', () => {
            const part = d.selection.first();
            setSelectedId(part ? (part.data as any).key : null);
            setSelectedName(part ? (part.data as any).name : '');
        });

        diagram.current = d;
    }, []);

    // ===== LOAD DATA =====
    const load = React.useCallback(async () => {
        const d = diagram.current; if (!d) return;
        setError(null); setInfo('');
        try {
            const res = await fetch('/api/struktur-organisasi/tree', { cache: 'no-store' });
            if (!res.ok) throw new Error('Gagal ambil data');
            const rows = (await res.json()) as Row[];

            const arr = rows.map(r => ({
                key: r.id,
                parent: r.parent_id ?? undefined,
                name: r.name
            }));

            d.model = new go.TreeModel(arr);

            // geser sedikit ke atas setelah layout awal (sekali)
            const once = (e: go.DiagramEvent) => {
                d.position = new go.Point(d.position.x, d.documentBounds.y - 100);
                d.removeDiagramListener('InitialLayoutCompleted', once);
            };
            d.addDiagramListener('InitialLayoutCompleted', once);

            setInfo(`${arr.length} node`);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    // ===== TAMBAH (dengan NAME + SLUG) =====
    const openAdd = () => {
        setAddName('Unit Baru');
        setAddSlug('unit-baru');
        setSlugTouched(false);
        setShowAdd(true);
    };

    const submitAdd = async () => {
        const d = diagram.current; if (!d) return;
        const name = addName.trim();
        const slug = addSlug.trim();
        if (!name) { setError('Nama tidak boleh kosong.'); return; }
        if (!slug) { setError('Slug tidak boleh kosong.'); return; }

        const sel = d.selection.first();
        const parentKey = sel ? (sel.data as any).key as string : null;

        try {
            const res = await fetch('/api/struktur-organisasi/node', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parent_id: parentKey, name, slug })
            });
            const json = await res.json();
            if (!res.ok || !json?.node?.id) throw new Error(json?.error || 'Gagal membuat node');
            const newId: string = json.node.id;

            d.startTransaction('add-node');
            (d.model as go.TreeModel).addNodeData({ key: newId, parent: parentKey ?? undefined, name });
            d.commitTransaction('add-node');

            const once = () => {
                const np = d.findNodeForKey(newId);
                if (np) { d.select(np); d.centerRect(np.actualBounds); }
                d.removeDiagramListener('LayoutCompleted', once as any);
            };
            d.addDiagramListener('LayoutCompleted', once as any);
            d.layoutDiagram(true);

            setShowAdd(false);
            setInfo('Node baru dibuat.');
        } catch (err: any) {
            setError(err.message || 'Gagal menambah node.');
        }
    };

    // ===== HAPUS =====
    const submitDelete = async () => {
        const d = diagram.current; if (!d) return;
        const sel = d.selection.first();
        if (!sel || !(sel instanceof go.Node)) { setShowDelete(false); return; }
        const id = (sel.data as any).key as string;

        try {
            const res = await fetch(`/api/struktur-organisasi/node/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Gagal menghapus node');

            d.startTransaction('delete-subtree');
            sel.findTreeParts().each(part => {
                if (part instanceof go.Node) (d.model as go.TreeModel).removeNodeData((part as any).data);
            });
            d.commitTransaction('delete-subtree');

            setShowDelete(false);
            setInfo('Node terhapus.');
        } catch (err: any) {
            setError(err.message || 'Gagal menghapus node.');
        }
    };

    // ===== SIMPAN (sinkronisasi level massal) =====
    const saveAll = async () => {
        const d = diagram.current; if (!d) return;
        if (isSaving) return;
        setIsSaving(true);
        setError(null); setInfo('');

        try {
            const m = d.model as go.TreeModel;
            const nodes = (m as any).nodeDataArray as Array<{ key: string; parent?: string; name: string }>;

            const map = new Map<string, { key: string; parent?: string }>();
            nodes.forEach(n => map.set(n.key, n));
            const levelOf = (n: { key: string; parent?: string }) => {
                if (!n.parent) return 0;
                let lvl = 0, cur = n.parent as string | undefined;
                while (cur) {
                    const pn = map.get(cur);
                    if (!pn) break;
                    lvl += 1;
                    cur = pn.parent as string | undefined;
                }
                return lvl;
            };

            const payload = nodes.map(n => ({
                id: n.key,
                parent_id: n.parent ?? null,
                name: n.name,
                level: levelOf(n),
            }));

            const res = await fetch('/api/struktur-organisasi/tree', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ structure: payload })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Gagal menyimpan struktur');

            setInfo('Struktur berhasil disinkronkan.');
        } catch (e: any) {
            setError(e.message || 'Gagal menyimpan struktur.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <button className="px-3 py-1 rounded bg-black text-white" onClick={load}>Reload</button>
                <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={openAdd}>Tambah Node</button>
                <button className="px-3 py-1 rounded bg-rose-600 text-white" onClick={() => {
                    if (!selectedId) { setError('Pilih node terlebih dahulu.'); return; }
                    setShowDelete(true);
                }}>Hapus Node</button>
                <button
                    className="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-60"
                    onClick={saveAll}
                    disabled={isSaving}
                >
                    {isSaving ? 'Menyimpan…' : 'Simpan'}
                </button>
                {info && <span className="text-sm text-gray-600">{info}</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
            </div>

            {/* Diagram */}
            <div ref={diagramRef} style={{ width: '100%', height: 600, border: '1px solid #e5e7eb' }} />

            {/* Modal Tambah (Name + Slug) */}
            {showAdd && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-4 w-full max-w-md shadow-lg">
                        <h3 className="text-lg font-semibold mb-3">Tambah Unit</h3>

                        <label className="text-sm block mb-1">Nama</label>
                        <input
                            className="w-full border rounded px-2 py-1 mb-3"
                            value={addName}
                            onChange={(e) => {
                                const v = e.target.value;
                                setAddName(v);
                                if (!slugTouched) setAddSlug(toSlug(v));
                            }}
                            autoFocus
                        />

                        <label className="text-sm block mb-1">Slug</label>
                        <input
                            className="w-full border rounded px-2 py-1 mb-3"
                            value={addSlug}
                            onChange={(e) => { setAddSlug(toSlug(e.target.value)); setSlugTouched(true); }}
                            placeholder="mis. depmin-okk"
                        />

                        <div className="flex justify-end gap-2">
                            <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setShowAdd(false)}>Batal</button>
                            <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={submitAdd}>Simpan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Hapus */}
            {showDelete && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-4 w-full max-w-md shadow-lg">
                        <h3 className="text-lg font-semibold mb-3">Hapus Unit</h3>
                        <p className="text-sm mb-4">
                            Hapus <strong>{selectedName || '(tanpa nama)'}</strong> beserta seluruh sub-unitnya?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setShowDelete(false)}>Batal</button>
                            <button className="px-3 py-1 rounded bg-rose-600 text-white" onClick={submitDelete}>Hapus</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-xs text-gray-500">
                Drag background (klik kiri) untuk pan, scroll untuk zoom.
                Drag node ke node lain untuk ubah parent (highlight hijau).
                Drop ke background untuk menjadikannya root.
                Tambah/Hapus langsung tersimpan. <b>Simpan</b> menyelaraskan level & keseluruhan struktur.
            </div>
        </div>
    );
}
