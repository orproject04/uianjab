import React, {Suspense} from "react";
import type {Metadata} from "next";
import AvatarsClient from "./AvatarsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Next.js Avatars | TailAdmin - Next.js Dashboard Template",
    description:
        "This is Next.js Avatars page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AvatarsClient/>
        </Suspense>
    );
}
