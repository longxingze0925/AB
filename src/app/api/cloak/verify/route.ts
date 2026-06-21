import { NextRequest, NextResponse } from "next/server";
import { headerScore } from "@/lib/cloak";
import { getClientTokenKey, issueHumanToken, HUMAN_COOKIE, PROBED_COOKIE } from "@/lib/token";
import { getCloakThreshold, getCloakTokenHours, routeCloakThreshold, routeCloakTokenHours } from "@/lib/cloak";
import { getClientIp } from "@/lib/visit";
import { getRouteById } from "@/lib/db";

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
): { score: number; hardBot: boolean; reason: string } {
  // 一票否决
  if (!p.js) return { score: 0, hardBot: true, reason: "JS 未执行" };
  if (p.webdriver) return { score: 0, hardBot: true, reason: "webdriver 自动化特征" };
  if (p.automation) return { score: 0, hardBot: true, reason: "自动化环境特征" };
  if (p.notif === "denied" && p.notifQ === "prompt") {
    return { score: 0, hardBot: true, reason: "通知权限特征异常" };
  }

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

  return { score, hardBot: false, reason: "" };
}

export async function POST(req: NextRequest) {
  let p: ProbePayload;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ human: false }, { status: 400 });
  }

  const hScore = headerScore(req.headers);
  const { score: pScore, hardBot, reason: hardReason } = scoreProbe(
    p,
    req.headers.get("accept-language") || ""
  );
  const routeId = Number(req.nextUrl.searchParams.get("route") || 0);
  const route = routeId > 0 ? getRouteById(routeId) : null;
  const threshold = route ? routeCloakThreshold(route) : getCloakThreshold();
  const totalScore = hScore + pScore;
  const human = !hardBot && totalScore >= threshold;
  const reason = hardBot
    ? hardReason
    : human
      ? "探针通过"
      : `探针分不足: ${totalScore}/${threshold}`;

  const ip = getClientIp(req.headers);
  const clientKey = getClientTokenKey(req.headers, ip);
  const res = NextResponse.json({
    human,
    next: human ? "real" : "fake",
    reason,
    score: totalScore,
    headerScore: hScore,
    probeScore: pScore,
    threshold,
  });
  const tokenHours = route ? routeCloakTokenHours(route) : getCloakTokenHours();
  const scope = route ? `route:${route.id}` : "global";

  if (human) {
    const token = issueHumanToken(clientKey, tokenHours, scope);
    res.cookies.set(HUMAN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: tokenHours * 3600,
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
