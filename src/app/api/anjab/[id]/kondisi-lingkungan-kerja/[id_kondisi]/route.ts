import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

const TextRequired = z.union([z.string(), z.number()]).transform(v => String(v).trim()).refine(s => s.length > 0, "Aspek wajib diisi.");
const TextOptional  = z.union([z.string(), z.number()]).transform(v => String(v).trim());

const PatchSchema = z.object({
    aspek: TextRequired.optional(),
    faktor: TextOptional.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_kondisi: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id, id_kondisi } = await ctx.params; // id = jabatan_id
        const kid = Number(id_kondisi);
        if (!Number.isFinite(kid) || kid <= 0) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.aspek !== undefined) {
            fields.push(`aspek=$${fields.length + 1}`);
            values.push(p.data.aspek);
        }
        if (p.data.faktor !== undefined) {
            fields.push(`faktor=$${fields.length + 1}`);
            values.push(p.data.faktor);
        }
        if (!fields.length) return NextResponse.json({ ok: true });

        values.push(id, kid);
        const q = `UPDATE kondisi_lingkungan_kerja
                   SET ${fields.join(", ")}, updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}
                     AND id = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const { rows } = await pool.query(
            `SELECT id, jabatan_id, aspek, faktor, created_at, updated_at
             FROM kondisi_lingkungan_kerja
             WHERE jabatan_id = $1 AND id = $2`,
            [id, kid]
        );
        return NextResponse.json({ ok: true, data: rows[0] });
    } catch (e) {
        console.error("[kondisi-lingkungan-kerja][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_kondisi: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id, id_kondisi } = await ctx.params;
        const kid = Number(id_kondisi);
        if (!Number.isFinite(kid) || kid <= 0) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const del = await pool.query(
            `DELETE FROM kondisi_lingkungan_kerja
             WHERE jabatan_id = $1 AND id = $2`,
            [id, kid]
        );
        if (!del.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[kondisi-lingkungan-kerja][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
