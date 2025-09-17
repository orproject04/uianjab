import React, {Suspense} from "react";
import type {Metadata} from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Reset Password",
    description: "Atur ulang password",
};

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ResetPasswordForm/>
        </Suspense>
    );
}
