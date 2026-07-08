// src/app/api/anjab/download-bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { getAnjabByIdOrSlug } from "@/lib/anjab-queries";
import { buildAnjabHtml } from "@/lib/anjab-pdf-template";
import puppeteer, { Browser } from "puppeteer";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import archiver from "archiver";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface PetaJabatanWithABK {
    peta_id: string;
    jabatan_id: string;
    nama_jabatan: string;
    jenis_jabatan: string;
    unit_kerja: string;
    level: number;
    parent_id: string | null;
    parent_nama: string | null;
    parent_jenis: string | null;
    has_abk: boolean;
    is_pusat: boolean;
}

interface FolderStructure {
    [key: string]: {
        folder: string;
        items: PetaJabatanWithABK[];
        subfolders?: {
            [key: string]: {
                folder: string;
                items: PetaJabatanWithABK[];
            };
        };
    };
}

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



export async function GET(req: NextRequest) {
    let tempDir: string | null = null;
    try {
        console.log("[download-bulk] Request started");
        const url = new URL(req.url);
        const streamMode = url.searchParams.get("stream") === "1";
        const scope = url.searchParams.get("scope") || "all"; // 'eselon12' for only Eselon 1 & 2

        // If `file` param is provided, serve an existing archive from tmp
        const fileParam = url.searchParams.get("file");
        if (fileParam) {
            const archivePath = path.join(os.tmpdir(), fileParam);
            if (!fs.existsSync(archivePath)) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            return createArchiveResponse(archivePath, fileParam, null);
        }

        const user = getUserFromReq(req);
        if (!user) {
            console.log("[download-bulk] User not authenticated");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (!hasRole(user, "admin")) {
            console.log("[download-bulk] User not admin");
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }
        // Get all peta_jabatan
        console.log("[download-bulk] Fetching all peta_jabatan for hierarchy...");
        const result = await pool.query(`SELECT
                pj.id as peta_id,
                pj.jabatan_id,
                pj.nama_jabatan,
                pj.jenis_jabatan,
                pj.unit_kerja,
                pj.level,
                pj.parent_id,
                pj.is_pusat,
                pp.nama_jabatan as parent_nama,
                pp.jenis_jabatan as parent_jenis,
                EXISTS(SELECT 1 FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = pj.id) as has_abk
            FROM peta_jabatan pj
            LEFT JOIN peta_jabatan pp ON pp.id = pj.parent_id
            ORDER BY pj.level, pj.order_index, pj.nama_jabatan
        `);

        const allPetaJabatan: PetaJabatanWithABK[] = result.rows;

        const deputiAdmin = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('deputi bidang administrasi'));
        const deputiPersidangan = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('deputi bidang persidangan'));
        const sekjen = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('sekretaris jenderal') && !p.nama_jabatan?.toLowerCase().includes('deputi'));
        const inspektorat = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('inspektur') || p.nama_jabatan?.toLowerCase().includes('inspektorat'));

        const deputiAdminId = deputiAdmin?.peta_id || "NOT_FOUND_ADMIN";
        const deputiPersidanganId = deputiPersidangan?.peta_id || "NOT_FOUND_PERSIDANGAN";
        const sekjenId = sekjen?.peta_id || "NOT_FOUND_SEKJEN";
        const inspektoratId = inspektorat?.peta_id || "NOT_FOUND_INSPEKTORAT";

        function isDescendantOf(item: PetaJabatanWithABK, targetId: string): boolean {
            let current: PetaJabatanWithABK | undefined = item;
            while (current) {
                if (current.peta_id === targetId) return true;
                current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
            }
            return false;
        }

        // Filter only those with ABK and match the requested criteria
        const petaWithABK = allPetaJabatan.filter(p => {
            if (!p.jabatan_id) return false;
            // JABATAN FUNGSIONAL tidak wajib punya ABK, tapi jenis jabatan lain wajib
            if (p.jenis_jabatan !== "JABATAN FUNGSIONAL" && !p.has_abk) return false;

            // Scope: fungsional_admin — only Jabatan Fungsional under Deputi Administrasi
            if (scope === "fungsional_admin") {
                return p.jenis_jabatan === "JABATAN FUNGSIONAL" && isDescendantOf(p, deputiAdminId);
            }

            if (p.jenis_jabatan === "ESELON I / JPT Madya") return true;
            if (p.jenis_jabatan === "ESELON II / JPT Pratama") return true;

            if (p.jenis_jabatan === "ESELON III / Administrator") {
                if (isDescendantOf(p, deputiAdminId)) return true;
                if (isDescendantOf(p, deputiPersidanganId)) return true;
                if (isDescendantOf(p, inspektoratId)) return true;
                // Add Kantor DPD Provinsi which are under Sekjen but we identify them by having 'provinsi' or 'kantor' usually, or just being descendants of Sekjen
                if (isDescendantOf(p, sekjenId) && (p.nama_jabatan?.toLowerCase().includes('provinsi') || p.unit_kerja?.toLowerCase().includes('provinsi'))) return true;
            }

            if (p.jenis_jabatan === "ESELON IV / Pengawas") {
                if (isDescendantOf(p, sekjenId)) return true;
                if (isDescendantOf(p, inspektoratId)) return true;
            }

            if (p.jenis_jabatan === "JABATAN PELAKSANA") {
                if (isDescendantOf(p, sekjenId)) return true;
                if (isDescendantOf(p, inspektoratId)) return true;
            }

            if (p.jenis_jabatan === "JABATAN FUNGSIONAL") {
                // Include all fungsional under sekjen (covers Admin, Persidangan, Sekjen, Provinsi) or Inspektorat
                if (isDescendantOf(p, sekjenId)) return true;
                if (isDescendantOf(p, inspektoratId)) return true;
            }

            return false;
        });

        if (petaWithABK.length === 0) {
            return NextResponse.json(
                { error: "Tidak ada anjab dengan ABK yang ditemukan" },
                { status: 404 }
            );
        }

        // Organize by folder structure
        let folderStructure: FolderStructure | null = null;
        let dfsList: PetaJabatanWithABK[] = [];

        if (scope === "tree") {
            dfsList = getDFSItems(allPetaJabatan, "sekretaris jenderal dpd ri")
                .filter(p => !!p.jabatan_id && (p.jenis_jabatan === "JABATAN FUNGSIONAL" || p.has_abk));
        } else {
            folderStructure = organizeFolderStructure(allPetaJabatan, petaWithABK);
        }

        // Create temporary directory for files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anjab-"));
        const workDir = tempDir;

        // Create folder structure if not tree
        let filesList: { folder: string; jabatan_id: string; peta_id: string; nama_jabatan: string }[] = [];

        if (folderStructure) {
            for (const [category, categoryData] of Object.entries(folderStructure)) {
                // Create main folder
                const mainFolderPath = path.join(workDir, categoryData.folder);
                fs.mkdirSync(mainFolderPath, { recursive: true });

                for (const item of categoryData.items) {
                    if (scope === "eselon12" && category !== "jpt") continue;
                    if (item.jabatan_id) {
                        filesList.push({
                            folder: categoryData.folder,
                            jabatan_id: item.jabatan_id,
                            peta_id: item.peta_id,
                            nama_jabatan: item.nama_jabatan,
                        });
                    }
                }

                // Create subfolders
                if (categoryData.subfolders) {
                    for (const [subcat, subcatData] of Object.entries(categoryData.subfolders)) {
                        const subFolderPath = path.join(workDir, subcatData.folder);
                        fs.mkdirSync(subFolderPath, { recursive: true });

                        for (const item of subcatData.items) {
                            if (scope === "eselon12") continue;
                            if (item.jabatan_id) {
                                filesList.push({
                                    folder: subcatData.folder,
                                    jabatan_id: item.jabatan_id,
                                    peta_id: item.peta_id,
                                    nama_jabatan: item.nama_jabatan,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Generate PDFs
        let successCount = 0;
        const pageCounter = { current: 1 };

        // If streaming, create a ReadableStream that will emit SSE messages
        if (streamMode) {
            const encoder = new TextEncoder();
            // Track filename duplicates per folder to avoid overwrite collisions
            const fileNameCounters: { [key: string]: number } = {};
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        const total = scope === "tree" ? dfsList.length : filesList.length;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ total })}\n\n`));

                        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

                        if (scope === "tree") {
                            const mergedPdf = await PDFDocument.create();
                            const font = await mergedPdf.embedFont(StandardFonts.Helvetica);

                            for (let i = 0; i < dfsList.length; i++) {
                                const item = dfsList[i];
                                try {
                                    const rawBuffer = await generateRawPDFBuffer(item.peta_id, item.nama_jabatan || "");
                                    const pdfDoc = await PDFDocument.load(rawBuffer);
                                    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());

                                    for (const pdfPage of pages) {
                                        const { width } = pdfPage.getSize();
                                        const text = `${pageCounter.current}`;
                                        const fontSize = 11;
                                        const textWidth = font.widthOfTextAtSize(text, fontSize);

                                        pdfPage.drawText(text, {
                                            x: width / 2 - textWidth / 2,
                                            y: 15,
                                            size: fontSize,
                                            font: font,
                                            color: rgb(0, 0, 0),
                                        });
                                        pageCounter.current++;
                                        mergedPdf.addPage(pdfPage);
                                    }
                                    successCount++;
                                } catch (error) {
                                    console.error(`Error generating PDF for ${item.nama_jabatan}:`, error);
                                }
                                const progress = { done: successCount, total };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                                console.log(`[download-bulk] Tree Progress ${successCount}/${total} - ${item.nama_jabatan}`);
                            }

                            const archiveFileName = `anjab-tree-${timestamp}.pdf`;
                            const archivePath = path.join(os.tmpdir(), archiveFileName);
                            const mergedPdfBytes = await mergedPdf.save();
                            fs.writeFileSync(archivePath, mergedPdfBytes);

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, file: archiveFileName })}\n\n`));

                        } else {
                            for (let i = 0; i < filesList.length; i++) {
                                const file = filesList[i];
                                try {
                                    const dedupeKey = `${file.folder}/${sanitizeFileName(file.nama_jabatan)}`;
                                    fileNameCounters[dedupeKey] = (fileNameCounters[dedupeKey] || 0) + 1;
                                    const suffix = fileNameCounters[dedupeKey] > 1 ? `_${fileNameCounters[dedupeKey]}` : '';
                                    await generateAndSavePDF(file.peta_id, file.nama_jabatan, workDir, file.folder, suffix, pageCounter);
                                    successCount++;
                                } catch (error) {
                                    console.error(`Error generating PDF for ${file.nama_jabatan}:`, error);
                                }
                                const progress = { done: successCount, total };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                                console.log(`[download-bulk] Progress ${successCount}/${total} - ${file.nama_jabatan}`);
                            }

                            // Create ZIP archive
                            const archiveFileName = `anjab-abk-${timestamp}.zip`;
                            const archivePath = path.join(os.tmpdir(), archiveFileName);

                            try {
                                await new Promise<void>((resolve, reject) => {
                                    const output = fs.createWriteStream(archivePath);
                                    const archive = archiver('zip', {
                                        zlib: { level: 3 },
                                        forceZip64: true,
                                        forceLocalTime: true
                                    });

                                    output.on('close', () => resolve());
                                    output.on('error', reject);
                                    archive.on('error', reject);
                                    archive.on('warning', (err: any) => {
                                        if (err.code !== 'ENOENT') reject(err);
                                    });

                                    archive.pipe(output);
                                    archive.directory(workDir, false);
                                    archive.finalize();
                                });
                            } catch (error) {
                                console.error("Archive creation failed:", error);
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Gagal membuat archive zip" })}\n\n`));
                                if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
                                controller.close();
                                return;
                            }

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, file: archiveFileName })}\n\n`));
                        }

                        // Clean up workDir
                        if (fs.existsSync(workDir)) {
                            fs.rmSync(workDir, { recursive: true, force: true });
                        }

                        controller.close();
                    } catch (err) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (err as any).message || 'unknown' })}\n\n`));
                        controller.close();
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        } else {
            const fileNameCounters: { [key: string]: number } = {};
            for (const file of filesList) {
                try {
                    const dedupeKey = `${file.folder}/${sanitizeFileName(file.nama_jabatan)}`;
                    fileNameCounters[dedupeKey] = (fileNameCounters[dedupeKey] || 0) + 1;
                    const suffix = fileNameCounters[dedupeKey] > 1 ? `_${fileNameCounters[dedupeKey]}` : '';
                    await generateAndSavePDF(file.peta_id, file.nama_jabatan, workDir, file.folder, suffix, pageCounter);
                    successCount++;
                    console.log(`[download-bulk] Progress ${successCount}/${filesList.length} - ${file.nama_jabatan}`);
                } catch (error) {
                    console.error(`Error generating PDF for ${file.nama_jabatan}:`, error);
                }
            }

            console.log(`Generated ${successCount}/${filesList.length} PDFs`);
        }

        // Create ZIP archive
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const archiveFileName = `anjab-abk-${timestamp}.zip`;
        const archivePath = path.join(os.tmpdir(), archiveFileName);

        // Use archiver to create archive
        try {
            await new Promise<void>((resolve, reject) => {
                const output = fs.createWriteStream(archivePath);
                const archive = archiver('zip', {
                    zlib: { level: 3 },
                    forceZip64: true,
                    forceLocalTime: true
                });

                output.on('close', () => resolve());
                output.on('error', reject);
                archive.on('error', reject);
                archive.on('warning', (err: any) => {
                    if (err.code !== 'ENOENT') reject(err);
                });

                archive.pipe(output);
                archive.directory(workDir, false);
                archive.finalize();
            });
        } catch (error) {
            console.error("Archive creation failed:", error);
            throw new Error("Failed to create archive");
        }

        return createArchiveResponse(archivePath, archiveFileName, workDir);
    } catch (error: any) {
        // Clean up temp files on error
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        console.error("Error in download-bulk:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal membuat file download" },
            { status: 500 }
        );
    }
}



