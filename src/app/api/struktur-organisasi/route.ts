// src/app/api/struktur-organisasi/route.ts
import { NextRequest } from 'next/server';
import pool from '@/lib/db';

type Row = {
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    level: number;
    created_at: string;
};

type TreeNode = {
    name: string;
    path: string;
    subItems?: TreeNode[];
};

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const base = (searchParams.get('base') || 'Anjab').trim() || 'Anjab';
        const root_id = searchParams.get('root_id');
        const root_slug = searchParams.get('root_slug');

        let rows: Row[] = [];

        if (root_id || root_slug) {
            // Ambil SUBTREE lewat CTE, urut level + created_at
            const { rows: r0 } = await pool.query<Row>(
                root_id
                    ? `WITH RECURSIVE subtree AS (
                            SELECT id, name, slug, parent_id, level, created_at
                            FROM struktur_organisasi
                            WHERE id::text = $1
                       UNION ALL
                        SELECT c.id, c.name, c.slug, c.parent_id, c.level, c.created_at
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id
                            )
                        SELECT * FROM subtree
                        ORDER BY level ASC, created_at ASC`
                    : `WITH RECURSIVE subtree AS (
                            SELECT id, name, slug, parent_id, level, created_at
                            FROM struktur_organisasi
                            WHERE slug = $1
                            UNION ALL
                            SELECT c.id, c.name, c.slug, c.parent_id, c.level, c.created_at
                            FROM struktur_organisasi c
                                     JOIN subtree s ON c.parent_id = s.id
                        )
                       SELECT * FROM subtree
                       ORDER BY level ASC, created_at ASC`,
                [root_id ?? root_slug!]
            );
            rows = r0;
            if (!rows.length) {
                return Response.json({ ok: false, error: 'Root not found' }, { status: 404 });
            }
        } else {
            // Ambil SEMUA, urut level + created_at
            const { rows: r0 } = await pool.query<Row>(
                `SELECT id, name, slug, parent_id, level, created_at
                 FROM struktur_organisasi
                 ORDER BY level ASC, created_at ASC`
            );
            rows = r0;
            if (!rows.length) return Response.json([]);
        }

        // Index: per id & anak per parent (pakai urutan push dari query → sudah by created_at)
        const byId = new Map<string, Row>();
        const children = new Map<string | null, Row[]>();
        for (const r of rows) {
            byId.set(r.id, r);
            const key = r.parent_id;
            const arr = children.get(key);
            if (arr) arr.push(r);
            else children.set(key, [r]);
        }

        // Cache path per id (base + rantai slug)
        const memoPath = new Map<string, string>();
        function pathOf(node: Row): string {
            const cached = memoPath.get(node.id);
            if (cached) return cached;

            const segs: string[] = [node.slug];
            let cur = node.parent_id ? byId.get(node.parent_id) || null : null;
            while (cur) {
                segs.push(cur.slug);
                cur = cur.parent_id ? byId.get(cur.parent_id) || null : null;
            }
            segs.reverse();
            const p = [base, ...segs].join('/');
            memoPath.set(node.id, p);
            return p;
        }

        // Builder rekursif — TIDAK sort, biarkan urutan dari query (created_at)
        function build(node: Row): TreeNode {
            const kids = children.get(node.id) || [];
            const mappedKids = kids.map(build);
            const t: TreeNode = {
                name: node.name,
                path: pathOf(node),
            };
            if (mappedKids.length) t.subItems = mappedKids;
            return t;
        }

        // Jika minta subtree → kembalikan 1 object (root = level minimum di hasil CTE)
        if (root_id || root_slug) {
            const rootNode = rows.reduce((min, x) => (x.level < min.level ? x : min), rows[0]);
            return Response.json(build(rootNode));
        }

        // Kalau tanpa filter → kembalikan semua root (parent_id null), urutan root ikut created_at global
        const roots = children.get(null) || [];
        const trees = roots.map(build);
        return Response.json(trees);
    } catch (e: any) {
        console.error(e);
        return Response.json({ ok: false, error: 'Internal error' }, { status: 500 });
    }
}
