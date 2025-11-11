import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

/** ===== Validators ===== */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

/** ===== Cek jabatan ===== */
async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

/** ===== HK encode/decode helpers (sama seperti file utama) ===== */
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
            /* fallthrough */
        }
    }
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
        if (!normalized.text) return null;
        return JSON.stringify(normalized);
    }
    return null;
}

/** ===== Zod (PATCH) ===== */
const HKNodeSchema: z.ZodType<HKNode> = z.object({
    text: z.string(),
    children: z.lazy(() => z.array(HKNodeSchema)).default([]),
});
const HKArrayAccept = z.array(z.union([z.string(), z.number(), HKNodeSchema])).optional();

const SatuanArray = z
    .array(z.union([z.string(), z.number()]))
    .transform((arr) =>
        arr.map((v) => String(v).trim()).filter((s) => s.length > 0)
    )
    .optional();

const PatchSchema = z.object({
    hasil_kerja: HKArrayAccept,
    satuan_hasil: SatuanArray,
});

/** ===== PATCH ===== */
export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; id_hasil: string }> }
) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                { error: "Forbidden, Anda tidak berhak mengakses fitur ini" },
                { status: 403 }
            );
        }
        const { id, id_hasil } = await ctx.params;

        if (!isUuid(id) || !isIntId(id_hasil)) {
            return NextResponse.json(
                { error: "Invalid, id harus UUID, id_hasil harus angka" },
                { status: 400 }
            );
        }
        const hid = Number(id_hasil);

        if (!(await jabatanExists(id))) {
            return NextResponse.json(
                { error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" },
                { status: 404 }
            );
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

        if (p.data.hasil_kerja !== undefined) {
            const enc = (p.data.hasil_kerja || [])
                .map(encodeNodeToDb)
                .filter((s): s is string => typeof s === "string" && s.length > 0);
            fields.push(`hasil_kerja=$${fields.length + 1}`);
            values.push(enc);
        }
        if (p.data.satuan_hasil !== undefined) {
            fields.push(`satuan_hasil=$${fields.length + 1}`);
            values.push(p.data.satuan_hasil || []);
        }
        if (!fields.length) return NextResponse.json({ ok: true });

        values.push(id, hid);
        const q = `UPDATE hasil_kerja
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${fields.length + 1}::uuid
             AND id = $${fields.length + 2}::int`;
        const up = await pool.query(q, values);
        if (!up.rowCount) {
            return NextResponse.json(
                { error: "Not Found, (Hasil Kerja tidak ditemukan)" },
                { status: 404 }
            );
        }

        const { rows } = await pool.query(
            `SELECT id, jabatan_id, hasil_kerja, satuan_hasil
             FROM hasil_kerja
             WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, hid]
        );

        const row = rows[0];
        const decoded = (Array.isArray(row?.hasil_kerja) ? row.hasil_kerja : [])
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
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        console.error("[hasil-kerja][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

/** ===== DELETE ===== */
export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; id_hasil: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                { error: "Forbidden, Anda tidak berhak mengakses fitur ini" },
                { status: 403 }
            );
        }
        const { id, id_hasil } = await ctx.params;
        if (!isUuid(id) || !isIntId(id_hasil)) {
            return NextResponse.json(
                { error: "Invalid, id harus UUID, id_hasil harus angka" },
                { status: 400 }
            );
        }
        const hid = Number(id_hasil);

        if (!(await jabatanExists(id))) {
            return NextResponse.json(
                { error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" },
                { status: 404 }
            );
        }

        const del = await pool.query(
            `DELETE FROM hasil_kerja
             WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, hid]
        );
        if (!del.rowCount) {
            return NextResponse.json(
                { error: "Not Found, (Hasil Kerja tidak ditemukan)" },
                { status: 404 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        console.error("[hasil-kerja][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
