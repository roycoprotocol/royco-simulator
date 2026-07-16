import { SCRIPT_B64, authed } from "../_assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /raac/team/script -> the Monte Carlo engine JS, only with a valid team cookie.
export async function GET(req: Request) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });
  return new Response(Buffer.from(SCRIPT_B64, "base64").toString("utf8"), {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
