import {NextRequest, NextResponse} from "next/server";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {getUserFromReq} from "@/lib/auth";
import {generateAnjabDocx} from "@/lib/anjab-docx-generator";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }

        const {id} = await ctx.params;
        
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        const docxBuffer = generateAnjabDocx(data);
        
        const safeNama = (data.nama_jabatan || "anjab").replace(/[^a-zA-Z0-9 -]/g, "");

        return new NextResponse(docxBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="Anjab - ${safeNama}.docx"`
            }
        });
    } catch (err: any) {
        console.error("GET /api/anjab/[id]/docx-template error:", err);
        return NextResponse.json(
            {error: "Terjadi kesalahan server", details: err.message},
            {status: 500}
        );
    }
}
