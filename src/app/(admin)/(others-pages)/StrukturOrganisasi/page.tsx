import React, {Suspense} from 'react';
import type {Metadata} from 'next';
import StrukturOrganisasiClient from './StrukturOrganisasiClient';

export const dynamic = 'force-dynamic'; // cegah pre-render statis yang bikin error saat build
export const revalidate = 0;            // jangan cache (opsional)

export const metadata: Metadata = {
    title: 'Struktur Organisasi',
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <StrukturOrganisasiClient/>
        </Suspense>
    );
}
