import { NextResponse } from "next/server";
import puppeteer, { PaperFormat } from "puppeteer";
import { PDFDocument } from "pdf-lib";

export async function POST(req: Request) {
  try {
    const { jobs } = await req.json();
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
    }

    // Launch Puppeteer browser
    // In production, you might need executablePath or args for sandboxing depending on the OS
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
    
    // Create an empty PDFDocument for merging
    const mergedPdf = await PDFDocument.create();

    const page = await browser.newPage();
    for (const job of jobs) {
      
      // We set the viewport roughly to A4 landscape size just for initial layout
      await page.setViewport({ width: 1122, height: 793, deviceScaleFactor: 1 });
      
      // Load the HTML string provided by the client
      await page.setContent(job.html, { waitUntil: "domcontentloaded" as any });

      // Apply auto-zoom based on the requested paper size
      await page.evaluate((paperSize) => {
         const wrap = document.querySelector('.org-root') as HTMLElement;
         const header = document.querySelector('.page-header-container') as HTMLElement;
         const container = document.querySelector('.page-container') as HTMLElement;
         
         if (wrap && header && container) {
            const contentW = Math.max(wrap.scrollWidth, header.scrollWidth);
            const contentH = wrap.scrollHeight + header.scrollHeight + 40;
            
            // Define max dimensions based on paper size (at 96dpi approx)
            let maxW = 1050; // default A4
            let maxH = 720;
            
            if (paperSize === "A3") {
              maxW = 1500;
              maxH = 1050;
            } else if (paperSize === "F4") {
              maxW = 1180;
              maxH = 750;
            } else if (paperSize === "Legal") {
              maxW = 1250;
              maxH = 750;
            }

            const scale = Math.min(maxW / contentW, maxH / contentH, 1);
            
            if (scale < 1) {
              container.style.zoom = scale.toString();
            }
         }
      }, job.paper);

      // Define paper dimensions
      let pdfOptions: any = {
        printBackground: true,
        landscape: true,
      };

      if (job.paper === "F4") {
        // F4 is approx 215 x 330 mm
        pdfOptions.width = "330mm";
        pdfOptions.height = "215mm";
      } else {
        pdfOptions.format = job.paper as PaperFormat; // A4, A3, Legal
      }

      // Generate the PDF for this single unit
      const pdfBuffer = await page.pdf(pdfOptions);
      
      // Load and append to the merged document
      const singlePdf = await PDFDocument.load(pdfBuffer);
      const copiedPages = await mergedPdf.copyPages(singlePdf, singlePdf.getPageIndices());
      copiedPages.forEach((p) => mergedPdf.addPage(p));

    }
    
    await page.close();
    await browser.close();

    // Save the merged document to bytes
    const pdfBytes = await mergedPdf.save();
    const nodeBuffer = Buffer.from(pdfBytes);
    
    return new NextResponse(nodeBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Peta_Jabatan_Kustom.pdf"'
      }
    });

  } catch (error: any) {
    console.error("Print Bulk Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
