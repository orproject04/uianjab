import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "rekom-jf");

// GET - Get single rekom_jf by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const result = await pool.query(
      `SELECT id, nama, kemenpan_path, instansi_pembina_path, created_at, updated_at 
       FROM rekom_jf 
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: result.rows[0] });
  } catch (error: any) {
    console.error("Error fetching rekom_jf:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

// PUT - Update rekom_jf record
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromReq(req);
    if (!user || (user.role !== "admin" && user.role !== "admin-jf")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin or Admin JF only" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const formData = await req.formData();
    const nama = formData.get("nama") as string;
    const kemenpanFile = formData.get("kemenpan") as File | null;
    const instansiPembinaFile = formData.get("instansi_pembina") as File | null;

    if (!nama || !nama.trim()) {
      return NextResponse.json({ error: "Nama is required" }, { status: 400 });
    }

    // Get existing record
    const existing = await pool.query(
      "SELECT kemenpan_path, instansi_pembina_path FROM rekom_jf WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let kemenpanPath = existing.rows[0].kemenpan_path;
    let instansiPembinaPath = existing.rows[0].instansi_pembina_path;

    // Update KEMENPAN file if provided
    if (kemenpanFile && kemenpanFile.size > 0) {
      // Delete old file if exists
      if (kemenpanPath) {
        const oldFilePath = path.join(process.cwd(), "storage", kemenpanPath.replace(/^\/api\/storage\//, "").replace(/^\/storage\//, ""));
        if (existsSync(oldFilePath)) {
          await unlink(oldFilePath).catch(() => {});
        }
      }
      // Save new file
      const fileExt = path.extname(kemenpanFile.name);
      const fileName = `kemenpan_${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const bytes = await kemenpanFile.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      kemenpanPath = `/api/files/rekom-jf/${fileName}`;
    }

    // Update Instansi Pembina file if provided
    if (instansiPembinaFile && instansiPembinaFile.size > 0) {
      // Delete old file if exists
      if (instansiPembinaPath) {
        const oldFilePath = path.join(process.cwd(), "storage", instansiPembinaPath.replace(/^\/api\/storage\//, "").replace(/^\/storage\//, ""));
        if (existsSync(oldFilePath)) {
          await unlink(oldFilePath).catch(() => {});
        }
      }
      // Save new file
      const fileExt = path.extname(instansiPembinaFile.name);
      const fileName = `instansi_${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const bytes = await instansiPembinaFile.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      instansiPembinaPath = `/api/files/rekom-jf/${fileName}`;
    }

    const result = await pool.query(
      `UPDATE rekom_jf 
       SET nama = $1, kemenpan_path = $2, instansi_pembina_path = $3 
       WHERE id = $4 
       RETURNING *`,
      [nama.trim(), kemenpanPath, instansiPembinaPath, id]
    );

    return NextResponse.json({
      message: "Rekom JF updated successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error updating rekom_jf:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update rekom_jf" },
      { status: 500 }
    );
  }
}

// DELETE - Delete rekom_jf record or specific document
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromReq(req);
    if (!user || (user.role !== "admin" && user.role !== "admin-jf")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin or Admin JF only" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "kemenpan" or "instansi_pembina"

    // Get file paths before deletion
    const existing = await pool.query(
      "SELECT kemenpan_path, instansi_pembina_path FROM rekom_jf WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { kemenpan_path, instansi_pembina_path } = existing.rows[0];

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
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    };

    // Partial delete: only delete specific document type
    if (type === "kemenpan" || type === "instansi_pembina") {
      if (type === "kemenpan") {
        // Delete KEMENPAN file
        await deleteFile(kemenpan_path);

        // If both were null or only kemenpan existed, delete the row
        if (!instansi_pembina_path) {
          await pool.query("DELETE FROM rekom_jf WHERE id = $1", [id]);
          return NextResponse.json({
            message: "Surat Rekomendasi berhasil dihapus",
          });
        }

        // Otherwise, just set kemenpan_path to NULL
        await pool.query(
          "UPDATE rekom_jf SET kemenpan_path = NULL, updated_at = NOW() WHERE id = $1",
          [id]
        );
        return NextResponse.json({
          message: "Surat Rekomendasi KEMENPAN berhasil dihapus",
        });
      } else {
        // Delete Instansi Pembina file
        await deleteFile(instansi_pembina_path);

        // If both were null or only instansi existed, delete the row
        if (!kemenpan_path) {
          await pool.query("DELETE FROM rekom_jf WHERE id = $1", [id]);
          return NextResponse.json({
            message: "Surat Rekomendasi berhasil dihapus",
          });
        }

        // Otherwise, just set instansi_pembina_path to NULL
        await pool.query(
          "UPDATE rekom_jf SET instansi_pembina_path = NULL, updated_at = NOW() WHERE id = $1",
          [id]
        );
        return NextResponse.json({
          message: "Surat Rekomendasi Instansi Pembina berhasil dihapus",
        });
      }
    }

    // Full delete: delete both files and the row
    await deleteFile(kemenpan_path);
    await deleteFile(instansi_pembina_path);

    // Delete database record
    await pool.query("DELETE FROM rekom_jf WHERE id = $1", [id]);

    return NextResponse.json({ message: "Surat Rekomendasi berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting rekom_jf:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete rekom_jf" },
      { status: 500 }
    );
  }
}
