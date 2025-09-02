// src/app/api/struktur-organisasi/tree/route.ts
import { NextRequest } from 'next/server';
import pool from '@/lib/db';

// === GET: kembalikan flat rows untuk GoJS (urut created_at) ===
export async function GET(_req: NextRequest) {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, slug, parent_id, level, created_at
             FROM struktur_organisasi
             ORDER BY level ASC, created_at ASC`
        );
        return Response.json(rows);
    } catch (e: any) {
        console.error(e);
        return Response.json({ ok: false, error: 'Internal error' }, { status: 500 });
    }
}

// === PUT: batch sinkronisasi (tetap sama, dalam transaksi) ===
export async function PUT(req: NextRequest) {
    const client = await pool.connect();
    try {
        const { structure } = await req.json();
        if (!Array.isArray(structure)) {
            return Response.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
        }

        await client.query('BEGIN');
        for (const n of structure) {
            await client.query(
                `UPDATE struktur_organisasi
                 SET name = $2,
                     parent_id = $3,
                     level = $4,
                     updated_at = now()
                 WHERE id::text = $1`,
                [n.id, n.name, n.parent_id, n.level]
            );
        }
        await client.query('COMMIT');
        return Response.json({ ok: true });
    } catch (e: any) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error(e);
        return Response.json({ ok: false, error: 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}
