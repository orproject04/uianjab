import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

// Validasi UUID sederhana
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Array cleaner: coerce -> trim -> filter empty
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform((arr) =>
        arr
            .map((v) => String(v).trim())
            .filter((s) => s.length > 0)
    );

const PatchSchema = z.object({
    bahan_kerja: cleanStrArr.optional(),
    penggunaan_dalam_tugas: cleanStrArr.optional(),
});

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; id_bahan: string }> }
) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id, id_bahan } = await ctx.params; // id = jabatan_id (UUID), id_bahan = SERIAL
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
        }
        const bid = Number(id_bahan);
        if (!Number.isFinite(bid) || bid <= 0) {
            return NextResponse.json({ error: "id harus number > 0" }, { status: 400 });
        }

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: p.error.flatten() },
                { status: 400 }
            );
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

        if (!fields.length) return NextResponse.json({ ok: true });

        values.push(id, bid);
        const q = `UPDATE bahan_kerja
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}
                     AND id = $${fields.length + 2}`;
        const up = await pool.query(q, values);
        if (!up.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        const { rows } = await pool.query(
            `SELECT id, jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at
             FROM bahan_kerja
             WHERE jabatan_id = $1
               AND id = $2`,
            [id, bid]
        );
        return NextResponse.json({ ok: true, data: rows[0] });
    } catch (e) {
        console.error("[bahan-kerja][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; id_bahan: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id, id_bahan } = await ctx.params; // id = jabatan_id (UUID), id_bahan = SERIAL
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
        }
        const bid = Number(id_bahan);
        if (!Number.isFinite(bid) || bid <= 0) {
            return NextResponse.json({ error: "id harus number > 0" }, { status: 400 });
        }

        const del = await pool.query(
            `DELETE FROM bahan_kerja
             WHERE jabatan_id = $1
               AND id = $2`,
            [id, bid]
        );
        if (!del.rowCount) return NextResponse.json({ error: "Not Found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[bahan-kerja][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
