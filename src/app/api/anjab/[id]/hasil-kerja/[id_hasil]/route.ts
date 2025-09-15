// src/app/api/anjab/[id]/hasil-kerja/[id_hasil]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// UUID & INT validators
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

// Cek apakah jabatan ada
async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

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
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }
        const {id, id_hasil} = await ctx.params; // id = jabatan_id (UUID), id_hasil = hasil_kerja.id (SERIAL int)

        if (!isUuid(id) || !isIntId(id_hasil)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_hasil harus angka"}, {status: 400});
        }
        const hid = Number(id_hasil);

        // ✅ Pastikan jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
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
                   WHERE jabatan_id = $${fields.length + 1}::uuid
                 AND id = $${fields.length + 2}:: int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({error: "Not Found, (Hasil Kerja tidak ditemukan)"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, hasil_kerja, satuan_hasil
             FROM hasil_kerja
             WHERE jabatan_id = $1::uuid
         AND id = $2:: int`,
            [id, hid]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("[hasil-kerja][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_hasil: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }
        const {id, id_hasil} = await ctx.params;
        if (!isUuid(id) || !isIntId(id_hasil)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_hasil harus angka"}, {status: 400});
        }
        const hid = Number(id_hasil);

        // ✅ Pastikan jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const del = await pool.query(
            `DELETE
             FROM hasil_kerja
             WHERE jabatan_id = $1::uuid
         AND id = $2:: int`,
            [id, hid]
        );
        if (!del.rowCount) return NextResponse.json({error: "Not Found, (Hasil Kerja tidak ditemukan)"}, {status: 404});

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("[hasil-kerja][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
