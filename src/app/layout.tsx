import styles from "./layout.module.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GPS Tutor | Sign in",
  description: "Sign in to your GPS Tutor account.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={[geistSans.variable, geistMono.variable, styles.utility_4386e19f].filter(Boolean).join(" ")}
    >
      <body className={styles.utility_54900b22}>{children}</body>
    </html>
  );
}
