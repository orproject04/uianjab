// app/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import HomeSearch from "@/components/home/HomeSearch";
import AddJabatanModal from "@/components/home/AddJabatanModal";
import {useMe} from "@/context/MeContext";

type Me = { id: string; email: string; role: string; full_name: string | null };

export default function HomePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const {me} = useMe();
  const displayName =
        me?.full_name?.trim() ||
        (me?.email ? me.email.split("@")[0] : "User");

  return (
    <div className="w-full min-h-[calc(100dvh-200px)] flex items-start justify-center">
      {/* Centered canvas */}
      <div className="w-full max-w-3xl pt-8 px-4 md:px-6">
        {/* Heading + subtle divider (left-aligned) */}
        <h1 className="text-gray-800 text-lg font-semibold">Selamat Datang, {displayName}</h1>
        <div className="mt-2 h-px w-full bg-gray-200" />

        {/* Centered logo */}
        <div className="mt-8 md:mt-10 flex justify-center">
          {/* Replace src with your logo asset */}
          <Image
            src="/images/logo/pandawa-icon.png"
            alt="Logo"
            className="w-80 h-80 md:w-40 md:h-40"
            width={120}
            height={120}
          />
        </div>

        {/* Search box */}
        <div className="mt-6">
          <HomeSearch />
        </div>

        {/* Primary action button (centered) */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-600"
          >
            <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-white/20 text-white text-base leading-none">
              +
            </span>
            Tambah Jabatan
          </button>
        </div>
      </div>

      {/* Add Jabatan Modal */}
      <AddJabatanModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
