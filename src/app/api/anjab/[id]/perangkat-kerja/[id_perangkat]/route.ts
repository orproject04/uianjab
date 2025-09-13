import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// validators
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

// cleaner
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform((arr) => arr.map((v) => String(v).trim()).filter((s) => s.length > 0));

const PatchSchema = z.object({
    perangkat_kerja: cleanStrArr.optional(),
    penggunaan_untuk_tugas: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_perangkat: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_perangkat} = await ctx.params; // id = jabatan_id (UUID), id_perangkat = SERIAL di URL
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_perangkat)) {
            return NextResponse.json({error: "id_perangkat harus integer > 0"}, {status: 400});
        }
        const pid = Number(id_perangkat);
        if (!(pid > 0)) return NextResponse.json({error: "id_perangkat harus > 0"}, {status: 400});

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.perangkat_kerja !== undefined) {
            fields.push(`perangkat_kerja=$${fields.length + 1}`);
            values.push(p.data.perangkat_kerja);
        }
        if (p.data.penggunaan_untuk_tugas !== undefined) {
            fields.push(`penggunaan_untuk_tugas=$${fields.length + 1}`);
            values.push(p.data.penggunaan_untuk_tugas);
        }
        if (!fields.length) return NextResponse.json({ok: true});

        // WHERE pakai kolom tabel apa adanya: jabatan_id & id
        values.push(id, pid);
        const q = `UPDATE perangkat_kerja
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}::uuid
                 AND id = $${fields.length + 2}:: int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, perangkat_kerja, penggunaan_untuk_tugas, created_at, updated_at
             FROM perangkat_kerja
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, pid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_perangkat harus int"}, {status: 400});
        }
        console.error("[perangkat-kerja][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_perangkat: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_perangkat} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_perangkat)) {
            return NextResponse.json({error: "id_perangkat harus integer > 0"}, {status: 400});
        }
        const pid = Number(id_perangkat);
        if (!(pid > 0)) return NextResponse.json({error: "id_perangkat harus > 0"}, {status: 400});

        const del = await pool.query(
            `DELETE FROM perangkat_kerja
       WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, pid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_perangkat harus int"}, {status: 400});
        }
        console.error("[perangkat-kerja][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
