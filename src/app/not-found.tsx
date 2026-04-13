import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist. Head back to Clip Dash to schedule your videos.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0e17] px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
        <span className="text-4xl">404</span>
      </div>
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-3 max-w-md text-base text-white/50">
        The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:from-blue-400 hover:to-purple-400"
        >
          Back to Home
        </Link>
        <Link
          href="/blog"
          className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
        >
          Read the Blog
        </Link>
      </div>
    </div>
  );
}
