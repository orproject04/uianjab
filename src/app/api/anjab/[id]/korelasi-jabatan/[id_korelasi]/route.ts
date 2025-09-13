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
    .refine(s => s.length > 0, "Field wajib diisi.");
const TextOptional = z.union([z.string(), z.number()]).transform(v => String(v).trim());
const cleanStrArr = z.array(z.union([z.string(), z.number()])).transform(arr => arr.map(v => String(v).trim()).filter(s => s.length > 0));

const PatchSchema = z.object({
    jabatan_terkait: TextRequired.optional(),
    unit_kerja_instansi: TextOptional.optional(),
    dalam_hal: cleanStrArr.optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_korelasi: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_korelasi} = await ctx.params; // id = jabatan_id (UUID), id_korelasi = SERIAL
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_korelasi)) {
            return NextResponse.json({error: "id_korelasi harus integer > 0"}, {status: 400});
        }
        const kid = Number(id_korelasi);
        if (!(kid > 0)) {
            return NextResponse.json({error: "id_korelasi harus > 0"}, {status: 400});
        }

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.jabatan_terkait !== undefined) {
            fields.push(`jabatan_terkait=$${fields.length + 1}`);
            values.push(p.data.jabatan_terkait);
        }
        if (p.data.unit_kerja_instansi !== undefined) {
            fields.push(`unit_kerja_instansi=$${fields.length + 1}`);
            values.push(p.data.unit_kerja_instansi);
        }
        if (p.data.dalam_hal !== undefined) {
            fields.push(`dalam_hal=$${fields.length + 1}`);
            values.push(p.data.dalam_hal);
        }
        if (!fields.length) return NextResponse.json({ok: true});

        values.push(id, kid);
        const q = `UPDATE korelasi_jabatan
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}::uuid
                 AND id = $${fields.length + 2}:: int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at
             FROM korelasi_jabatan
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, kid]
        );
        const r = rows[0];
        r.dalam_hal = Array.isArray(r.dalam_hal) ? r.dalam_hal : [];
        return NextResponse.json({ok: true, data: r});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_korelasi harus int"}, {status: 400});
        }
        console.error("[korelasi-jabatan][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_korelasi: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({error: "Forbidden"}, {status: 403});

        const {id, id_korelasi} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (!isIntId(id_korelasi)) {
            return NextResponse.json({error: "id_korelasi harus integer > 0"}, {status: 400});
        }
        const kid = Number(id_korelasi);
        if (!(kid > 0)) {
            return NextResponse.json({error: "id_korelasi harus > 0"}, {status: 400});
        }

        const del = await pool.query(
            `DELETE FROM korelasi_jabatan
       WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, kid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID / id_korelasi harus int"}, {status: 400});
        }
        console.error("[korelasi-jabatan][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
