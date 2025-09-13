import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

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

const ItemSchema = z.object({
    bahan_kerja: cleanStrArr.default([]),
    penggunaan_dalam_tugas: cleanStrArr.default([]),
});

const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { id } = await ctx.params; // jabatan_id (UUID)

        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
        }

        const { rows } = await pool.query(
            `SELECT id, jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at
       FROM bahan_kerja
       WHERE jabatan_id = $1
       ORDER BY id ASC`,
            [id]
        );

        // Pastikan array selalu array
        const data = rows.map((r: any) => ({
            ...r,
            bahan_kerja: Array.isArray(r.bahan_kerja) ? r.bahan_kerja : [],
            penggunaan_dalam_tugas: Array.isArray(r.penggunaan_dalam_tugas)
                ? r.penggunaan_dalam_tugas
                : [],
        }));
        return NextResponse.json(data, { headers: noCache });
    } catch (e) {
        console.error("[bahan-kerja][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await ctx.params; // jabatan_id (UUID)
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
        }

        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: p.error.flatten() },
                { status: 400 }
            );
        }
        const { bahan_kerja, penggunaan_dalam_tugas } = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO bahan_kerja
             (jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
                 RETURNING id, jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at`,
            [id, bahan_kerja, penggunaan_dalam_tugas]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, data: ins.rows[0] });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[bahan-kerja][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

// (Opsional) Replace-all
export async function PUT(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await ctx.params; // jabatan_id (UUID)
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
        }

        const json = await req.json().catch(() => []);
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: p.error.flatten() },
                { status: 400 }
            );
        }

        await client.query("BEGIN");
        await client.query(
            `DELETE FROM bahan_kerja WHERE jabatan_id = $1`,
            [id]
        );

        for (const it of p.data) {
            await client.query(
                `INSERT INTO bahan_kerja
                 (jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [id, it.bahan_kerja ?? [], it.penggunaan_dalam_tugas ?? []]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[bahan-kerja][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}
