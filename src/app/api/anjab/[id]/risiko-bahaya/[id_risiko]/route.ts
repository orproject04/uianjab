import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Nama risiko wajib diisi.");

const TextOptional = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim());

const PatchSchema = z.object({
    nama_risiko: TextRequired.optional(),
    penyebab: TextOptional.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_risiko: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_risiko} = await ctx.params;
        const rid = Number(id_risiko);
        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.nama_risiko !== undefined) {
            fields.push(`nama_risiko=$${fields.length + 1}`);
            values.push(p.data.nama_risiko);
        }
        if (p.data.penyebab !== undefined) {
            fields.push(`penyebab=$${fields.length + 1}`);
            values.push(p.data.penyebab);
        }

        if (!fields.length) return NextResponse.json({ok: true});

        values.push(id, rid);
        const q = `UPDATE risiko_bahaya
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE id_jabatan = $${fields.length + 1}
                     AND id_risiko = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id_risiko, id_jabatan, nama_risiko, penyebab, created_at, updated_at
             FROM risiko_bahaya
             WHERE id_jabatan = $1
               AND id_risiko = $2`,
            [id, rid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e) {
        console.error("[risiko-bahaya][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_risiko: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_risiko} = await ctx.params;
        const rid = Number(id_risiko);
        const del = await pool.query(
            `DELETE
             FROM risiko_bahaya
             WHERE id_jabatan = $1
               AND id_risiko = $2`,
            [id, rid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});
        return NextResponse.json({ok: true});
    } catch (e) {
        console.error("[risiko-bahaya][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
