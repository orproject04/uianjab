import React, {Suspense} from "react";
import type {Metadata} from "next";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
    return (
        <Suspense fallback={null}>
            <SignInForm/>
        </Suspense>
    );
}
