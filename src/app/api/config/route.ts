// src/app/api/config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromReq, hasRole } from '@/lib/auth';
import { handleCorsOptions, addCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
    return handleCorsOptions(req);
}

export async function GET(req: NextRequest) {
    const origin = req.headers.get('origin');
    const user = getUserFromReq(req);

    // Endpoint config dilindungi autentikasi admin (admin, admin-jf, admin-akk)
    if (!user || !hasRole(user, ['admin', 'admin-jf', 'admin-akk'])) {
        const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        return addCorsHeaders(response, origin);
    }

    // Hanya mengembalikan flag non-sensitif (tanpa membocorkan URL/kredensial backend CMB/OKK)
    const response = NextResponse.json({
        syncEnabled: true,
        externalApiPerPage: parseInt(process.env.EXTERNAL_API_PER_PAGE || '100', 10),
    });
    return addCorsHeaders(response, origin);
}
