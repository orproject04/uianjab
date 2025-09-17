import {Metadata} from "next";
import React, {Suspense} from "react";
import AlertsClient from "./AlertsClient";

// cegah prerender supaya tidak ada CSR bailout saat build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Next.js Alerts | TailAdmin - Next.js Dashboard Template",
    description:
        "This is Next.js Alerts page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function AlertsPage() {
    return (
        <Suspense fallback={null}>
            <AlertsClient/>
        </Suspense>
    );
}
