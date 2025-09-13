// app/api/anjab/[id]/pdf/route.ts
import {NextRequest, NextResponse} from "next/server";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {buildAnjabHtml} from "@/lib/anjab-pdf-template";
import {getUserFromReq} from "@/lib/auth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        // 🔑 pastikan user login (boleh role "user" maupun "admin")
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const {id} = await ctx.params;
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        // ✅ generate HTML → PDF
        const html = buildAnjabHtml(data);
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.setContent(html, {waitUntil: "networkidle0"});

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
        });

        await browser.close();

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="Anjab ${data.nama_jabatan}.pdf"`,
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Content-Length": String(pdfBuffer.length),
            },
        });
    } catch (err) {
        console.error("[anjab/pdf][GET] error:", err);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
