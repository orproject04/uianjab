import React, {Suspense} from "react";
import type {Metadata} from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ForgotPasswordForm/>
        </Suspense>
    );
}
