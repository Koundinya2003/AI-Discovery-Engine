import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Discovery Engine — wishlist to purchase",
  description:
    "Ranked opportunity areas for online fashion shopping, discovered from public app-store, Reddit and YouTube conversation with published sampling, taxonomies and scoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-de-page text-de-text-primary">
        {children}
        <footer className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4 text-xs text-de-text-muted sm:px-6 lg:px-8">
          <Link href="/methodology" className="underline decoration-de-border underline-offset-4 hover:text-de-text-secondary">
            Methodology, sources and limitations
          </Link>
        </footer>
      </body>
    </html>
  );
}