function createArchiveResponse(archivePath: string, fileName: string, tempDir: string | null): NextResponse {
    try {
        // Clean up temp working directory if provided
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        if (!fs.existsSync(archivePath)) {
            return NextResponse.json({ error: "Archive file not found" }, { status: 404 });
        }

        const fileSize = fs.statSync(archivePath).size;
        const nodeStream = fs.createReadStream(archivePath);

        // Robust stream handling for large files
        const webStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of nodeStream) {
                        controller.enqueue(new Uint8Array(chunk));
                    }
                    controller.close();
                } catch (err) {
                    console.error("Stream error:", err);
                    controller.error(err);
                } finally {
                    // Clean up archive file after streaming completes or fails
                    try {
                        if (fs.existsSync(archivePath)) {
                            fs.unlinkSync(archivePath);
                        }
                    } catch (e) { }
                }
            },
            cancel() {
                nodeStream.destroy();
            }
        });

        let contentType = "application/zip";
        if (fileName.endsWith(".tar.gz")) contentType = "application/gzip";
        else if (fileName.endsWith(".pdf")) contentType = "application/pdf";

        return new NextResponse(webStream, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Content-Length": fileSize.toString(),
                "Cache-Control": "no-cache",
            },
        });
    } catch (error) {
        console.error("Error creating response:", error);
        throw error;
    }
}
function sanitizeFileName(name: string): string {
    // Remove invalid characters from filename, then trim to ensure no trailing spaces are left
    return name
        .replace(/[<>:"/\\|?*]/g, "")
        .trim()
        .substring(0, 60)
        .trim(); // Trim again in case substring cuts off right after a space
}

function buildTreeStructure(
    petaWithABK: PetaJabatanWithABK[],
    allPetaJabatan: PetaJabatanWithABK[]
): FolderStructure {
    const structure: FolderStructure = {};
    const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};

    for (const item of petaWithABK) {
        const pathParts: string[] = [];
        let current: PetaJabatanWithABK | undefined = item;

        // Find ancestors
        current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        while (current) {
            let name = current.nama_jabatan || "Tidak Diketahui";
            pathParts.unshift(sanitizeFileName(name));
            current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        }

        const folder = pathParts.length > 0 ? pathParts.join("/") : "Utama";


        if (!subfolders[folder]) {
            subfolders[folder] = { folder, items: [] };
        }
        subfolders[folder].items.push(item);
    }

    structure["tree"] = {
        folder: "Anjab_Tree",
        items: [],
        subfolders
    };

    return structure;
}

function organizeFolderStructure(
    allPetaJabatan: PetaJabatanWithABK[],
    petaWithABK: PetaJabatanWithABK[]
): FolderStructure {
    const structure: FolderStructure = {};

    const deputiAdmin = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('deputi bidang administrasi'));
    const deputiPersidangan = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('deputi bidang persidangan'));
    const sekjen = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('sekretaris jenderal') && !p.nama_jabatan?.toLowerCase().includes('deputi'));
    const inspektorat = allPetaJabatan.find(p => p.nama_jabatan?.toLowerCase().includes('inspektur') || p.nama_jabatan?.toLowerCase().includes('inspektorat'));

    const deputiAdminId = deputiAdmin?.peta_id || "NOT_FOUND_ADMIN";
    const deputiPersidanganId = deputiPersidangan?.peta_id || "NOT_FOUND_PERSIDANGAN";
    const sekjenId = sekjen?.peta_id || "NOT_FOUND_SEKJEN";
    const inspektoratId = inspektorat?.peta_id || "NOT_FOUND_INSPEKTORAT";

    // Helper to check hierarchy
    function isDescendantOf(item: PetaJabatanWithABK, targetId: string): boolean {
        let current: PetaJabatanWithABK | undefined = item;
        while (current) {
            if (current.peta_id === targetId) return true;
            current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        }
        return false;
    }

    // Helper to find parent Biro (ESELON II / JPT Pratama)
    function findBiroName(item: PetaJabatanWithABK): string {
        let current: PetaJabatanWithABK | undefined = item;
        while (current) {
            if (current.jenis_jabatan === "ESELON II / JPT Pratama") {
                let name = current.nama_jabatan || "Biro Tidak Teridentifikasi";
                if (name.toLowerCase().startsWith("kepala ")) {
                    name = name.substring(7); // Remove "Kepala " prefix
                }
                return sanitizeFileName(name.trim());
            }
            current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        }
        return "Lainnya";
    }

    // Helper to find parent Bagian (ESELON III / Administrator)
    function findBagianName(item: PetaJabatanWithABK): string {
        let current: PetaJabatanWithABK | undefined = item;
        while (current) {
            if (current.jenis_jabatan === "ESELON III / Administrator") {
                let name = current.nama_jabatan || "Bagian Tidak Teridentifikasi";
                if (name.toLowerCase().startsWith("kepala ")) {
                    name = name.substring(7); // Remove "Kepala " prefix
                }
                return sanitizeFileName(name.trim());
            }
            current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        }
        return "Lainnya";
    }

    // Helper to find parent Subbagian (ESELON IV / Pengawas)
    function findSubbagianName(item: PetaJabatanWithABK): string {
        let current: PetaJabatanWithABK | undefined = item;
        while (current) {
            if (current.jenis_jabatan === "ESELON IV / Pengawas") {
                let name = current.nama_jabatan || "Subbagian Tidak Teridentifikasi";
                if (name.toLowerCase().startsWith("kepala ")) {
                    name = name.substring(7); // Remove "Kepala " prefix
                }
                return sanitizeFileName(name.trim());
            }
            current = allPetaJabatan.find(p => p.peta_id === current?.parent_id);
        }
        return "Lainnya";
    }

    // Helper for JABATAN FUNGSIONAL: returns the immediate parent name as the subfolder label.
    // - If parent is ESELON II / JPT Pratama with is_pusat=true -> use Biro name
    // - If parent is ESELON III / Administrator with is_pusat=false -> use Bagian name
    function findFungsionalSubfolder(item: PetaJabatanWithABK): string {
        const parentEntry = allPetaJabatan.find(x => x.peta_id === item.parent_id);
        if (parentEntry) {
            let name = parentEntry.nama_jabatan || "Tidak Teridentifikasi";
            if (name.toLowerCase().startsWith("kepala ")) {
                name = name.substring(7);
            }
            return sanitizeFileName(name.trim());
        }
        return "Lainnya";
    }

    // Helper to extract Provinsi from Kantor DPD item
    function extractProvinsi(item: PetaJabatanWithABK): string {
        const textToSearch = (item.nama_jabatan + " " + item.unit_kerja).toLowerCase();

        const provMatches = textToSearch.match(/provinsi\s+([a-z\s]+)/i);
        if (provMatches) {
            let provName = provMatches[1].trim();

            // Cut off at common unit indicators to get just the province name
            const delimiters = ["kantor", "subbagian", "bagian", "biro", "sekretariat", ","];
            for (const delim of delimiters) {
                const idx = provName.toLowerCase().indexOf(delim);
                if (idx !== -1) {
                    provName = provName.substring(0, idx).trim();
                }
            }

            // Capitalize each word properly
            provName = provName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return sanitizeFileName(provName) || "Provinsi Tidak Teridentifikasi";
        }

        return "Provinsi Tidak Teridentifikasi";
    }

    // 1. JPT Madya dan Pratama (Eselon I & II)
    const jptItems = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON I / JPT Madya" || p.jenis_jabatan === "ESELON II / JPT Pratama"
    );

    if (jptItems.length > 0) {
        structure["jpt"] = {
            folder: "01-Anjab JPT Madya Pratama",
            items: jptItems,
        };
        console.log(`[download-bulk] Found ${jptItems.length} JPT items`);
    }

    // 2. Eselon III Administrasi
    const eselon3Admin = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON III / Administrator" && isDescendantOf(p, deputiAdminId)
    );

    if (eselon3Admin.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon3Admin) {
            const biro = findBiroName(item);
            if (!subfolders[biro]) {
                subfolders[biro] = {
                    folder: `02-ES III Dep Admin/${biro}`,
                    items: []
                };
            }
            subfolders[biro].items.push(item);
        }
        structure["admin"] = {
            folder: "02-ES III Dep Admin",
            items: [],
            subfolders
        };
        console.log(`[download-bulk] Found ${eselon3Admin.length} Eselon III Administrasi items`);
    }

    // 3. Eselon III Persidangan
    const eselon3Persidangan = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON III / Administrator" && isDescendantOf(p, deputiPersidanganId)
    );

    if (eselon3Persidangan.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon3Persidangan) {
            const biro = findBiroName(item);
            if (!subfolders[biro]) {
                subfolders[biro] = {
                    folder: `03-ES III Dep Persidangan/${biro}`,
                    items: []
                };
            }
            subfolders[biro].items.push(item);
        }
        structure["persidangan"] = {
            folder: "03-ES III Dep Persidangan",
            items: [],
            subfolders
        };
        console.log(`[download-bulk] Found ${eselon3Persidangan.length} Eselon III Persidangan items`);
    }

    // 4. Eselon III Kantor DPD Provinsi
    const eselon3Kantor = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON III / Administrator" &&
        isDescendantOf(p, sekjenId) &&
        (p.nama_jabatan?.toLowerCase().includes('provinsi') || p.unit_kerja?.toLowerCase().includes('provinsi')) &&
        !isDescendantOf(p, deputiAdminId) &&
        !isDescendantOf(p, deputiPersidanganId) &&
        !isDescendantOf(p, inspektoratId)
    );

    if (eselon3Kantor.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon3Kantor) {
            const provinsi = extractProvinsi(item);
            if (!subfolders[provinsi]) {
                subfolders[provinsi] = {
                    folder: `04-ES III Kantor DPD Provinsi/${provinsi}`,
                    items: []
                };
            }
            subfolders[provinsi].items.push(item);
        }
        structure["kantor"] = {
            folder: "04-ES III Kantor DPD Provinsi",
            items: [],
            subfolders
        };
        console.log(`[download-bulk] Found ${eselon3Kantor.length} Eselon III Kantor Provinsi items`);
    }

    // 5. Eselon IV Administrasi
    const eselon4Admin = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON IV / Pengawas" && isDescendantOf(p, deputiAdminId)
    );

    if (eselon4Admin.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon4Admin) {
            const biro = findBiroName(item);
            const bagian = findBagianName(item);
            const key = `${biro}/${bagian}`;
            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: `05-ES IV Dep Admin/${biro}/${bagian}`,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["admin_eselon4"] = {
            folder: "05-ES IV Dep Admin",
            items: [],
            subfolders
        };
    }

    // 6. Eselon IV Persidangan
    const eselon4Persidangan = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON IV / Pengawas" && isDescendantOf(p, deputiPersidanganId)
    );

    if (eselon4Persidangan.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon4Persidangan) {
            const biro = findBiroName(item);
            const bagian = findBagianName(item);

            // Special case: no "Lainnya" subfolder for specific Pusat units
            const isPusatUnit = biro.toLowerCase().includes("pusat kajian daerah dan anggaran") ||
                biro.toLowerCase().includes("pusat perancangan dan kajian kebijakan hukum");

            const key = isPusatUnit ? biro : `${biro}/${bagian}`;
            const targetFolder = isPusatUnit ?
                `06-ES IV Dep Persidangan/${biro}` :
                `06-ES IV Dep Persidangan/${biro}/${bagian}`;

            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: targetFolder,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["persidangan_eselon4"] = {
            folder: "06-ES IV Dep Persidangan",
            items: [],
            subfolders
        };
    }

    // 7. Eselon IV Inspektorat
    const eselon4Inspektorat = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON IV / Pengawas" && isDescendantOf(p, inspektoratId)
    );

    if (eselon4Inspektorat.length > 0) {
        structure["inspektorat_eselon4"] = {
            folder: "07-ES IV Inspektorat",
            items: eselon4Inspektorat
        };
    }

    // 8. Eselon IV Kantor DPD Provinsi
    const eselon4Kantor = petaWithABK.filter(p =>
        p.jenis_jabatan === "ESELON IV / Pengawas" &&
        isDescendantOf(p, sekjenId) &&
        (p.nama_jabatan?.toLowerCase().includes('provinsi') || p.unit_kerja?.toLowerCase().includes('provinsi')) &&
        !isDescendantOf(p, deputiAdminId) &&
        !isDescendantOf(p, deputiPersidanganId) &&
        !isDescendantOf(p, inspektoratId)
    );

    if (eselon4Kantor.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of eselon4Kantor) {
            const provinsi = extractProvinsi(item);
            if (!subfolders[provinsi]) {
                subfolders[provinsi] = {
                    folder: `08-ES IV Kantor DPD Provinsi/${provinsi}`,
                    items: []
                };
            }
            subfolders[provinsi].items.push(item);
        }
        structure["kantor_eselon4"] = {
            folder: "08-ES IV Kantor DPD Provinsi",
            items: [],
            subfolders
        };
    }

    // 9. Pelaksana Administrasi
    const pelaksanaAdmin = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN PELAKSANA" && isDescendantOf(p, deputiAdminId)
    );

    if (pelaksanaAdmin.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of pelaksanaAdmin) {
            const biro = findBiroName(item);
            const bagian = findBagianName(item);
            const subbagian = findSubbagianName(item);
            const key = `${biro}/${bagian}/${subbagian}`;
            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: `09-Pelaksana Dep Admin/${biro}/${bagian}/${subbagian}`,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["admin_pelaksana"] = {
            folder: "09-Pelaksana Dep Admin",
            items: [],
            subfolders
        };
    }

    // 10. Pelaksana Persidangan
    const pelaksanaPersidangan = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN PELAKSANA" && isDescendantOf(p, deputiPersidanganId)
    );

    if (pelaksanaPersidangan.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of pelaksanaPersidangan) {
            const biro = findBiroName(item);
            let bagian = findBagianName(item);
            let subbagian = findSubbagianName(item);

            // Special logic for Subbagian in Persidangan: whitelist suffixes
            if (subbagian.startsWith("Subbagian")) {
                const allowedSuffixes = [
                    "Penyiapan Materi",
                    "Tata Usaha dan Kerumahtanggaan",
                    "Rapat",
                    "Tata Usaha"
                ];
                let foundSuffix = "";
                for (const suffix of allowedSuffixes) {
                    if (subbagian.includes(suffix)) {
                        foundSuffix = suffix;
                        break;
                    }
                }
                subbagian = foundSuffix ? `Subbagian ${foundSuffix}` : "Subbagian";
            }

            // Special case: skip "Lainnya" for specific Pusat units in Persidangan
            const isPusatUnit = biro.toLowerCase().includes("pusat kajian daerah dan anggaran") ||
                biro.toLowerCase().includes("pusat perancangan dan kajian kebijakan hukum");

            let targetFolder = `10-Pelaksana Dep Persidangan/${biro}`;
            let key = biro;

            if (isPusatUnit) {
                // Skip any level that is "Lainnya"
                if (bagian !== "Lainnya") {
                    targetFolder += `/${bagian}`;
                    key += `/${bagian}`;
                }
                if (subbagian !== "Lainnya") {
                    targetFolder += `/${subbagian}`;
                    key += `/${subbagian}`;
                }
            } else {
                targetFolder += `/${bagian}/${subbagian}`;
                key += `/${bagian}/${subbagian}`;
            }

            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: targetFolder,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["persidangan_pelaksana"] = {
            folder: "10-Pelaksana Dep Persidangan",
            items: [],
            subfolders
        };
    }

    // 11. Pelaksana Inspektorat
    const pelaksanaInspektorat = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN PELAKSANA" && isDescendantOf(p, inspektoratId)
    );

    if (pelaksanaInspektorat.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of pelaksanaInspektorat) {
            const subbagian = findSubbagianName(item);
            const key = `${subbagian}`;
            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: `11-Pelaksana Inspektorat/${subbagian}`,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["inspektorat_pelaksana"] = {
            folder: "11-Pelaksana Inspektorat",
            items: [],
            subfolders
        };
    }

    // 12. Pelaksana Kantor DPD Provinsi
    const pelaksanaKantor = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN PELAKSANA" &&
        isDescendantOf(p, sekjenId) &&
        (p.nama_jabatan?.toLowerCase().includes('provinsi') || p.unit_kerja?.toLowerCase().includes('provinsi')) &&
        !isDescendantOf(p, deputiAdminId) &&
        !isDescendantOf(p, deputiPersidanganId) &&
        !isDescendantOf(p, inspektoratId)
    );

    if (pelaksanaKantor.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of pelaksanaKantor) {
            const provinsi = extractProvinsi(item);
            const subbagian = findSubbagianName(item);
            const key = `${provinsi}/${subbagian}`;
            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: `12-Pelaksana Kantor DPD Provinsi/${provinsi}/${subbagian}`,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["kantor_pelaksana"] = {
            folder: "12-Pelaksana Kantor DPD Provinsi",
            items: [],
            subfolders
        };
    }

    // 13. Fungsional Dep Admin
    const fungsionalAdmin = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN FUNGSIONAL" && isDescendantOf(p, deputiAdminId)
    );

    if (fungsionalAdmin.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of fungsionalAdmin) {
            const sub = findFungsionalSubfolder(item);
            if (!subfolders[sub]) {
                subfolders[sub] = {
                    folder: `13-Fungsional Dep Admin/${sub}`,
                    items: []
                };
            }
            subfolders[sub].items.push(item);
        }
        structure["admin_fungsional"] = {
            folder: "13-Fungsional Dep Admin",
            items: [],
            subfolders
        };
    }

    // 14. Fungsional Dep Persidangan
    const fungsionalPersidangan = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN FUNGSIONAL" && isDescendantOf(p, deputiPersidanganId)
    );

    if (fungsionalPersidangan.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of fungsionalPersidangan) {
            const sub = findFungsionalSubfolder(item);
            if (!subfolders[sub]) {
                subfolders[sub] = {
                    folder: `14-Fungsional Dep Persidangan/${sub}`,
                    items: []
                };
            }
            subfolders[sub].items.push(item);
        }
        structure["persidangan_fungsional"] = {
            folder: "14-Fungsional Dep Persidangan",
            items: [],
            subfolders
        };
    }

    // 15. Fungsional Inspektorat
    const fungsionalInspektorat = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN FUNGSIONAL" && isDescendantOf(p, inspektoratId)
    );

    if (fungsionalInspektorat.length > 0) {
        structure["inspektorat_fungsional"] = {
            folder: "15-Fungsional Inspektorat",
            items: fungsionalInspektorat
        };
    }

    // 16. Fungsional Kantor DPD Provinsi
    const fungsionalKantor = petaWithABK.filter(p =>
        p.jenis_jabatan === "JABATAN FUNGSIONAL" &&
        isDescendantOf(p, sekjenId) &&
        (p.nama_jabatan?.toLowerCase().includes('provinsi') || p.unit_kerja?.toLowerCase().includes('provinsi')) &&
        !isDescendantOf(p, deputiAdminId) &&
        !isDescendantOf(p, deputiPersidanganId) &&
        !isDescendantOf(p, inspektoratId)
    );

    if (fungsionalKantor.length > 0) {
        const subfolders: { [key: string]: { folder: string; items: PetaJabatanWithABK[] } } = {};
        for (const item of fungsionalKantor) {
            const provinsi = extractProvinsi(item);
            const sub = findFungsionalSubfolder(item);
            const key = `${provinsi}/${sub}`;
            if (!subfolders[key]) {
                subfolders[key] = {
                    folder: `16-Fungsional Kantor DPD Provinsi/${provinsi}/${sub}`,
                    items: []
                };
            }
            subfolders[key].items.push(item);
        }
        structure["kantor_fungsional"] = {
            folder: "16-Fungsional Kantor DPD Provinsi",
            items: [],
            subfolders
        };
    }

    return structure;
}

