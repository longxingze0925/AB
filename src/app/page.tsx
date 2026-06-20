import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import {
  LandingRoute,
  getCurrentExit,
  isExitDomain,
  getRouteByEntry,
  getRouteByExit,
  getPromoForRoute,
} from "@/lib/db";
import { recordVisit, getClientIp } from "@/lib/visit";
import ExitLanding from "@/components/ExitLanding";
import {
  isCloakEnabled,
  classifyServerAsync,
  getDecoyConfig,
  routeCloakEnabled,
  routeDecoyConfig,
} from "@/lib/cloak";
import { verifyHumanToken, HUMAN_COOKIE, PROBED_COOKIE } from "@/lib/token";
import { normalizeUploadImagePath } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 取请求 Host(去掉端口)
function getHost(h: Headers): string {
  const host = h.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

// 探针 JS（移植自 cloak-router/templates.go loadingTmpl）
function probePage(routeId?: number) {
  const verifyUrl = routeId ? `/api/cloak/verify?route=${routeId}` : "/api/cloak/verify";
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>加载中…</title></head>
<body style="font-family:sans-serif;color:#666;display:flex;height:90vh;align-items:center;justify-content:center">
<div>正在加载，请稍候…</div>
<script>
(async function(){
  function webglVendor(){
    try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
      if(!gl)return'';var e=gl.getExtension('WEBGL_debug_renderer_info');
      return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'';}catch(_){return'';}
  }
  var notifQ='';
  try{if(navigator.permissions&&navigator.permissions.query){
    var st=await navigator.permissions.query({name:'notifications'});notifQ=st.state;}}catch(_){}
  var nav=navigator;
  var p={
    js:true,
    webdriver:nav.webdriver===true,
    automation:!!(window._phantom||window.__nightmare||window.callPhantom||
      Object.keys(window.document||{}).some(function(k){return k.indexOf('cdc_')===0;})||
      Object.keys(window).some(function(k){return k.indexOf('cdc_')===0;})),
    hasChrome:!!window.chrome,
    webglVendor:webglVendor(),
    plugins:(nav.plugins&&nav.plugins.length)||0,
    hc:nav.hardwareConcurrency||0,
    sw:screen.width||0,sh:screen.height||0,
    tz:(Intl&&Intl.DateTimeFormat)?Intl.DateTimeFormat().resolvedOptions().timeZone:'',
    langs:(nav.languages&&nav.languages[0])||nav.language||'',
    notif:(window.Notification&&Notification.permission)||'',
    notifQ:notifQ,
    touch:nav.maxTouchPoints||0
  };
  try{
    var r=await fetch('${verifyUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    location.reload();
  }catch(_){location.reload();}
})();
</script>
</body></html>`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const h = headers();
  const host = getHost(h);
  const promo = (searchParams.c || "").trim();

  // ---- 主域名:进后台 ----
  const main = (process.env.MAIN_DOMAIN || "").toLowerCase();
  if (host === main) {
    redirect("/admin");
  }

  const legacyExit = getCurrentExit();
  const entryRoute = getRouteByEntry(host);
  const exitRoute = getRouteByExit(host);
  const route = entryRoute || exitRoute;

  if (route) {
    const cloakResult = await guardRouteCloak(route, h, promo);
    if (cloakResult) return cloakResult;

    if (exitRoute) {
      const promoRow = promo ? getPromoForRoute(exitRoute.id, promo) : null;
      return (
        <ExitLanding
          apkUrl={promoRow?.apk_url || exitRoute.apk_url}
          imageUrl={normalizeUploadImagePath(exitRoute.image_path)}
          title={exitRoute.title || "下载"}
          autoDownload={exitRoute.auto_download === 1}
          promo={promoRow ? promoRow.code : promo}
        />
      );
    }

    const promoRow = promo ? getPromoForRoute(entryRoute!.id, promo) : null;
    const effectivePromo = promo && promoRow ? promoRow.code : "";

    let visitId = 0;
    try {
      visitId = await recordVisit({
        route_id: entryRoute!.id,
        promo_code: effectivePromo,
        page_variant: "real",
        cloak_reason: "",
        entry_domain: host,
        exit_domain: entryRoute!.exit_domain,
        headers: h,
      });
    } catch {
      // 记录失败不阻塞跳转
    }
    const target = new URL(`https://${entryRoute!.exit_domain}/`);
    if (effectivePromo) target.searchParams.set("c", effectivePromo);
    if (visitId) target.searchParams.set("v", String(visitId));
    redirect(target.toString());
  }

  const cloakOn = isCloakEnabled();

  // ── 分流判定（出口域名 + 入口域名均保护）──────────────────────────────
  if (cloakOn) {
    const ip = getClientIp(h);
    const jar = cookies();
    const humanToken = jar.get(HUMAN_COOKIE)?.value || "";
    const probedCookie = jar.get(PROBED_COOKIE)?.value || "";

    const isHuman = humanToken && verifyHumanToken(humanToken, ip);

    if (!isHuman) {
      // 已探测过判为机器 → 直接给假内容（不再发探针，防死循环）
      if (probedCookie === "0") {
        await recordGlobalVariant("fake", "JS 探针未通过", host, legacyExit || "", promo, h);
        return decoyResponse(host, promo);
      }

      // 服务端层快速初判（同步：UA + ASN；异步加 PTR，有超时容忍）
      const verdict = await classifyServerAsync(h);
      if (verdict.decision === "bot") {
        await recordGlobalVariant("fake", verdict.reason, host, legacyExit || "", promo, h);
        return decoyResponse(host, promo);
      }

      // 需要 JS 探针确认 → 返回加载页
      await recordGlobalVariant("probe", "需 JS 探针确认", host, legacyExit || "", promo, h);
      return new Response(probePage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  // ---- 无启用线路 / 未配置 ----
  return (
    <main style={{ padding: 40, textAlign: "center" }}>
      <p>服务未就绪</p>
    </main>
  );
}

async function guardRouteCloak(route: LandingRoute, h: Headers, promo: string) {
  if (!routeCloakEnabled(route)) return null;

  const ip = getClientIp(h);
  const jar = cookies();
  const humanToken = jar.get(HUMAN_COOKIE)?.value || "";
  const probedCookie = jar.get(PROBED_COOKIE)?.value || "";
  const isHuman = humanToken && verifyHumanToken(humanToken, ip, `route:${route.id}`);

  if (isHuman) return null;

  if (probedCookie === "0") {
    await recordRouteVariant(route, "fake", "JS 探针未通过", h, promo);
    return routeDecoyResponse(route, promo);
  }

  const verdict = await classifyServerAsync(h);
  if (verdict.decision === "bot") {
    await recordRouteVariant(route, "fake", verdict.reason, h, promo);
    return routeDecoyResponse(route, promo);
  }

  await recordRouteVariant(route, "probe", "需 JS 探针确认", h, promo);
  return new Response(probePage(route.id), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function recordRouteVariant(
  route: LandingRoute,
  pageVariant: "fake" | "probe",
  reason: string,
  h: Headers,
  promo: string
) {
  try {
    const promoRow = promo ? getPromoForRoute(route.id, promo) : null;
    await recordVisit({
      route_id: route.id,
      promo_code: promoRow ? promoRow.code : "",
      page_variant: pageVariant,
      cloak_reason: reason,
      entry_domain: route.entry_domain,
      exit_domain: route.exit_domain,
      headers: h,
    });
  } catch {
    // 记录失败不影响分流响应
  }
}

async function recordGlobalVariant(
  pageVariant: "fake" | "probe",
  reason: string,
  entryDomain: string,
  exitDomain: string,
  promo: string,
  h: Headers
) {
  try {
    await recordVisit({
      promo_code: promo,
      page_variant: pageVariant,
      cloak_reason: reason,
      entry_domain: entryDomain,
      exit_domain: exitDomain,
      headers: h,
    });
  } catch {
    // 记录失败不影响分流响应
  }
}

function routeDecoyResponse(route: LandingRoute, promo: string) {
  const decoy = routeDecoyConfig(route);
  return (
    <ExitLanding
      apkUrl={decoy.apkUrl}
      imageUrl={decoy.imageUrl}
      title={decoy.title}
      autoDownload={false}
      promo={promo}
    />
  );
}

// 返回假落地页（出口域名给假内容，入口域名给假跳转）
function decoyResponse(host: string, promo: string) {
  const decoy = getDecoyConfig();

  // 兼容旧全局分流：只给假内容，不再使用旧入口/出口真实跳转。
  if (isExitDomain(host)) {
    return (
      <ExitLanding
        apkUrl={decoy.apkUrl}
        imageUrl={decoy.imageUrl}
        title={decoy.title}
        autoDownload={false}
        promo={promo}
      />
    );
  }

  return (
    <ExitLanding
      apkUrl={decoy.apkUrl}
      imageUrl={decoy.imageUrl}
      title={decoy.title}
      autoDownload={false}
      promo={promo}
    />
  );
}
