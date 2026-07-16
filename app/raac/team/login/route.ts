import { PASSWORD, COOKIE, TOKEN } from "../_assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /raac/team/login  (body: password=...) -> sets the team cookie on success.
export async function POST(req: Request) {
  const body = await req.text();
  const pw = new URLSearchParams(body).get("password") || "";
  if (pw !== PASSWORD) return new Response("unauthorized", { status: 401 });
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${COOKIE}=${TOKEN}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`,
    },
  });
}
