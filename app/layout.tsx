import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/dashboard-layout";

const inter = localFont({
  src: [
    {
      path: "../public/Inter.ttf",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../public/Inter-Italic.ttf",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Basis Portal",
  description: "Operations workspace dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </TooltipProvider>
      </body>
    </html>
  );
}
