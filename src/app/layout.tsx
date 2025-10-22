import { Outfit } from 'next/font/google';
import './globals.css';

import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { MeProvider } from '@/context/MeContext';
import { icons } from 'lucide-react';

export const metadata = {
  icons: {
    icon: '/images/favicon.ico',
    },
  };

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <SidebarProvider>
            <MeProvider>
              {children}
            </MeProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
