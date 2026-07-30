// app/api/anjab/[id]/pdf/route.ts
import {NextRequest, NextResponse} from "next/server";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import { generateAnjabDocx } from "@/lib/anjab-docx-generator";
import { getUserFromReq } from "@/lib/auth";
import { convertDocxBufferToPdfBuffer } from "@/lib/pdf-converter";
import fs from "fs/promises";
import path from "path";
const CACHE_DIR = path.join(process.cwd(), "storage", "pdf-cache");

async function ensureCacheDir() {
    await fs.mkdir(CACHE_DIR, {recursive: true});
}

// Helper: cek UUID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s: string) {
    return UUID_RE.test(s);
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        // 🔐 pastikan user login
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }

        const {id} = await ctx.params;
        const isMaster = isUuid(id); // Deteksi apakah master (UUID) atau slug (path)
        
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        await ensureCacheDir();

        // ✅ pastikan updated_at valid
        let updatedAtRaw = (data as any).updated_at;
        let updatedAt: Date;
        if (updatedAtRaw) {
            updatedAt = new Date(updatedAtRaw);
            if (isNaN(updatedAt.getTime())) {
                updatedAt = new Date();
            }
        } else {
            updatedAt = new Date();
        }

        const safeIso = updatedAt.toISOString().replace(/[:.]/g, "-");
        // Tambahkan prefix "master-" atau "slug-" untuk membedakan cache
        const cachePrefix = isMaster ? "master" : "slug";
        const cacheFile = `${cachePrefix}-${data.id}-${safeIso}.pdf`;
        const cachePath = path.join(CACHE_DIR, cacheFile);

        // coba load dari cache
        try {
            const pdfBuffer = await fs.readFile(cachePath);
            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename="Anjab ${data.nama_jabatan}.pdf"`,
                },
            });
        } catch {
            // cache miss → lanjut generate
        }

        // generate docx → pdf
        const docxBuffer = generateAnjabDocx(data);
        
        let pdfBuffer: Buffer;
        try {
            pdfBuffer = await convertDocxBufferToPdfBuffer(docxBuffer, data.id);
        } catch (error: any) {
            return NextResponse.json({error: error.message || "Gagal konversi ke PDF"}, {status: 500});
        }
        
        // simpan ke cache aslinya
        await fs.writeFile(cachePath, pdfBuffer);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="Anjab ${data.nama_jabatan}.pdf"`,
            },
        });
    } catch (err) {
        console.error("[anjab/pdf][GET] error:", err);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
