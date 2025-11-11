import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

/** ======= Helpers (no-cache) ======= */
const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

/** ======= Validators ======= */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

/** ======= DB existence ======= */
async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

/** ======= Hasil Kerja Node encode/decode =======
 * DB menyimpan text[]:
 *  - bila item object {text, children} -> JSON.stringify(item)
 *  - bila item string/number -> String(item)
 * API menerima & mengembalikan array node bertipe:
 *  - {text: string, children: Node[]} | string | number
 */
type HKNode = { text: string; children: HKNode[] };

function isLikelyJsonObject(s: string): boolean {
    const t = s.trim();
    return t.startsWith("{") || t.startsWith("[");
}

function decodeNodeFromDb(s: string): HKNode | null {
    const raw = (s ?? "").trim();
    if (!raw) return null;
    if (isLikelyJsonObject(raw)) {
        try {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object" && typeof obj.text === "string") {
                const kids = Array.isArray(obj.children) ? obj.children : [];
                return {
                    text: obj.text,
                    children: kids
                        .map((c: any) =>
                            typeof c?.text === "string"
                                ? { text: String(c.text), children: Array.isArray(c.children) ? c.children : [] }
                                : null
                        )
                        .filter(Boolean) as HKNode[],
                };
            }
        } catch {
            /* fallthrough to text */
        }
    }
    // fallback: string biasa
    return { text: raw, children: [] };
}

function encodeNodeToDb(item: unknown): string | null {
    if (item == null) return null;
    if (typeof item === "string" || typeof item === "number") {
        const s = String(item).trim();
        return s.length ? s : null;
    }
    if (typeof item === "object") {
        const obj = item as any;
        const text = typeof obj?.text === "string" ? obj.text.trim() : "";
        const children = Array.isArray(obj?.children) ? obj.children : [];
        const normalized: HKNode = {
            text,
            children: children
                .map((c) =>
                    typeof c?.text === "string"
                        ? { text: String(c.text), children: Array.isArray(c.children) ? c.children : [] }
                        : null
                )
                .filter(Boolean) as HKNode[],
        };
        if (!normalized.text) return null; // kosong → drop
        return JSON.stringify(normalized);
    }
    // tipe lain -> drop
    return null;
}

/** ======= Zod Schemas (menerima string|number|node) ======= */
const HKNodeSchema: z.ZodType<HKNode> = z.object({
    text: z.string(),
    children: z.lazy(() => z.array(HKNodeSchema)).default([]),
});

// Array hasil_kerja boleh berupa campuran:
//  - string / number
//  - object {text, children}
const HKArrayAccept = z
    .array(z.union([z.string(), z.number(), HKNodeSchema]))
    .default([]);

// satuan_hasil tetap flat string[]
const SatuanArray = z
    .array(z.union([z.string(), z.number()]))
    .transform((arr) =>
        arr.map((v) => String(v).trim()).filter((s) => s.length > 0)
    )
    .default([]);

const ItemSchema = z.object({
    hasil_kerja: HKArrayAccept,
    satuan_hasil: SatuanArray,
});

const ReplaceAllSchema = z.array(ItemSchema);

