import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// Array cleaner: coerce -> trim -> filter empty
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr =>
        arr
            .map(v => String(v).trim())
            .filter(s => s.length > 0)
    );

const PatchSchema = z.object({
    bahan_kerja: cleanStrArr.optional(),
    penggunaan_dalam_tugas: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_bahan: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_bahan} = await ctx.params;
        const bid = Number(id_bahan);
        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.bahan_kerja !== undefined) {
            fields.push(`bahan_kerja=$${fields.length + 1}`);
            values.push(p.data.bahan_kerja);
        }
        if (p.data.penggunaan_dalam_tugas !== undefined) {
            fields.push(`penggunaan_dalam_tugas=$${fields.length + 1}`);
            values.push(p.data.penggunaan_dalam_tugas);
        }

        if (!fields.length) return NextResponse.json({ok: true});

        values.push(id, bid);
        const q = `UPDATE bahan_kerja
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE id_jabatan = $${fields.length + 1}
                     AND id_bahan = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id_bahan, id_jabatan, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at
             FROM bahan_kerja
             WHERE id_jabatan = $1
               AND id_bahan = $2`,
            [id, bid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e) {
        console.error("[bahan-kerja][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_bahan: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_bahan} = await ctx.params;
        const bid = Number(id_bahan);
        const del = await pool.query(`DELETE
                                      FROM bahan_kerja
                                      WHERE id_jabatan = $1
                                        AND id_bahan = $2`, [id, bid]);
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});
        return NextResponse.json({ok: true});
    } catch (e) {
        console.error("[bahan-kerja][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
