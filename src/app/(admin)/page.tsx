// app/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import HomeSearch from "@/components/home/HomeSearch";
import AddJabatanModal from "@/components/home/AddJabatanModal";
import { useMe } from "@/context/MeContext";

type Me = { id: string; email: string; role: string; full_name: string | null };

export default function HomePage() {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);

  const { me, isAdmin } = useMe();
  const displayName =
    me?.full_name?.trim() ||
    (me?.email ? me.email.split("@")[0] : "User");

  const quickActions = [
    {
      title: "Dashboard Anjab & ABK",
      description: "Pantau total jabatan, kebutuhan pegawai, dan gap secara real-time.",
      href: "/dashboard",
      badge: "Analitik",
      color: "bg-brand-50 text-brand-700 border-brand-100",
    },
    {
      title: "Peta Jabatan",
      description: "Lihat struktur organisasi multi-level dan detail per jabatan.",
      href: "/peta-jabatan",
      badge: "Struktur",
      color: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      title: "Master Anjab",
      description: "Kelola dokumen Analisis Jabatan, edit konten, dan ekspor Word/PDF.",
      href: "/anjab/master",
      badge: "Dokumen",
      color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
    {
      title: "Tambah Jabatan Baru",
      description: "Buat node jabatan baru dengan auto-matching ke master Anjab.",
      onClick: () => setShowAddModal(true),
      badge: "Aksi Cepat",
      color: "bg-orange-50 text-orange-700 border-orange-100",
    },
    {
      title: "Pencocokan Anjab",
      description: "Cek kesesuaian antara peta jabatan dan master Anjab dengan fuzzy match.",
      href: "/anjab/match",
      badge: "Auto-match",
      color: "bg-amber-50 text-amber-700 border-amber-100",
    },
    {
      title: "Sinkronisasi Pegawai",
      description: "Perbarui data pegawai agar perhitungan kebutuhan selalu akurat.",
      href: "/sync-pegawai",
      badge: "Integrasi",
      color: "bg-rose-50 text-rose-700 border-rose-100",
    },
  ];

  const featureColumns = [
    {
      title: "Analisis Jabatan",
      points: [
        "Upload & generate dokumen Word/PDF dari master Anjab",
        "Auto-matching peta jabatan ke master menggunakan similarity score",
        "Pantau kebutuhan vs bezetting langsung di dashboard",
      ],
    },
    {
      title: "Peta Jabatan",
      points: [
        "Struktur organisasi hierarkis dengan drag & drop",
        "Label lokasi pusat/daerah dan jenis jabatan (JPT, Administrator, Pengawas, Fungsional)",
        "Detail tiap jabatan lengkap dengan pejabat dan kebutuhan pegawai",
      ],
    },
    {
      title: "Operasional & ABK",
      points: [
        "Hitung kebutuhan pegawai berbasis beban kerja",
        "Sinkronisasi data pegawai agar perhitungan selalu mutakhir",
        "Role-based access (Admin/Editor/User) dengan alur autentikasi lengkap",
      ],
    },
  ];

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <div className="h-full bg-gradient-to-b from-brand-25 via-white to-blue-light-25">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-12 space-y-8">
        {/* Hero */}
        <div className="rounded-3xl bg-white/80 shadow-lg ring-1 ring-black/5 overflow-hidden">
          <div className="grid gap-8 md:grid-cols-2 p-8 md:p-12">
            <div className="space-y-4">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Selamat datang, {displayName}.
              </h1>
              <p className="text-gray-600 leading-relaxed">
                Silahkan pilih menu untuk memulai pengelolaan data.
              </p>
              <div className="flex flex-row gap-3 items-center">
                {isAdmin && (
                  <button
                    onClick={() => handleNavigate("/dashboard")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 whitespace-nowrap"
                  >
                    Buka Dashboard
                  </button>
                )}
                <button
                  onClick={() => handleNavigate("/peta-jabatan")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:border-brand-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-200 whitespace-nowrap"
                >
                  Lihat Peta Jabatan
                </button>
              </div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-1 md:-inset-2 bg-gradient-to-br from-brand-200/40 via-white to-blue-light-200/50 blur-3xl" />
              <div className="relative">
                <Image
                  src="/images/logo/pandawa-icon.png"
                  alt="Logo PANDAWA"
                  className="w-44 h-44 md:w-56 md:h-56 drop-shadow-xl"
                  width={224}
                  height={224}
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* Search + quick create */}
        <div className={`grid gap-6 ${isAdmin ? 'md:grid-cols-[1.35fr,1fr]' : 'md:grid-cols-1'}`}>
          <div className="rounded-2xl bg-white shadow-md ring-1 ring-gray-100 p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Cari Jabatan atau Unit</p>
                <p className="text-sm text-gray-500">Langsung lompat ke jabatan tertentu.</p>
              </div>
              <span className="hidden md:inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                Search & Navigate
              </span>
            </div>
            <HomeSearch />
          </div>

          {isAdmin && (
            <div className="rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-500 text-white shadow-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.08em] text-gray-100 font-semibold">Aksi Cepat</p>
                  <h3 className="text-xl font-bold mt-1">Tambah Jabatan</h3>
                </div>
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white/10 text-lg font-semibold">
                  +
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-gray-900 px-4 py-2.5 text-sm font-semibold shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white"
              >
                Buka Form Tambah
              </button>
            </div>
          )}
        </div>

        {/* Quick actions - Admin only */}
        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => {
                  if (action.onClick) {
                    action.onClick();
                    return;
                  }
                  if (action.href) {
                    handleNavigate(action.href);
                  }
                }}
                className="group w-full text-left rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-200 hover:border-brand-500 dark:hover:bg-gray-800"
              >
                <div className="p-5 space-y-3">
                  <div className="space-y-2">
                    {action.badge && (
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full border ${action.color}`}>
                        {action.badge}
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900">{action.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{action.description}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:gap-2">
                    {action.onClick ? "Buka form" : "Pergi ke halaman"} →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Add Jabatan Modal */}
      <AddJabatanModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
