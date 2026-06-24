import { NextRequest, NextResponse } from "next/server";
import { classifyServerAsync, headerScore } from "@/lib/cloak";
import {
  getClientTokenKey,
  issueHumanToken,
  issueTransferToken,
  HUMAN_COOKIE,
  PROBED_COOKIE,
} from "@/lib/token";
import { getCloakThreshold, getCloakTokenHours, routeCloakThreshold, routeCloakTokenHours } from "@/lib/cloak";
import { getClientIp, recordVisitFast } from "@/lib/visit";
import { getPromoForRoute, getRouteById, type LandingRoute } from "@/lib/db";

export const runtime = "nodejs";

// 移植自 cloak-router/probe.go scoreProbe
interface ProbePayload {
  js: boolean;
  webdriver: boolean;
  automation: boolean;
  hasChrome: boolean;
  webglVendor: string;
  webglRenderer?: string;
  plugins: number;
  hc: number;
  dm?: number;
  sw: number;
  sh: number;
  dpr?: number;
  tz: string;
  platform?: string;
  uaPlatform?: string;
  langs: string;
  notif: string;
  notifQ: string;
  touch: number;
}

function lower(value: unknown): string {
  return String(value || "").toLowerCase();
}

function uaDevice(ua: string): "ios" | "android" | "mobile" | "windows" | "mac" | "linux" | "unknown" {
  const u = lower(ua);
  if (u.includes("iphone") || u.includes("ipad") || u.includes("ipod")) return "ios";
  if (u.includes("android")) return "android";
  if (u.includes("mobile")) return "mobile";
  if (u.includes("windows")) return "windows";
  if (u.includes("macintosh") || u.includes("mac os x")) return "mac";
  if (u.includes("linux")) return "linux";
  return "unknown";
}

function isMobileShape(p: ProbePayload): boolean {
  const w = Number(p.sw || 0);
  const h = Number(p.sh || 0);
  const dpr = Number(p.dpr || 1);
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  return minSide > 0 && minSide <= 540 && maxSide <= 1200 && dpr >= 2;
}

function isDesktopShape(p: ProbePayload): boolean {
  const w = Number(p.sw || 0);
  const h = Number(p.sh || 0);
  return Math.max(w, h) >= 1100 && Math.min(w, h) >= 600;
}

function scoreDeviceConsistency(
  p: ProbePayload,
  ua: string
): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  const device = uaDevice(ua);
  const platform = lower([p.platform, p.uaPlatform].filter(Boolean).join(" "));
  const gl = lower([p.webglVendor, p.webglRenderer].filter(Boolean).join(" "));
  const touch = Number(p.touch || 0);
  const dpr = Number(p.dpr || 1);

  const uaMobile = device === "ios" || device === "android" || device === "mobile";
  const mobileShape = isMobileShape(p);
  const desktopShape = isDesktopShape(p);

  if (uaMobile && mobileShape && touch > 0) score += 2;
  if (!uaMobile && desktopShape) score += 1;

  if (uaMobile && touch <= 0) {
    score -= 2;
    notes.push("移动 UA 无触控");
  }
  if (uaMobile && desktopShape && !mobileShape) {
    score -= 2;
    notes.push("移动 UA 桌面屏幕");
  }
  if (!uaMobile && mobileShape && touch > 0 && device !== "mac") {
    score -= 1;
    notes.push("桌面 UA 手机屏幕");
  }

  if (device === "ios") {
    if (platform && !platform.includes("iphone") && !platform.includes("ipad") && !platform.includes("mac")) {
      score -= 1;
      notes.push("iOS UA 平台不匹配");
    }
    if (touch > 0 && dpr >= 2) score += 1;
  }

  if (device === "android") {
    if (platform && !platform.includes("android") && !platform.includes("linux")) {
      score -= 1;
      notes.push("Android UA 平台不匹配");
    }
    if (touch > 0) score += 1;
  }

  if (device === "windows" && platform && !platform.includes("win")) {
    score -= 1;
    notes.push("Windows UA 平台不匹配");
  }
  if (device === "mac" && platform && !platform.includes("mac")) {
    score -= 1;
    notes.push("Mac UA 平台不匹配");
  }

  if (gl.includes("swiftshader") || gl.includes("llvmpipe") || gl.includes("mesa offscreen")) {
    score -= 3;
    notes.push("软件渲染 WebGL");
  } else if (gl) {
    if (device === "ios" && (gl.includes("apple") || gl.includes("metal"))) score += 1;
    else if (device === "android" && (gl.includes("adreno") || gl.includes("mali") || gl.includes("powervr"))) score += 1;
    else if ((device === "windows" || device === "mac" || device === "linux") && desktopShape) score += 1;
  }

  return { score, notes };
}

