import React, {Suspense} from "react";
import type {Metadata} from "next";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Daftar Akun",
    description: "Buat akun baru",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <SignupForm/>
        </Suspense>
    );
}