async function generateAndSavePDF(
    petaId: string,
    namaJabatan: string,
    workDir: string,
    folderPath: string,
    suffix: string = '',
    pageCounter?: { current: number }
): Promise<void> {
    try {
        // Get anjab data
        const data = await getAnjabByIdOrSlug(petaId);
        if (!data) {
            throw new Error(`Anjab not found for ID: ${petaId}`);
        }

        // Generate HTML
        const html = buildAnjabHtml(data);

        // Generate PDF using puppeteer
        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on("request", (r) => {
            if (r.resourceType() === "image") r.abort();
            else r.continue();
        });

        await page.setContent(html, { waitUntil: "load" });
        const rawPdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "2cm",
                bottom: "3.5cm",
                left: "2.5cm",
                right: "2.3cm"
            }
        });
        await page.close();

        let finalPdfBuffer = rawPdfBuffer;

        if (pageCounter) {
            const pdfDoc = await PDFDocument.load(rawPdfBuffer);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();

            for (let i = 0; i < pages.length; i++) {
                const pdfPage = pages[i];
                const { width } = pdfPage.getSize();
                const text = `${pageCounter.current + i}`;
                const fontSize = 11;
                const textWidth = font.widthOfTextAtSize(text, fontSize);

                pdfPage.drawText(text, {
                    x: width / 2 - textWidth / 2,
                    y: 15,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }

            pageCounter.current += pages.length;
            const savedBytes = await pdfDoc.save();
            finalPdfBuffer = Buffer.from(savedBytes);
        }

        // Save to file — ensure target directory exists before writing
        const fileName = sanitizeFileName(namaJabatan);
        const targetDir = path.join(workDir, folderPath);
        fs.mkdirSync(targetDir, { recursive: true });
        const filePath = path.join(targetDir, `${fileName}${suffix}.pdf`);
        fs.writeFileSync(filePath, finalPdfBuffer);
        console.log(`[download-bulk] Saved PDF: ${filePath}`);
    } catch (error) {
        console.error(`Error generating PDF for ${namaJabatan}:`, error);
        throw error;
    }
}

