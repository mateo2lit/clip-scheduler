export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="flex flex-col items-center text-center gap-5">
          <span className="rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-300">
            Clip Scheduler MVP
          </span>

          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
            Upload once. Post everywhere.
          </h1>

          <p className="max-w-2xl text-zinc-300 text-base leading-relaxed">
            Upload a clip once, edit titles/descriptions, and schedule it for YouTube,
            TikTok, and Shorts — from one dashboard.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href="/scheduler"
              className="rounded-xl bg-white text-zinc-900 px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition"
            >
              Open Scheduler
            </a>
            <a
              href="#how"
              className="rounded-xl border border-zinc-800/80 bg-transparent px-5 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/40 transition"
            >
              How it works
            </a>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Upload clips", desc: "Store clips with titles, descriptions, and tags." },
              { title: "Schedule posts", desc: "Pick platforms and schedule future uploads." },
              { title: "Run worker", desc: "Processes due posts and marks them posted." },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-zinc-800/70 bg-zinc-900/20 p-4 text-left"
              >
                <div className="text-sm font-semibold text-zinc-100">{c.title}</div>
                <div className="mt-2 text-sm text-zinc-300 leading-relaxed">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <section
          id="how"
          className="mt-10 rounded-2xl border border-zinc-800/70 bg-zinc-900/15 p-5"
        >
          <h2 className="text-sm font-semibold">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>1) Create a scheduled post in the Scheduler.</li>
            <li>2) The worker checks for due posts and processes them.</li>
            <li>3) GitHub Actions can hit the worker on a schedule in production.</li>
          </ol>
          <div className="mt-4 text-xs text-zinc-400">
            MVP note: uploads are currently stubbed. Next step is platform auth + real upload adapters.
          </div>
        </section>
      </div>
    </main>
  );
}
