'use client';

import React from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import VideosExample from "@/components/ui/video/VideosExample";

export default function VideosClient() {
    return (
        <div>
            <PageBreadcrumb pageTitle="Videos"/>
            <VideosExample/>
        </div>
    );
}
