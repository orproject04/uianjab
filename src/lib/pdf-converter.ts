import fs from "fs/promises";
import path from "path";
import util from "util";
import { exec } from "child_process";

const execAsync = util.promisify(exec);

// Global Mutex untuk mencegah konversi LibreOffice berjalan paralel
// LibreOffice di Windows akan crash (Exit 1) jika dipanggil bersamaan
let isConverting = false;
const conversionQueue: (() => void)[] = [];

async function acquireLock(): Promise<void> {
    if (!isConverting) {
        isConverting = true;
        return;
    }
    return new Promise(resolve => conversionQueue.push(resolve));
}

function releaseLock() {
    if (conversionQueue.length > 0) {
        const next = conversionQueue.shift();
        if (next) next();
    } else {
        isConverting = false;
    }
}

const CACHE_DIR = path.join(process.cwd(), "storage", "pdf-cache");

export async function convertDocxBufferToPdfBuffer(docxBuffer: Buffer, fileId: string): Promise<Buffer> {
    await fs.mkdir(CACHE_DIR, {recursive: true});

    const timestamp = Date.now();
    const tempDocxName = `temp-${fileId}-${timestamp}.docx`;
    const tempPdfName = `temp-${fileId}-${timestamp}.pdf`;
    const tempDocxPath = path.join(CACHE_DIR, tempDocxName);
    const tempPdfPath = path.join(CACHE_DIR, tempPdfName);
    
    await fs.writeFile(tempDocxPath, docxBuffer);
    
    try {
        await acquireLock();
        // Jalankan soffice (LibreOffice CLI) dengan timeout 3 menit agar tidak nyangkut selamanya
        await execAsync(`soffice --headless --convert-to pdf "${tempDocxPath}" --outdir "${CACHE_DIR}"`, { timeout: 180000 });
    } catch (execErr) {
        console.error("LibreOffice conversion failed:", execErr);
        await fs.unlink(tempDocxPath).catch(() => {});
        releaseLock();
        throw new Error("Gagal mengonversi dokumen ke PDF. Pastikan LibreOffice terinstal di server.");
    }
    
    releaseLock();
    
    let pdfBuffer: Buffer;
    try {
        pdfBuffer = await fs.readFile(tempPdfPath);
    } catch (readErr) {
        console.error("Failed to read generated PDF:", readErr);
        await fs.unlink(tempDocxPath).catch(() => {});
        throw new Error("Gagal membaca hasil PDF");
    }
    
    // Cleanup temp files
    await fs.unlink(tempDocxPath).catch(() => {});
    await fs.unlink(tempPdfPath).catch(() => {});
    
    return pdfBuffer;
}
