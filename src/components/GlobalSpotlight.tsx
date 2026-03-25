"use client";

// CSS is embedded directly here to avoid any Tailwind processing issues
// NOTE: No filter:blur — Chrome clips blur on position:fixed elements. Soft radial gradient handles the glow instead.
const CSS = `
  @keyframes dvd-bounce {
    0%   { transform: translate(0px, 0px); }
    25%  { transform: translate(calc(100vw - 500px), calc(100vh - 500px)); }
    50%  { transform: translate(0px, calc(100vh - 500px)); }
    75%  { transform: translate(calc(100vw - 500px), 0px); }
    100% { transform: translate(0px, 0px); }
  }
  @keyframes dvd-color {
    0%,  24.9% { background: radial-gradient(circle, rgba(96,165,250,0.95)  0%, rgba(96,165,250,0.55)  30%, rgba(96,165,250,0.15) 60%, transparent 75%); }
    25%, 49.9% { background: radial-gradient(circle, rgba(168,85,247,0.95)  0%, rgba(168,85,247,0.55)  30%, rgba(168,85,247,0.15) 60%, transparent 75%); }
    50%, 74.9% { background: radial-gradient(circle, rgba(236,72,153,0.95)  0%, rgba(236,72,153,0.55)  30%, rgba(236,72,153,0.15) 60%, transparent 75%); }
    75%, 99.9% { background: radial-gradient(circle, rgba(52,211,153,0.95)  0%, rgba(52,211,153,0.55)  30%, rgba(52,211,153,0.15) 60%, transparent 75%); }
    100%       { background: radial-gradient(circle, rgba(96,165,250,0.95)  0%, rgba(96,165,250,0.55)  30%, rgba(96,165,250,0.15) 60%, transparent 75%); }
  }
  .clip-dvd-orb {
    position: fixed;
    top: 0;
    left: 0;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.3;
    animation: dvd-bounce 20s linear infinite, dvd-color 20s linear infinite;
    will-change: transform;
  }
`;

export default function GlobalSpotlight({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div aria-hidden="true" className="clip-dvd-orb" />
      {children}
    </>
  );
}
