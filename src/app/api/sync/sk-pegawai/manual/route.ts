import { NextRequest, NextResponse } from 'next/server';
import { syncSingleNipSk } from '@/lib/pegawai-sk-sync';
import { getUserFromReq, hasRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ['admin', 'admin_jf', 'admin_akk'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { nip } = body;

    if (!nip || typeof nip !== 'string') {
      return NextResponse.json({ error: 'NIP diperlukan' }, { status: 400 });
    }

    const result = await syncSingleNipSk(nip);

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error('[MANUAL SYNC ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan internal' },
      { status: 500 }
    );
  }
}
