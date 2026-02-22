import type { Metadata } from "next";
import "./globals.css";
import GlobalSpotlight from "@/components/GlobalSpotlight";

export const metadata: Metadata = {
  title: "Clip Scheduler",
  description: "Schedule clip uploads",
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
