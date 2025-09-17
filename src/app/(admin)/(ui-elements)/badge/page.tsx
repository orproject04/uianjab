import React, {Suspense} from "react";
import type {Metadata} from "next";
import BadgesClient from "./BadgesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Next.js Badge | TailAdmin - Next.js Dashboard Template",
    description:
        "This is Next.js Badge page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <BadgesClient/>
        </Suspense>
    );
}
