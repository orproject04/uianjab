import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Field wajib diisi.");

const TextOptional = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim());

const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr => arr.map(v => String(v).trim()).filter(s => s.length > 0));

const PatchSchema = z.object({
    jabatan_terkait: TextRequired.optional(),
    unit_kerja_instansi: TextOptional.optional(),
    dalam_hal: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_korelasi: string }> }) {
    try {
        const { id, id_korelasi } = await ctx.params;
        const kid = Number(id_korelasi);
        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.jabatan_terkait !== undefined) {
            fields.push(`jabatan_terkait=$${fields.length + 1}`); values.push(p.data.jabatan_terkait);
        }
        if (p.data.unit_kerja_instansi !== undefined) {
            fields.push(`unit_kerja_instansi=$${fields.length + 1}`); values.push(p.data.unit_kerja_instansi);
        }
        if (p.data.dalam_hal !== undefined) {
            fields.push(`dalam_hal=$${fields.length + 1}`); values.push(p.data.dalam_hal);
        }

        if (!fields.length) return NextResponse.json({ ok: true });

        values.push(id, kid);
        const q = `UPDATE korelasi_jabatan SET ${fields.join(", ")}, updated_at=NOW()
               WHERE id_jabatan=$${fields.length + 1} AND id_korelasi=$${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const { rows } = await pool.query(
            `SELECT id_korelasi, id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at
       FROM korelasi_jabatan WHERE id_jabatan=$1 AND id_korelasi=$2`,
            [id, kid]
        );
        return NextResponse.json({ ok: true, data: rows[0] });
    } catch (e) {
        console.error("[korelasi-jabatan][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_korelasi: string }> }) {
    try {
        const { id, id_korelasi } = await ctx.params;
        const kid = Number(id_korelasi);
        const del = await pool.query(
            `DELETE FROM korelasi_jabatan WHERE id_jabatan=$1 AND id_korelasi=$2`,
            [id, kid]
        );
        if (!del.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[korelasi-jabatan][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
