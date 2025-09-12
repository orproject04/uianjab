import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// Single text cleaner: coerce -> trim -> not empty
const TextField = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Uraian wewenang wajib diisi.");

const PatchSchema = z.object({
    uraian_wewenang: TextField.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_wewenang: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_wewenang} = await ctx.params;
        const wid = Number(id_wewenang);
        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.uraian_wewenang !== undefined) {
            fields.push(`uraian_wewenang=$${fields.length + 1}`);
            values.push(p.data.uraian_wewenang);
        }

        if (!fields.length) return NextResponse.json({ok: true});

        values.push(id, wid);
        const q = `UPDATE wewenang
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE id_jabatan = $${fields.length + 1}
                     AND id_wewenang = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id_wewenang, id_jabatan, uraian_wewenang, created_at, updated_at
             FROM wewenang
             WHERE id_jabatan = $1
               AND id_wewenang = $2`,
            [id, wid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e) {
        console.error("[wewenang][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_wewenang: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_wewenang} = await ctx.params;
        const wid = Number(id_wewenang);
        const del = await pool.query(
            `DELETE
             FROM wewenang
             WHERE id_jabatan = $1
               AND id_wewenang = $2`,
            [id, wid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});
        return NextResponse.json({ok: true});
    } catch (e) {
        console.error("[wewenang][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
