"use client";

import Card from "@/components/ui/card/Card";
import UploadZone from "@/components/ui/upload/UploadZone";
import React from "react";
import JsonAnjab from "@/components/form/form-elements/JsonAnjab";

export default function TestPage() {
    return (
        <div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
                <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
                    Analisis Jabatan Deputi Administrasi
                </h3>
                <Card />
                <JsonAnjab/>
            </div>
        </div>
    );
}