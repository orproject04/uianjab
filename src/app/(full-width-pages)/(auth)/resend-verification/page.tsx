import React, {Suspense} from "react";
import type {Metadata} from "next";
import ResendVerificationForm from "./ResendVerificationForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResendVerificationPage() {
  return (
    <Suspense fallback={null}>
      <ResendVerificationForm />
    </Suspense>
  );
}

export const metadata : Metadata = {
  title: "Kirim Ulang Email Verifikasi",
  description: "Kirim ulang email verifikasi akun Anda",
};