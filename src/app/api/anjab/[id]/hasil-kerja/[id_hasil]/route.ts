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
    hasil_kerja: cleanStrArr.optional(),
    satuan_hasil: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_hasil: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_hasil} = await ctx.params; // id = jabatan_id (UUID), id_hasil = hasil_kerja.id (SERIAL int)

        const hid = Number(id_hasil);
        if (!Number.isFinite(hid)) {
            return NextResponse.json({error: "Invalid id_hasil"}, {status: 400});
        }

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.hasil_kerja !== undefined) {
            fields.push(`hasil_kerja=$${fields.length + 1}`);
            values.push(p.data.hasil_kerja);
        }
        if (p.data.satuan_hasil !== undefined) {
            fields.push(`satuan_hasil=$${fields.length + 1}`);
            values.push(p.data.satuan_hasil);
        }

        if (!fields.length) return NextResponse.json({ok: true});

        values.push(id, hid);
        const q = `UPDATE hasil_kerja
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}
                     AND id = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, hasil_kerja, satuan_hasil, created_at, updated_at
             FROM hasil_kerja
             WHERE jabatan_id = $1
               AND id = $2`,
            [id, hid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e) {
        console.error("[hasil-kerja][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_hasil: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id, id_hasil} = await ctx.params;
        const hid = Number(id_hasil);
        if (!Number.isFinite(hid)) {
            return NextResponse.json({error: "Invalid id_hasil"}, {status: 400});
        }

        const del = await pool.query(
            `DELETE FROM hasil_kerja
             WHERE jabatan_id = $1
               AND id = $2`,
            [id, hid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e) {
        console.error("[hasil-kerja][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
