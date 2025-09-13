import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

const TextRequired = z.union([z.string(), z.number()]).transform(v => String(v).trim()).refine(s => s.length > 0, "Aspek wajib diisi.");
const TextOptional = z.union([z.string(), z.number()]).transform(v => String(v).trim());

const ItemSchema = z.object({
    aspek: TextRequired,
    faktor: TextOptional.optional(),
});
const ReplaceAllSchema = z.array(ItemSchema);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await ctx.params; // jabatan_id
        const { rows } = await pool.query(
            `SELECT id, jabatan_id, aspek, faktor, created_at, updated_at
             FROM kondisi_lingkungan_kerja
             WHERE jabatan_id = $1
             ORDER BY id`,
            [id]
        );
        return NextResponse.json(rows, { headers: noCache });
    } catch (e) {
        console.error("[kondisi-lingkungan-kerja][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await ctx.params; // jabatan_id
        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });

        const { aspek, faktor = "" } = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO kondisi_lingkungan_kerja
                 (jabatan_id, aspek, faktor, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
                 RETURNING id, jabatan_id, aspek, faktor, created_at, updated_at`,
            [id, aspek, faktor]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, data: ins.rows[0] });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[kondisi-lingkungan-kerja][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await ctx.params;
        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });

        await client.query("BEGIN");
        await client.query(`DELETE FROM kondisi_lingkungan_kerja WHERE jabatan_id = $1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO kondisi_lingkungan_kerja
                     (jabatan_id, aspek, faktor, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [id, it.aspek, it.faktor ?? ""]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[kondisi-lingkungan-kerja][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}
