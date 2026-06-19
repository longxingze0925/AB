import { NextRequest, NextResponse } from "next/server";
import { headerScore } from "@/lib/cloak";
import { issueHumanToken, HUMAN_COOKIE, PROBED_COOKIE } from "@/lib/token";
import { getCloakThreshold, getCloakTokenHours } from "@/lib/cloak";
import { getClientIp } from "@/lib/visit";

export const runtime = "nodejs";

// 移植自 cloak-router/probe.go scoreProbe
interface ProbePayload {
  js: boolean;
  webdriver: boolean;
  automation: boolean;
  hasChrome: boolean;
  webglVendor: string;
  plugins: number;
  hc: number;
  sw: number;
  sh: number;
  tz: string;
  langs: string;
  notif: string;
  notifQ: string;
  touch: number;
}

function scoreProbe(
  p: ProbePayload,
  acceptLang: string
): { score: number; hardBot: boolean } {
  // 一票否决
  if (!p.js) return { score: 0, hardBot: true };
  if (p.webdriver) return { score: 0, hardBot: true };
  if (p.automation) return { score: 0, hardBot: true };
  if (p.notif === "denied" && p.notifQ === "prompt") return { score: 0, hardBot: true };

  let score = 0;
  if (p.hasChrome) score += 2;
  if (p.plugins > 0) score += 2;
  const wv = p.webglVendor.toLowerCase();
  if (
    wv &&
    !wv.includes("swiftshader") &&
    !wv.includes("llvmpipe") &&
    !wv.includes("mesa offscreen")
  )
    score += 3;
  if (p.hc >= 2) score += 1;
  if (p.sw >= 800 && p.sh >= 600) score += 1;
  if (p.tz) score += 1;

  if (p.langs && acceptLang) {
    const jl = p.langs.toLowerCase().split("-")[0];
    if (acceptLang.toLowerCase().includes(jl)) score += 2;
    else score -= 1;
  }

  return { score, hardBot: false };
}

export async function POST(req: NextRequest) {
  let p: ProbePayload;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ human: false }, { status: 400 });
  }

  const hScore = headerScore(req.headers);
  const { score: pScore, hardBot } = scoreProbe(
    p,
    req.headers.get("accept-language") || ""
  );
  const threshold = getCloakThreshold();
  const human = !hardBot && hScore + pScore >= threshold;

  const ip = getClientIp(req.headers);
  const res = NextResponse.json({ human });

  if (human) {
    const token = issueHumanToken(ip, getCloakTokenHours());
    res.cookies.set(HUMAN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: getCloakTokenHours() * 3600,
    });
  } else {
    res.cookies.set(PROBED_COOKIE, "0", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 600,
    });
  }

  return res;
}
