// src/app/api/sync/pegawai/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import { syncPegawaiToPetaJabatan } from "@/lib/pegawai-sync";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  
  try {
    // Check authentication and authorization
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ["admin"])) {
      const response = NextResponse.json(
        { error: "Forbidden, hanya admin yang dapat melakukan sinkronisasi" },
        { status: 403 }
      );
      return addCorsHeaders(response, origin);
    }

    // Start sync process
    const result = await syncPegawaiToPetaJabatan(undefined, user.email || user.full_name || user.id);
    
    const response = NextResponse.json({
      ok: true,
      message: "Sinkronisasi selesai",
      result: {
        totalFetched: result.totalFetched,
        totalMatched: result.totalMatched,
        totalUpdated: result.totalUpdated,
        totalUnmatched: result.unmatchedRecords.length,
        errors: result.errors,
        logFilePaths: result.logFilePaths,
      },
    });
    
    return addCorsHeaders(response, origin);
  } catch (error: any) {
    console.error('[SYNC PEGAWAI] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal melakukan sinkronisasi",
        detail: error.message 
      },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}

// GET endpoint for streaming progress (Server-Sent Events)
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  
  try {
    // Check authentication and authorization
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ["admin"])) {
      const response = NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
      return addCorsHeaders(response, origin);
    }

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let syncResult: any = null;
        
        try {
          syncResult = await syncPegawaiToPetaJabatan((current, total, message) => {
            const data = JSON.stringify({
              progress: current,
              total: total,
              message: message,
            });
            
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }, user?.email || user?.full_name || user?.id);
          
          // Send completion message with result
          const finalData = JSON.stringify({
            progress: 100,
            total: 100,
            message: 'Selesai',
            done: true,
            result: {
              totalFetched: syncResult.totalFetched,
              totalMatched: syncResult.totalMatched,
              totalUpdated: syncResult.totalUpdated,
              totalUnmatched: syncResult.unmatchedRecords.length,
              errors: syncResult.errors,
              logFilePaths: syncResult.logFilePaths,
            },
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          controller.close();
        } catch (error: any) {
          const errorData = JSON.stringify({
            error: error.message,
            done: true,
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...Object.fromEntries(
          Object.entries(
            origin ? addCorsHeaders(new NextResponse(), origin).headers : {}
          )
        ),
      },
    });
  } catch (error: any) {
    console.error('[SYNC PEGAWAI STREAM] Error:', error);
    const response = NextResponse.json(
      { error: "Gagal memulai sinkronisasi" },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
