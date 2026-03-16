import type { MDXComponents } from 'mdx/types'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-10 mb-6 text-white">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-10 mb-4 text-white">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold mt-8 mb-3 text-white">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="text-white/65 leading-relaxed mb-5">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-6 mb-5 space-y-2 text-white/65">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-6 mb-5 space-y-2 text-white/65">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">{children}</a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-500/50 pl-5 py-1 my-6 text-white/50 italic">{children}</blockquote>
    ),
    code: ({ children }) => (
      <code className="font-mono text-sm bg-white/[0.08] rounded px-1.5 py-0.5 text-blue-300">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="bg-white/[0.05] border border-white/10 rounded-xl p-4 mb-5 overflow-x-auto text-sm font-mono text-white/70">{children}</pre>
    ),
    hr: () => (
      <hr className="border-white/10 my-10" />
    ),
    ...components,
  }
}
