// src/app/api/sync/sk-pegawai/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import { runSkSync } from "@/lib/pegawai-sk-sync";

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
    const result = await runSkSync();
    
    const response = NextResponse.json({
      ok: true,
      message: "Sinkronisasi selesai",
      result: {
        totalFetched: result.totalFetched,
        totalMatched: result.totalMatched,
        totalUnmatched: result.unmatchedRecords.length,
        totalInactive: result.totalInactive,
        errors: result.errors,
        logFilePaths: result.logFilePaths,
      },
    });
    
    return addCorsHeaders(response, origin);
  } catch (error: any) {
    console.error('[SYNC SK PEGAWAI] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal melakukan sinkronisasi SK",
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
          syncResult = await runSkSync((message, pct) => {
            const data = JSON.stringify({
              progress: pct,
              total: 100,
              message: message,
            });
            
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
          
          // Send completion message with result
          const finalData = JSON.stringify({
            progress: 100,
            total: 100,
            message: 'Selesai',
            done: true,
            result: {
              totalFetched: syncResult.totalFetched,
              totalMatched: syncResult.totalMatched,
              totalUnmatched: syncResult.unmatchedRecords.length,
              totalInactive: syncResult.totalInactive,
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
    console.error('[SYNC SK PEGAWAI STREAM] Error:', error);
    const response = NextResponse.json(
      { error: "Gagal memulai sinkronisasi SK" },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
