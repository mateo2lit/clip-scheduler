import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlobalSpotlight from "@/components/GlobalSpotlight";

export const metadata: Metadata = {
  title: "Clip Dash",
  description: "Schedule and auto-publish videos across all your platforms from one dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-JMCPTQSXGB" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-JMCPTQSXGB');
        `}</Script>
        <GlobalSpotlight>{children}</GlobalSpotlight>
      </body>
    </html>
  );
}
