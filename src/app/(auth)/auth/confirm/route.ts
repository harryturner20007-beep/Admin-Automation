import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/server/supabase";

const TYPES: EmailOtpType[] = ["invite", "recovery", "email", "signup", "email_change", "magiclink"];

/** Landing point for the invitation and password-reset emails: swaps the one-time token for a session. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const tokenHash = p.get("token_hash");
  const type = p.get("type") as EmailOtpType | null;
  const next = p.get("next")?.startsWith("/") && !p.get("next")!.startsWith("//") ? p.get("next")! : "/overview";
  const to = request.nextUrl.clone();
  to.search = "";
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await userClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      to.pathname = next;
      if (type === "invite") to.searchParams.set("welcome", "1");
      return NextResponse.redirect(to);
    }
  }
  to.pathname = "/login";
  to.searchParams.set("link", "expired");
  return NextResponse.redirect(to);
}
