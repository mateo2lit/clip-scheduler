import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">
          Upload Once.  
          <span className="text-blue-500"> Post Everywhere.</span>
        </h1>

        <p className="text-sm md:text-base text-slate-400">
          A creator tool that lets you upload a clip once, organize it,
          edit titles/descriptions, and schedule it for YouTube, TikTok,
          and Shorts—all from one simple dashboard.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-semibold"
          >
            Get Started Free
          </Link>

          <a
            href="#features"
            className="px-5 py-2 rounded-md border border-slate-600 hover:bg-slate-800 text-sm"
          >
            How It Works
          </a>
        </div>

        {/* Features */}
        <div
          id="features"
          className="grid md:grid-cols-3 gap-4 pt-10 border-t border-slate-800"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left">
            <h3 className="text-sm font-semibold mb-1">Upload Clips</h3>
            <p className="text-[12px] text-slate-400">
              Store your clips with titles, descriptions, and previews.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left">
            <h3 className="text-sm font-semibold mb-1">Schedule Posts</h3>
            <p className="text-[12px] text-slate-400">
              Pick platforms and schedule clips for future posts.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left">
            <h3 className="text-sm font-semibold mb-1">Organize Everything</h3>
            <p className="text-[12px] text-slate-400">
              Edit titles, update descriptions, and manage your content like a pro.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
