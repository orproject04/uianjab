import React, {Suspense} from "react";
import AdminLayoutClient from "./AdminLayoutClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Layout({children}: { children: React.ReactNode }) {
    return (
        <Suspense fallback={null}>
            <AdminLayoutClient>{children}</AdminLayoutClient>
        </Suspense>
    );
}
