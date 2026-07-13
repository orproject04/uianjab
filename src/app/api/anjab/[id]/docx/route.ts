import {NextRequest, NextResponse} from "next/server";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {buildAnjabHtml} from "@/lib/anjab-pdf-template";
import {getUserFromReq} from "@/lib/auth";

// Tambahkan cache config untuk memastikan rute ini benar-benar tidak di-cache
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

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
        
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        let html = buildAnjabHtml(data, { isWord: true });
        
        // Tambahkan meta tag khusus untuk Word agar terbaca baik di MS Word & LibreOffice
        const wordMeta = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">`;
        
        let safeHtml = html.replace(/<html>\s*<head>/i, wordMeta);
        
        // Kita mengembalikan HTML string dengan mime-type ms-word
        // LibreOffice dan MS Word membaca format ini jauh lebih stabil untuk tabel kompleks
        // dibanding html-to-docx yang kerap menghasilkan w:gridCol cacat di LibreOffice.

        return new NextResponse(safeHtml, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.ms-word; charset=utf-8",
                "Content-Disposition": `attachment; filename="Anjab ${data.nama_jabatan}.doc"`,
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (err) {
        console.error("[anjab/docx][GET] error:", err);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

