import { NextRequest } from 'next/server';
import pool from '@/lib/db';

function toSlug(s: string) {
    return (s || 'unit')
        .toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        .slice(0, 48) || 'unit';
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        let { parent_id = null, name, slug } = body || {};
        if (!name) {
            return Response.json({ error: 'name wajib' }, { status: 400 });
        }
        if (!slug) slug = toSlug(name);

        // level = parent.level + 1
        let level = 0;
        if (parent_id) {
            const p = await pool.query('SELECT level FROM struktur_organisasi WHERE id::text = $1', [parent_id]);
            if (p.rowCount) level = Number(p.rows[0].level) + 1;
        }

        const { rows } = await pool.query(
            `INSERT INTO struktur_organisasi (name, slug, parent_id, level)
             VALUES ($1, $2, $3, $4)
                 RETURNING id, name, slug, parent_id, level`,
            [name, slug, parent_id, level]
        );
        return Response.json({ ok: true, node: rows[0] });
    } catch (e: any) {
        console.error(e);
        return Response.json({ error: 'Internal error' }, { status: 500 });
    }
}
