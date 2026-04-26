import type { Metadata } from "next";
import { Inter, Special_Elite, JetBrains_Mono, Cutive_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

const typewriter = Special_Elite({
  variable: "--font-typewriter",
  subsets: ["latin"],
  weight: "400"
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

const cutive = Cutive_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  weight: "400"
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
      <body className={`${sans.variable} ${typewriter.variable} ${mono.variable} ${cutive.variable}`}>{children}</body>
    </html>
  );
}
