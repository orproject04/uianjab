import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function POST(req: Request) {
  try {
    const { html, unitName } = await req.json();
    if (!html) {
      return NextResponse.json({ error: "No html provided" }, { status: 400 });
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" as any });

    // Resize the viewport to fit the full rendered content so the screenshot
    // isn't cropped. `.page-container`/`.org-wrap` are width:100% boxes, so their
    // own scrollWidth stays pegged to the viewport even when the tree overflows
    // them (overflow:visible doesn't grow a fixed-width box's scrollWidth). The
    // tree's real size only shows up on `.org-root`, which is inline-flex and so
    // shrink-wraps to its actual rendered width/height — same element print-bulk
    // measures for its zoom calculation.
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

    await page.close();
    await browser.close();

    const safeName = String(unitName || "Peta_Jabatan").replace(/[^a-zA-Z0-9]+/g, "_");

    return new NextResponse(Buffer.from(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="Peta_Jabatan_${safeName}.png"`
      }
    });
  } catch (error: any) {
    console.error("Print Image Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
