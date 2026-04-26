import type { Metadata } from "next";
import { Special_Elite, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const typewriter = Special_Elite({
  variable: "--font-typewriter",
  subsets: ["latin"],
  weight: "400"
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "The Red String Project",
  description: "Every thread tells a story. Pull one, and the whole web unravels.",
  applicationName: "The Red String Project",
  icons: {
    icon: "/favicon.ico"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${typewriter.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
