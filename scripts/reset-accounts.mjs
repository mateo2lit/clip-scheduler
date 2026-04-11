// One-off script to fully reset accounts for onboarding testing.
// Usage: node scripts/reset-accounts.mjs
// Requires .env.local to have NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually
const envPath = resolve(process.cwd(), ".env.local");
const envVars = readFileSync(envPath, "utf8")
  .split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .reduce((acc, line) => {
    const [key, ...rest] = line.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    acc[key.trim()] = val;
    return acc;
  }, {});

const supabase = createClient(
  envVars["NEXT_PUBLIC_SUPABASE_URL"],
  envVars["SUPABASE_SERVICE_ROLE_KEY"],
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const EMAILS = [
  "davidhershmansocial@gmail.com",
  "dbh28tekkit@gmail.com",
  "mateosocialcontact@gmail.com",
];

async function resetAccount(email) {
  console.log(`\n--- Resetting: ${email} ---`);

  // 1. Find the auth user
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;

  const user = users.find((u) => u.email === email);
  if (!user) {
    console.log(`  Not found in auth — skipping.`);
    return;
  }

  const userId = user.id;
  console.log(`  Found user: ${userId}`);

  // 2. Find the team(s) owned by this user
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("owner_id", userId);

  const teamIds = (teams || []).map((t) => t.id);
  console.log(`  Teams: ${teamIds.length > 0 ? teamIds.join(", ") : "none"}`);

  // 3. Delete data in dependency order
  if (teamIds.length > 0) {
    await supabase.from("scheduled_posts").delete().in("team_id", teamIds);
    console.log("  Deleted scheduled_posts");

    await supabase.from("uploads").delete().in("team_id", teamIds);
    console.log("  Deleted uploads");

    await supabase.from("platform_accounts").delete().in("team_id", teamIds);
    console.log("  Deleted platform_accounts");

    await supabase.from("support_tickets").delete().in("team_id", teamIds);
    console.log("  Deleted support_tickets");

    await supabase.from("team_invites").delete().in("team_id", teamIds);
    console.log("  Deleted team_invites");

    await supabase.from("team_members").delete().in("team_id", teamIds);
    console.log("  Deleted team_members");

    await supabase.from("teams").delete().in("id", teamIds);
    console.log("  Deleted teams");
  }

  await supabase.from("notification_preferences").delete().eq("user_id", userId);
  await supabase.from("platform_defaults").delete().eq("user_id", userId);
  console.log("  Deleted preferences");

  // 4. Delete the auth user
  const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
  if (deleteErr) throw deleteErr;
  console.log(`  Auth user deleted. ${email} is ready for fresh signup.`);
}

for (const email of EMAILS) {
  await resetAccount(email).catch((err) => console.error(`  ERROR for ${email}:`, err.message));
}

console.log("\nDone.");
