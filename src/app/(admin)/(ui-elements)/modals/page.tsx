import React, {Suspense} from "react";
import type {Metadata} from "next";
import ModalsClient from "./ModalsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Next.js Modals | TailAdmin - Next.js Dashboard Template",
    description:
        "This is Next.js Modals page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ModalsClient/>
        </Suspense>
    );
}
