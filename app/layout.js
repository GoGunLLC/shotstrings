import "./globals.css";
import { Archivo, Space_Mono } from "next/font/google";
import { GoogleTagManager } from "@next/third-parties/google";
import FeedbackWidget from "./components/FeedbackWidget";
import SiteFooter from "./components/SiteFooter";

const GTM_ID = "GTM-PHH9J2HR";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = "https://shotstrings.com";
const TITLE = "ShotStrings — Airgun shot string database";
const DESCRIPTION =
  "The largest database of real airgun shot strings. Search, compare, and verify airgun performance.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ShotStrings",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ShotStrings — the largest database of real airgun shot strings.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${archivo.variable} ${spaceMono.variable}`}>
      <GoogleTagManager gtmId={GTM_ID} />
      <body>
        {children}
        <SiteFooter />
        <FeedbackWidget />
      </body>
    </html>
  );
}
