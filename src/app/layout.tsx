import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Clip Dash — Upload Once, Post to Every Platform",
    template: "%s — Clip Dash",
  },
  description:
    "Upload one video and auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X simultaneously. The cross-posting tool built for streamers and video creators.",
  keywords: [
    "post video to multiple platforms",
    "cross post videos",
    "upload video to all social media at once",
    "video scheduler for streamers",
    "repurpose twitch clips",
    "repurpose kick clips",
    "youtube tiktok instagram scheduler",
    "multi platform video publishing",
    "social media video automation",
  ],
  metadataBase: new URL("https://clipdash.org"),
  openGraph: {
    type: "website",
    siteName: "Clip Dash",
    title: "Clip Dash — Upload Once, Post to Every Platform",
    description:
      "Upload one video and auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X simultaneously. Built for streamers and video creators.",
    url: "https://clipdash.org",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Clip Dash — Upload Once, Post Everywhere" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clip Dash — Upload Once, Post to Every Platform",
    description:
      "Stop logging into 7 apps to post the same video. Clip Dash auto-publishes to all platforms from one upload.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0a0e17" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900&family=Oswald:wght@400;700&family=Anton&family=Bebas+Neue&family=Poppins:wght@400;700;900&family=Rubik:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-JMCPTQSXGB" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-JMCPTQSXGB', {
            campaign_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
            campaign_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
            campaign_name: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
            campaign_term: new URLSearchParams(window.location.search).get('utm_term') || undefined,
            campaign_content: new URLSearchParams(window.location.search).get('utm_content') || undefined
          });
        `}</Script>
        <Script
          id="schema-software"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Clip Dash",
              url: "https://clipdash.org",
              applicationCategory: "VideoEditingApplication",
              operatingSystem: "Web",
              description:
                "Cross-posting tool for video creators and streamers. Upload one video and auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X simultaneously.",
              offers: {
                "@type": "Offer",
                price: "9.99",
                priceCurrency: "USD",
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: "9.99",
                  priceCurrency: "USD",
                  billingDuration: "P1M",
                },
              },
              featureList: [
                "Upload once, publish to 7 platforms simultaneously",
                "Import clips directly from Twitch and Kick URLs",
                "Multiple accounts per platform",
                "AI hashtag suggestions",
                "Smart queue scheduling",
                "Unified comments inbox",
                "Team collaboration for up to 5 members",
                "Content calendar",
                "30-day analytics dashboard",
              ],
              screenshot: "https://clipdash.org/opengraph-image",
              softwareVersion: "1.0",
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
