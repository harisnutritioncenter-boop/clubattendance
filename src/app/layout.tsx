import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from 'sonner';
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/shared/auth-provider";
import { AuthGuard } from "@/components/shared/auth-guard";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Club Attendance CRM",
  description: "Internal CRM and Ledger for Club Attendance",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Club Attendance"
  }
};

export const viewport: Viewport = {
  themeColor: "#16a34a"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>
          <AuthProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </AuthProvider>
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
