import { NextRequest } from 'next/server';
import pool from '@/lib/db';

// PATCH /api/struktur-organisasi/node/:id
export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }        // 👈 params sebagai Promise
) {
    const client = await pool.connect();
    try {
        const { id } = await ctx.params;              // 👈 await params

        const body = await req.json();
        const wantName = typeof body.name === 'string';
        const wantParent = body.parent_id !== undefined;

        if (!wantName && !wantParent) return Response.json({ ok: true });

        await client.query('BEGIN');

        const cur = await client.query(
            'SELECT id, parent_id, level FROM struktur_organisasi WHERE id::text = $1',
            [id]
        );
        if (!cur.rowCount) {
            await client.query('ROLLBACK');
            return Response.json({ error: 'Not found' }, { status: 404 });
        }
        const oldLevel: number = Number(cur.rows[0].level);

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (wantName) { fields.push(`name = $${idx++}`); values.push(body.name); }
        let newLevel = oldLevel;

        if (wantParent) {
            const parent_id = body.parent_id ?? null;
            fields.push(`parent_id = $${idx++}`); values.push(parent_id);

            if (parent_id) {
                const p = await client.query('SELECT level FROM struktur_organisasi WHERE id::text = $1', [parent_id]);
                newLevel = p.rowCount ? Number(p.rows[0].level) + 1 : 0;
            } else {
                newLevel = 0;
            }
            fields.push(`level = $${idx++}`); values.push(newLevel);
        }

        values.push(id);
        const sql = `UPDATE struktur_organisasi SET ${fields.join(', ')}, updated_at = now() WHERE id::text = $${idx}`;
        await client.query(sql, values);

        if (wantParent) {
            const delta = newLevel - oldLevel;
            if (delta !== 0) {
                await client.query(
                    `
                        WITH RECURSIVE subtree AS (
                            SELECT id, level FROM struktur_organisasi WHERE id::text = $1
                        UNION ALL
                        SELECT c.id, c.level
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id
                            )
                        UPDATE struktur_organisasi u
                        SET level = u.level + $2,
                            updated_at = now()
                            FROM subtree s
                        WHERE u.id = s.id
                    `,
                    [id, delta]
                );
            }
        }

        await client.query('COMMIT');
        return Response.json({ ok: true });
    } catch (e: any) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error(e);
        return Response.json({ error: 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}

// DELETE /api/struktur-organisasi/node/:id
export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }        // 👈 params sebagai Promise
) {
    try {
        const { id } = await ctx.params;              // 👈 await params

        const result = await pool.query(
            `
                WITH RECURSIVE subtree AS (
                    SELECT id FROM struktur_organisasi WHERE id::text = $1
                UNION ALL
                SELECT c.id
                FROM struktur_organisasi c
                         JOIN subtree s ON c.parent_id = s.id
                    )
                DELETE FROM struktur_organisasi u
                    USING subtree s
                WHERE u.id = s.id
            `,
            [id]
        );

        if (!result.rowCount) {
            return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
        }
        return Response.json({ ok: true, deleted: result.rowCount });
    } catch (e: any) {
        console.error('DELETE failed', e?.message || e);
        return Response.json({ ok: false, error: 'Delete failed' }, { status: 500 });
    }
}
