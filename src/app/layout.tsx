import localFont from 'next/font/local';
import './globals.css';

import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { MeProvider } from '@/context/MeContext';
import { icons } from 'lucide-react';

export const metadata = {
  title: 'Pandawa - Ortala',
  // Point favicon to the root asset so replacing /public/favicon.ico updates tabs.
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

const tahoma = localFont({
  src: [
    {
      path: '../../fonts/tahoma/tahoma.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../fonts/tahoma/tahomabd.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-tahoma',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${tahoma.className} dark:bg-gray-900`}>
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
