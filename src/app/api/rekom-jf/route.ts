import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "rekom-jf");

// Ensure upload directory exists
async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// Capitalize function
function toCapitalize(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// GET - List all rekom_jf records
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, nama, kemenpan_path, instansi_pembina_path, created_at, updated_at 
       FROM rekom_jf 
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    console.error("Error fetching rekom_jf:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

// POST - Create new rekom_jf record with file uploads
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user || (user.role !== "admin" && user.role !== "admin-jf")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin or Admin JF only" },
        { status: 403 }
      );
    }

    await ensureUploadDir();

    const formData = await req.formData();
    const nama = formData.get("nama") as string;
    const kemenpanFile = formData.get("kemenpan") as File | null;
    const instansiPembinaFile = formData.get("instansi_pembina") as File | null;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama is required" },
        { status: 400 }
      );
    }

    const capitalizedNama = toCapitalize(nama.trim());

    // Check if record with same name already exists
    const checkExisting = await pool.query(
      "SELECT id, kemenpan_path, instansi_pembina_path FROM rekom_jf WHERE LOWER(nama) = LOWER($1)",
      [capitalizedNama]
    );

    let kemenpanPath = null;
    let instansiPembinaPath = null;

    // Save KEMENPAN file if provided
    if (kemenpanFile && kemenpanFile.size > 0) {
      const fileExt = path.extname(kemenpanFile.name);
      const fileName = `kemenpan_${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const bytes = await kemenpanFile.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      kemenpanPath = `/api/storage/rekom-jf/${fileName}`;
    }

    // Save Instansi Pembina file if provided
    if (instansiPembinaFile && instansiPembinaFile.size > 0) {
      const fileExt = path.extname(instansiPembinaFile.name);
      const fileName = `instansi_${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const bytes = await instansiPembinaFile.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      instansiPembinaPath = `/api/storage/rekom-jf/${fileName}`;
    }

    if (checkExisting.rows.length > 0) {
      // Record exists - UPDATE existing row
      const existing = checkExisting.rows[0];
      
      // Check if trying to upload a file that already exists
      if (kemenpanPath && existing.kemenpan_path) {
        return NextResponse.json(
          { error: "Surat Rekomendasi Sudah Ada" },
          { status: 400 }
        );
      }
      
      if (instansiPembinaPath && existing.instansi_pembina_path) {
        return NextResponse.json(
          { error: "Surat Rekomendasi Sudah Ada" },
          { status: 400 }
        );
      }

      // Update the existing record with new file path
      const updatedKemenpanPath = kemenpanPath || existing.kemenpan_path;
      const updatedInstansiPath = instansiPembinaPath || existing.instansi_pembina_path;

      const result = await pool.query(
        `UPDATE rekom_jf 
         SET kemenpan_path = $1, instansi_pembina_path = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [updatedKemenpanPath, updatedInstansiPath, existing.id]
      );

      return NextResponse.json({
        message: "Surat Rekomendasi JF berhasil diunggah",
        data: result.rows[0],
      });
    } else {
      // Record doesn't exist - INSERT new row
      const result = await pool.query(
        `INSERT INTO rekom_jf (nama, kemenpan_path, instansi_pembina_path) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [capitalizedNama, kemenpanPath, instansiPembinaPath]
      );

      return NextResponse.json({
        message: "Surat Rekomendasi JF berhasil diunggah",
        data: result.rows[0],
      });
    }
  } catch (error: any) {
    console.error("Error creating rekom_jf:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create rekom_jf" },
      { status: 500 }
    );
  }
}
