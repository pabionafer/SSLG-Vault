import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    await logAction(profile?.username ?? null, "logout", "profiles", user.id);
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
