import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Nama risiko wajib diisi.");
const TextOptional = z.union([z.string(), z.number()]).transform(v => String(v).trim());

const PatchSchema = z.object({
    nama_risiko: TextRequired.optional(),
    penyebab: TextOptional.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_risiko: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_risiko} = await ctx.params; // id = jabatan_id (UUID), id_risiko = SERIAL
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_risiko)) {
            return NextResponse.json({error: "id_risiko harus integer > 0"}, {status: 400});
        }
        const rid = Number(id_risiko);
        if (!(rid > 0)) return NextResponse.json({error: "id_risiko harus > 0"}, {status: 400});

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});

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
                   WHERE jabatan_id = $${fields.length + 1}::uuid
                 AND id = $${fields.length + 2}:: int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, nama_risiko, penyebab, created_at, updated_at
             FROM risiko_bahaya
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, rid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_risiko harus int"}, {status: 400});
        }
        console.error("[risiko-bahaya][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_risiko: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_risiko} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_risiko)) {
            return NextResponse.json({error: "id_risiko harus integer > 0"}, {status: 400});
        }
        const rid = Number(id_risiko);
        if (!(rid > 0)) return NextResponse.json({error: "id_risiko harus > 0"}, {status: 400});

        const del = await pool.query(
            `DELETE FROM risiko_bahaya
       WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, rid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_risiko harus int"}, {status: 400});
        }
        console.error("[risiko-bahaya][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
