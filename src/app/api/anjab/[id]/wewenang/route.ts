import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// Single text cleaner: coerce -> trim -> not empty
const TextField = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Uraian wewenang wajib diisi.");

// Body schema
const ItemSchema = z.object({
    uraian_wewenang: TextField,
});

// Replace-all schema (opsional)
const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const {id} = await ctx.params;
        const {rows} = await pool.query(
            `SELECT id_wewenang, id_jabatan, uraian_wewenang, created_at, updated_at
             FROM wewenang
             WHERE id_jabatan = $1
             ORDER BY id_wewenang`,
            [id]
        );
        return NextResponse.json(rows, {headers: noCache});
    } catch (e) {
        console.error("[wewenang][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params;
        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO wewenang
                 (id_jabatan, uraian_wewenang, created_at, updated_at)
             VALUES ($1, $2, NOW(), NOW()) RETURNING id_wewenang, id_jabatan, uraian_wewenang, created_at, updated_at`,
            [id, p.data.uraian_wewenang]
        );
        await client.query("COMMIT");
        return NextResponse.json({ok: true, data: ins.rows[0]});
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[wewenang][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

// (Opsional) Replace-all
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params;
        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        await client.query(`DELETE
                            FROM wewenang
                            WHERE id_jabatan = $1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO wewenang
                     (id_jabatan, uraian_wewenang, created_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())`,
                [id, it.uraian_wewenang]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ok: true});
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[wewenang][PUT]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}
