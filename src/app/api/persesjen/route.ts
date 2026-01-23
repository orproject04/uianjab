import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "persesjen");

// Ensure upload directory exists
async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// NOTE: Do not modify casing of `nama` here — preserve user input

// GET - List all persesjen records
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, nama, jenis_persesjen, persesjen_path, created_at, updated_at 
       FROM persesjen 
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    console.error("Error fetching persesjen:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

// POST - Create new persesjen record with file upload
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized - Admin only" },
        { status: 403 }
      );
    }

    await ensureUploadDir();

    const formData = await req.formData();
    const nama = formData.get("nama") as string;
    const jenis_persesjen = formData.get("jenis_persesjen") as string;
    const persejenFile = formData.get("persesjen") as File | null;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama is required" },
        { status: 400 }
      );
    }

    if (!jenis_persesjen || !jenis_persesjen.trim()) {
      return NextResponse.json(
        { error: "Jenis Persesjen is required" },
        { status: 400 }
      );
    }

    const cleanNama = nama.trim();

    // Check if record with same name already exists (case-insensitive compare)
    const checkExisting = await pool.query(
      "SELECT id, persesjen_path FROM persesjen WHERE LOWER(nama) = LOWER($1) AND LOWER(jenis_persesjen) = LOWER($2)",
      [cleanNama, jenis_persesjen.trim()]
    );

    let persejenPath = null;

    // Save Persesjen file if provided
    if (persejenFile && persejenFile.size > 0) {
      const fileExt = path.extname(persejenFile.name);
      const fileName = `persesjen_${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const bytes = await persejenFile.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      persejenPath = `/api/files/persesjen/${fileName}`;
    }

    if (checkExisting.rows.length > 0) {
      // Record exists - UPDATE existing row
      const existing = checkExisting.rows[0];
      
      // Check if trying to upload a file that already exists
      if (persejenPath && existing.persesjen_path) {
        return NextResponse.json(
          { error: "Dokumen Persesjen Sudah Ada" },
          { status: 400 }
        );
      }

      // Update the existing record with new file path
      const updatedPersejenPath = persejenPath || existing.persesjen_path;

      const result = await pool.query(
        `UPDATE persesjen 
         SET persesjen_path = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [updatedPersejenPath, existing.id]
      );

      return NextResponse.json({
        message: "Dokumen Persesjen berhasil diunggah",
        data: result.rows[0],
      });
    } else {
      // Record doesn't exist - INSERT new row
      const result = await pool.query(
        `INSERT INTO persesjen (nama, jenis_persesjen, persesjen_path) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [cleanNama, jenis_persesjen.trim(), persejenPath]
      );

      return NextResponse.json({
        message: "Dokumen Persesjen berhasil diunggah",
        data: result.rows[0],
      });
    }
  } catch (error: any) {
    console.error("Error creating persesjen:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create persesjen" },
      { status: 500 }
    );
  }
}
