import { NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSiteUrl(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
}

function supabaseFromCookies() {
  const cookieStore = cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    // ✅ use the public anon key env var
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
}

async function handler(req: Request) {
  const supabase = supabaseFromCookies();

  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

  const siteUrl = getSiteUrl(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/youtube.upload"],
    state: user.id,
  });

  return NextResponse.redirect(authUrl);
}

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
