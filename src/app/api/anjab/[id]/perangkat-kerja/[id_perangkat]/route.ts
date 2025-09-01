import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

// Array cleaner: coerce -> trim -> filter empty
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr =>
        arr
            .map(v => String(v).trim())
            .filter(s => s.length > 0)
    );

const PatchSchema = z.object({
    perangkat_kerja: cleanStrArr.optional(),
    penggunaan_untuk_tugas: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_perangkat: string }> }) {
    try {
        const { id, id_perangkat } = await ctx.params;
        const pid = Number(id_perangkat);
        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.perangkat_kerja !== undefined)        { fields.push(`perangkat_kerja=$${fields.length + 1}`); values.push(p.data.perangkat_kerja); }
        if (p.data.penggunaan_untuk_tugas !== undefined) { fields.push(`penggunaan_untuk_tugas=$${fields.length + 1}`); values.push(p.data.penggunaan_untuk_tugas); }

        if (!fields.length) return NextResponse.json({ ok: true });

        values.push(id, pid);
        const q = `UPDATE perangkat_kerja SET ${fields.join(", ")}, updated_at=NOW()
               WHERE id_jabatan=$${fields.length + 1} AND id_perangkat=$${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const { rows } = await pool.query(
            `SELECT id_perangkat, id_jabatan, perangkat_kerja, penggunaan_untuk_tugas, created_at, updated_at
       FROM perangkat_kerja WHERE id_jabatan=$1 AND id_perangkat=$2`,
            [id, pid]
        );
        return NextResponse.json({ ok: true, data: rows[0] });
    } catch (e) {
        console.error("[perangkat-kerja][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_perangkat: string }> }) {
    try {
        const { id, id_perangkat } = await ctx.params;
        const pid = Number(id_perangkat);
        const del = await pool.query(`DELETE FROM perangkat_kerja WHERE id_jabatan=$1 AND id_perangkat=$2`, [id, pid]);
        if (!del.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[perangkat-kerja][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
