import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FactoryLens AI",
  description: "First-off check guidance for the Quality Technician.",
};

export const viewport: Viewport = {
  // Matches --fl-bg in docs/theme/tokens.css (metadata cannot read CSS variables).
  themeColor: "#f1f3f2",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-page text-ink">{children}</body>
    </html>
  );
}
