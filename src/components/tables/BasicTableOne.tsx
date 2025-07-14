import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";

import Badge from "../ui/badge/Badge";
import Image from "next/image";

interface Order {
  id: number;
  documentName: string;
  created: string;
  type: string;
  action: {
    images: string[];
  };
}

// Define the table data using the interface
const tableData: Order[] = [
  {
    id: 1,
    documentName: "Analisis Jabatan PKSTI",
    created: "1 hari yang lalu",
    type: "Anjab",
    action: {
      images: [
        "/images/user/delete-icon.svg",
        "/images/user/edit-icon.jpg",
        "/images/user/more-icon.jpg",
      ],
    },
  },
  {
    id: 2,
    documentName: "Analisis Beban Kerja PKSTI",
    created: "1 hari yang lalu",
    type: "ABK",
    action: {
      images: [
        "/images/icons/delete-icon.svg",
        "/images/icons/edit-icon.svg",
        "/images/icons/more-icon.svg",
      ],
    },
  },
  {
    id: 3,
    documentName: "Analisis Jabatan Penata Keprotokolan",
    created: "1 hari yang lalu",
    type: "Anjab",
    action: {
      images: [
        "/icons/delete.svg",
        "/icons/edit.svg",
        "/icons/more.svg",
      ],
    },
  },
];

export default function BasicTableOne() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          <Table>
            {/* Table Header */}
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Nama Dokumen
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Waktu Dibuat
                </TableCell>
                                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Tipe Dokumen
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Aksi
                </TableCell>
              </TableRow>
            </TableHeader>

            {/* Table Body */}
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {tableData.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-5 py-4 sm:px-6 text-start">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {order.documentName}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.created}
                  </TableCell>
                                    <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.type}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <div className="flex space-x-2">
                      {order.action.images.map((actionIcon, index) => (
                        <div
                          key={index}
                          className="w-8 h-8 border-2 border-white rounded-full dark:border-gray-900"
                        >
                          <Image
                            width={32}
                            height={32}
                            src={actionIcon}
                            alt=""
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
