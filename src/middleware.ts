import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { strayAuthCodeRedirect } from "@/lib/authLinks";

const PROTECTED_PATHS = [
  "/dashboard",
  "/uploads",
  "/upload",
  "/scheduled",
  "/posted",
  "/drafts",
  "/calendar",
  "/comments",
  "/settings",
  "/analytics",
  // NOTE: /platforms is deliberately NOT protected. Those pages are static
  // marketing copy with no user data, linked from the public homepage grid and
  // footer — gating them sent logged-out visitors to a login wall from the
  // landing page and kept them out of search results.
  "/welcome",
  "/onboarding",
  "/support",
];

export async function middleware(req: NextRequest) {
  // An auth link whose redirect Supabase didn't allow lands on the Site URL root with
  // ?code=...; hand it to /auth/callback so it is used (or its failure is shown).
  const stray = strayAuthCodeRedirect(req.nextUrl.pathname, req.nextUrl.search);
  if (stray) return NextResponse.redirect(new URL(stray, req.url));

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/).*)",
  ],
};