async function generateRawPDFBuffer(
    petaId: string,
    namaJabatan: string
): Promise<Buffer> {
    try {
        const data = await getAnjabByIdOrSlug(petaId);
        if (!data) {
            throw new Error(`Anjab not found for ID: ${petaId}`);
        }

        const html = buildAnjabHtml(data);
        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on("request", (r) => {
            if (r.resourceType() === "image") r.abort();
            else r.continue();
        });

        await page.setContent(html, { waitUntil: "load" });
        const rawPdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "2cm",
                bottom: "2.38cm",
                left: "2.5cm",
                right: "2.3cm"
            }
        });
        await page.close();

        return Buffer.from(rawPdfBuffer);
    } catch (error) {
        console.error(`Error generating raw PDF for ${namaJabatan}:`, error);
        throw error;
    }
}

function getDFSItems(
    allPetaJabatan: PetaJabatanWithABK[],
    rootNodeNameMatcher: string
): PetaJabatanWithABK[] {
    const childrenMap = new Map<string | null, PetaJabatanWithABK[]>();
    for (const item of allPetaJabatan) {
        const parentId = item.parent_id || null;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(item);
    }

    const result: PetaJabatanWithABK[] = [];
    
    // Normal DFS traversal for subtrees
    function traverse(nodeId: string | null) {
        const children = childrenMap.get(nodeId) || [];
        for (const child of children) {
            result.push(child);
            traverse(child.peta_id);
        }
    }

    const rootNodes = allPetaJabatan.filter(p => p.nama_jabatan?.toLowerCase().includes(rootNodeNameMatcher));
    for (const root of rootNodes) {
        result.push(root); // Push Root (Setjen)

        let rootChildren = childrenMap.get(root.peta_id) || [];
        
        // Group A: Specifically the two Deputi nodes
        const deputiAdm = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi"));
        const deputiPersidangan = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan"));
        
        const groupA: PetaJabatanWithABK[] = [];
        if (deputiAdm) groupA.push(deputiAdm);
        if (deputiPersidangan) groupA.push(deputiPersidangan);
        
        // Group B: The rest (Inspektorat, Biro, Kantor, dll)
        const groupB = rootChildren.filter(c => 
            !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi") && 
            !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan")
        );

        // 1. Push just the Eselon 1 nodes of Group A first
        for (const child of groupA) {
            result.push(child);
        }

        // 2. Then traverse the subtrees of Group A
        for (const child of groupA) {
            traverse(child.peta_id);
        }
        
        // 3. For Group B, do normal DFS (push node, then traverse its children)
        for (const child of groupB) {
            result.push(child);
            traverse(child.peta_id);
        }
    }

    return result;
}
