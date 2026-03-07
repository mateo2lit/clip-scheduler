import type { Metadata } from "next";
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
        <GlobalSpotlight>{children}</GlobalSpotlight>
      </body>
    </html>
  );
}
