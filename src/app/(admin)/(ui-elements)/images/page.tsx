import React, {Suspense} from "react";
import type {Metadata} from "next";
import ImagesClient from "./ImagesClient";

export const dynamic = "force-dynamic"; // cegah pre-render statis yang bikin error
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Next.js Images | TailAdmin - Next.js Dashboard Template",
    description:
        "This is Next.js Images page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ImagesClient/>
        </Suspense>
    );
}
