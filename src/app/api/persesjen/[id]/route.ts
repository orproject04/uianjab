import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// DELETE - Delete persesjen record
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromReq(req);
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized - Admin only" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Get file path before deletion
    const existing = await pool.query(
      "SELECT persesjen_path FROM persesjen WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { persesjen_path } = existing.rows[0];

    // Helper function to delete file from filesystem
    const deleteFile = async (filePath: string | null) => {
      if (!filePath) return;
      try {
        const physicalPath = path.join(
          process.cwd(),
          "storage",
          filePath.replace(/^\/api\/storage\//, "").replace(/^\/storage\//, "")
        );
        if (existsSync(physicalPath)) {
          await unlink(physicalPath);
          console.log(`Deleted file: ${physicalPath}`);
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    };

    // Delete file from filesystem
    await deleteFile(persesjen_path);

    // Delete database record
    await pool.query("DELETE FROM persesjen WHERE id = $1", [id]);

    return NextResponse.json({ message: "Dokumen Persesjen berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting persesjen:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete persesjen" },
      { status: 500 }
    );
  }
}
