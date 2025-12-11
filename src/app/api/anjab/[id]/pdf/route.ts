// app/api/anjab/[id]/pdf/route.ts
import {NextRequest, NextResponse} from "next/server";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {buildAnjabHtml} from "@/lib/anjab-pdf-template";
import {getUserFromReq} from "@/lib/auth";
import puppeteer, {Browser} from "puppeteer";
import fs from "fs/promises";
import path from "path";

// Singleton browser (hemat waktu launch)
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
        browserPromise = puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
    }
    return browserPromise;
}

// Folder cache
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

        // generate html → pdf
        const html = buildAnjabHtml(data);
        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on("request", (r) => {
            // boleh blok image saja kalau mau lebih cepat
            if (r.resourceType() === "image") r.abort();
            else r.continue();
        });

        await page.setContent(html, {waitUntil: "load"});
        const pdfBuffer = await page.pdf({format: "A4", printBackground: true});
        await page.close();

        // simpan ke cache
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
