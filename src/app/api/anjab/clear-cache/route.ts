import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const cacheDir = path.join(process.cwd(), "storage", "pdf-cache");
        
        // Check if directory exists
        try {
            await fs.access(cacheDir);
        } catch {
            return NextResponse.json({ 
                ok: true, 
                deleted_count: 0,
                message: "Cache directory tidak ada" 
            });
        }

        // Read all files in cache directory
        const files = await fs.readdir(cacheDir);
        
        // Filter only PDF files
        const pdfFiles = files.filter(file => file.endsWith('.pdf'));
        
        // Delete all PDF files
        let deletedCount = 0;
        for (const file of pdfFiles) {
            try {
                await fs.unlink(path.join(cacheDir, file));
                deletedCount++;
            } catch (err) {
                console.error(`Failed to delete ${file}:`, err);
            }
        }

        return NextResponse.json({ 
            ok: true, 
            deleted_count: deletedCount,
            message: `${deletedCount} file cache berhasil dihapus` 
        });
    } catch (error: any) {
        console.error("Error clearing cache:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal menghapus cache" },
            { status: 500 }
        );
    }
}
