import React, {Suspense} from 'react';
import type {Metadata} from 'next';
import PetaJabatanClient from './PetaJabatanClient';

export const dynamic = 'force-dynamic'; // cegah pre-render statis yang bikin error saat build
export const revalidate = 0;            // jangan cache (opsional)

export const metadata: Metadata = {
    title: 'Peta Jabatan',
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <PetaJabatanClient/>
        </Suspense>
    );
}