/** ======= GET (list) ======= */
export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user)
            return NextResponse.json(
                { error: "Unauthorized, Silakan login kembali" },
                { status: 401 }
            );

        const { id } = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (!(await jabatanExists(id))) {
            return NextResponse.json(
                { error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" },
                { status: 404 }
            );
        }

        const { rows } = await pool.query(
            `SELECT id, jabatan_id, hasil_kerja, satuan_hasil
       FROM hasil_kerja
       WHERE jabatan_id = $1::uuid
       ORDER BY id ASC`,
            [id]
        );

        const data = rows.map((r: any) => {
            const hkArr: string[] = Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [];
            const decoded: HKNode[] = hkArr
                .map((s) => decodeNodeFromDb(String(s)))
                .filter(Boolean) as HKNode[];
            const satuan: string[] = Array.isArray(r.satuan_hasil) ? r.satuan_hasil : [];
            return {
                id: r.id,
                jabatan_id: r.jabatan_id,
                hasil_kerja: decoded,
                satuan_hasil: satuan,
            };
        });

        return NextResponse.json(data, { headers: noCache });
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        console.error("[hasil-kerja][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

/** ======= POST (create 1 baris) ======= */
export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                { error: "Forbidden, Anda tidak berhak mengakses fitur ini" },
                { status: 403 }
            );
        }
        const { id } = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (!(await jabatanExists(id))) {
            return NextResponse.json(
                { error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" },
                { status: 404 }
            );
        }

        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: p.error.flatten() },
                { status: 400 }
            );
        }

        // Encode hasil_kerja -> text[]
        const encodedHK = (p.data.hasil_kerja || [])
            .map(encodeNodeToDb)
            .filter((s): s is string => typeof s === "string" && s.length > 0);

        const satuan = p.data.satuan_hasil || [];

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO hasil_kerja
         (jabatan_id, hasil_kerja, satuan_hasil, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, NOW(), NOW())
       RETURNING id, jabatan_id, hasil_kerja, satuan_hasil`,
            [id, encodedHK, satuan]
        );
        await client.query("COMMIT");

        // Kembalikan dalam bentuk decoded (node)
        const row = ins.rows[0];
        const decoded = (Array.isArray(row.hasil_kerja) ? row.hasil_kerja : [])
            .map((s: any) => decodeNodeFromDb(String(s)))
            .filter(Boolean);

        return NextResponse.json({
            ok: true,
            data: {
                id: row.id,
                jabatan_id: row.jabatan_id,
                hasil_kerja: decoded,
                satuan_hasil: row.satuan_hasil ?? [],
            },
        });
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (e?.code === "23503") {
            return NextResponse.json({ error: "jabatan_id tidak ditemukan" }, { status: 400 });
        }
        console.error("[hasil-kerja][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

/** ======= PUT (replace-all) ======= */
export async function PUT(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                { error: "Forbidden, Anda tidak berhak mengakses fitur ini" },
                { status: 403 }
            );
        }
        const { id } = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (!(await jabatanExists(id))) {
            return NextResponse.json(
                { error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" },
                { status: 404 }
            );
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: p.error.flatten() },
                { status: 400 }
            );
        }

        await client.query("BEGIN");
        await client.query(
            `DELETE FROM hasil_kerja WHERE jabatan_id = $1::uuid`,
            [id]
        );

        const inserted: Array<{
            id: number;
            jabatan_id: string;
            hasil_kerja: HKNode[];
            satuan_hasil: string[];
        }> = [];

        for (const it of p.data) {
            const encHK = (it.hasil_kerja || [])
                .map(encodeNodeToDb)
                .filter((s): s is string => typeof s === "string" && s.length > 0);

            const res = await client.query(
                `INSERT INTO hasil_kerja
           (jabatan_id, hasil_kerja, satuan_hasil, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, NOW(), NOW())
         RETURNING id, jabatan_id, hasil_kerja, satuan_hasil`,
                [id, encHK, it.satuan_hasil || []]
            );

            const row = res.rows[0];
            const decoded = (Array.isArray(row.hasil_kerja) ? row.hasil_kerja : [])
                .map((s: any) => decodeNodeFromDb(String(s)))
                .filter(Boolean) as HKNode[];

            inserted.push({
                id: row.id,
                jabatan_id: row.jabatan_id,
                hasil_kerja: decoded,
                satuan_hasil: row.satuan_hasil ?? [],
            });
        }

        await client.query("COMMIT");

        return NextResponse.json({ ok: true, data: inserted });
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (e?.code === "23503") {
            return NextResponse.json({ error: "jabatan_id tidak ditemukan" }, { status: 400 });
        }
        console.error("[hasil-kerja][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}
