// app/api/anjab/[id]/pdf/route.ts
import { NextRequest } from "next/server";
import { getAnjabById } from "@/lib/anjab-queries";
import { buildAnjabHtml } from "@/lib/anjab-pdf-template";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;

        const data = await getAnjabById(id);
        if (!data) return Response.json({ error: "Data Tidak Ditemukan" }, { status: 404 });

        const html = buildAnjabHtml(data);
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
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
        console.error("PDF error:", err);
        return Response.json({ error: "General Error" }, { status: 500 });
    }
}
