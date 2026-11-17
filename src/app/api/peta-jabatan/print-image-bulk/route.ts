import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function POST(req: Request) {
  try {
    const { jobs } = await req.json();
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
      ]
    });

    const archive = archiver("zip", { zlib: { level: 5 } });
    const bufferStream = new PassThrough();
    archive.pipe(bufferStream);

    const chunks: Buffer[] = [];
    bufferStream.on("data", (chunk) => chunks.push(chunk));
    const zipDone = new Promise<void>((resolve, reject) => {
      bufferStream.on("end", () => resolve());
      archive.on("error", (err) => reject(err));
    });

    const page = await browser.newPage();
    const usedNames = new Set<string>();

    for (const job of jobs) {
      await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
      await page.setContent(job.html, { waitUntil: "domcontentloaded" as any });

      // Same `.org-root` sizing fix as the single-unit print-image route:
      // width:100% ancestors don't grow to fit an overflowing tree, but the
      // inline-flex org-root shrink-wraps to the tree's real rendered size.
      const dimensions = await page.evaluate(() => {
        const wrap = document.querySelector('.org-root') as HTMLElement | null;
        const header = document.querySelector('.page-header-container') as HTMLElement | null;
        const width = Math.max(wrap?.scrollWidth || 0, header?.scrollWidth || 0, document.body.scrollWidth);
        const height = (wrap?.scrollHeight || 0) + (header?.scrollHeight || 0) + 80;
        return { width, height };
      });

      await page.setViewport({
        width: Math.max(dimensions.width, 100),
        height: Math.max(dimensions.height, 100),
        deviceScaleFactor: 2,
      });

      const imageBuffer = await page.screenshot({ type: "png", fullPage: true });

      let safeName = String(job.unitName || "Peta_Jabatan").replace(/[^a-zA-Z0-9]+/g, "_");
      if (usedNames.has(safeName)) {
        let i = 2;
        while (usedNames.has(`${safeName}_${i}`)) i++;
        safeName = `${safeName}_${i}`;
      }
      usedNames.add(safeName);

      archive.append(Buffer.from(imageBuffer), { name: `Peta_Jabatan_${safeName}.png` });
    }

    await page.close();
    await browser.close();

    archive.finalize();
    await zipDone;

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="Peta_Jabatan_Seluruh_Daerah_PNG.zip"'
      }
    });
  } catch (error: any) {
    console.error("Print Image Bulk Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
