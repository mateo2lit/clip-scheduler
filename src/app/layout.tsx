import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
