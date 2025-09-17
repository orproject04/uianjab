import React, {Suspense} from "react";
import type {Metadata} from "next";
import AuthLayoutClient from "./AuthLayoutClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Auth",
    description: "Halaman autentikasi",
};

export default function Layout({children}: { children: React.ReactNode }) {
    // children-nya akan dipass ke client layout
    return (
        <Suspense fallback={null}>
            <AuthLayoutClient>{children}</AuthLayoutClient>
        </Suspense>
    );
}
