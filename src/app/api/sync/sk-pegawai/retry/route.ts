// src/app/api/sync/sk-pegawai/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import { retrySkErrors } from "@/lib/pegawai-sk-sync";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  
  try {
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ["admin"])) {
      const response = NextResponse.json(
        { error: "Forbidden, hanya admin yang dapat melakukan sinkronisasi" },
        { status: 403 }
      );
      return addCorsHeaders(response, origin);
    }

    const result = await retrySkErrors();
    
    const response = NextResponse.json({
      ok: true,
      message: "Retry sinkronisasi selesai",
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
    console.error('[SYNC SK RETRY] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal melakukan retry sinkronisasi SK",
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
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ["admin"])) {
      const response = NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
      return addCorsHeaders(response, origin);
    }

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let syncResult: any = null;
        
        try {
          syncResult = await retrySkErrors((message, pct) => {
            const data = JSON.stringify({
              progress: pct,
              total: 100,
              message: message,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
          
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
    console.error('[SYNC SK RETRY STREAM] Error:', error);
    const response = NextResponse.json(
      { error: "Gagal memulai retry sinkronisasi SK" },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