function scoreProbe(
  p: ProbePayload,
  acceptLang: string,
  ua: string
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

  const consistency = scoreDeviceConsistency(p, ua);
  score += consistency.score;

  return { score, hardBot: false, reason: consistency.notes.join("; ") };
}

export async function POST(req: NextRequest) {
  let p: ProbePayload;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ human: false }, { status: 400 });
  }

  const hScore = headerScore(req.headers);
  const serverVerdict = await classifyServerAsync(req.headers);
  const { score: pScore, hardBot, reason: hardReason } = scoreProbe(
    p,
    req.headers.get("accept-language") || "",
    req.headers.get("user-agent") || ""
  );
  const routeId = Number(req.nextUrl.searchParams.get("route") || 0);
  const route = routeId > 0 ? getRouteById(routeId) : null;
  const threshold = route ? routeCloakThreshold(route) : getCloakThreshold();
  const totalScore = hScore + pScore;
  const human = !!route && serverVerdict.decision !== "bot" && !hardBot && totalScore >= threshold;
  const reason = serverVerdict.decision === "bot"
    ? serverVerdict.reason
    : !route
    ? "线路不存在"
    : hardBot
    ? hardReason
    : human
      ? "探针通过"
      : hardReason
        ? `探针分不足: ${totalScore}/${threshold}; ${hardReason}`
        : `探针分不足: ${totalScore}/${threshold}`;

  const ip = getClientIp(req.headers);
  const clientKey = getClientTokenKey(req.headers, ip);
  const promo = String(req.nextUrl.searchParams.get("c") || "").trim();
  let target = "";
  let visitId = 0;
  if (human && route) {
    const promoRow = promo ? getPromoForRoute(route.id, promo) : null;
    const effectivePromo = promo && promoRow ? promoRow.code : "";
    try {
      visitId = recordVisitFast({
        route_id: route.id,
        promo_code: effectivePromo,
        page_variant: "real",
        cloak_reason: "探针通过",
        entry_domain: route.entry_domain,
        exit_domain: realTargetLabel(route),
        headers: req.headers,
      });
    } catch {
      // 记录失败不影响真人放行
    }
    target = buildRealTargetUrl(route, req.headers, effectivePromo, visitId);
  }

  const res = NextResponse.json({
    human,
    next: human ? "real" : "fake",
    reason,
    score: totalScore,
    headerScore: hScore,
    probeScore: pScore,
    serverReason: serverVerdict.reason,
    target,
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

function realTargetLabel(route: LandingRoute): string {
  return route.real_target_type === "external" ? route.external_url : route.exit_domain || "";
}

function buildRealTargetUrl(route: LandingRoute, headers: Headers, promo: string, visitId: number): string {
  if (route.real_target_type === "external") {
    const target = new URL(route.external_url);
    if (promo) target.searchParams.set("c", promo);
    return target.toString();
  }

  if (!route.exit_domain) return "/";
  const target = new URL(`https://${route.exit_domain}/`);
  if (promo) target.searchParams.set("c", promo);
  if (visitId) target.searchParams.set("v", String(visitId));
  target.searchParams.set("ht", buildExitTransferToken(route, headers));
  return target.toString();
}

function buildExitTransferToken(route: LandingRoute, headers: Headers): string {
  const ip = getClientIp(headers);
  const clientKey = getClientTokenKey(headers, ip);
  return issueTransferToken(clientKey, 120, `route:${route.id}:exit:${route.exit_domain}`);
}
