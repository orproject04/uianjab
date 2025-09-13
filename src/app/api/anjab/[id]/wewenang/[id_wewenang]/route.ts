import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

const TextField = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Uraian wewenang wajib diisi.");
const PatchSchema = z.object({uraian_wewenang: TextField.optional()});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_wewenang: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_wewenang} = await ctx.params; // id = jabatan_id (UUID), id_wewenang = SERIAL
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_wewenang)) {
            return NextResponse.json({error: "id_wewenang harus integer > 0"}, {status: 400});
        }
        const wid = Number(id_wewenang);
        if (!(wid > 0)) {
            return NextResponse.json({error: "id_wewenang harus > 0"}, {status: 400});
        }

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
                   WHERE jabatan_id = $${fields.length + 1}::uuid
                 AND id = $${fields.length + 2}:: int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, uraian_wewenang, created_at, updated_at
             FROM wewenang
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, wid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_wewenang harus int"}, {status: 400});
        }
        console.error("[wewenang][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_wewenang: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_wewenang} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_wewenang)) {
            return NextResponse.json({error: "id_wewenang harus integer > 0"}, {status: 400});
        }
        const wid = Number(id_wewenang);
        if (!(wid > 0)) {
            return NextResponse.json({error: "id_wewenang harus > 0"}, {status: 400});
        }

        const del = await pool.query(
            `DELETE
             FROM wewenang
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, wid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_wewenang harus int"}, {status: 400});
        }
        console.error("[wewenang][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
