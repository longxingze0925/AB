"use client";

import { useCallback, useEffect, useRef } from "react";

interface MetaBrowserConfig {
  pixelId: string;
  testEventCode: string;
  currency: string;
  value: number;
  pageViewEnabled: boolean;
  viewContentEnabled: boolean;
  leadEnabled: boolean;
}

interface Props {
  apkUrl: string;
  imageUrl: string;
  title: string;
  autoDownload: boolean;
  promo: string;
  trackDownload?: boolean;
  meta?: MetaBrowserConfig | null;
}

// 轻量设备指纹:综合屏幕/时区/UA/canvas 生成稳定字符串
function buildFingerprint(): string {
  const parts: string[] = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    String(new Date().getTimezoneOffset()),
    String((navigator as any).hardwareConcurrency || ""),
    String((navigator as any).deviceMemory || ""),
  ];
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("fp-probe-中文", 2, 2);
      parts.push(c.toDataURL());
    }
  } catch {}
  // 简单哈希
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16);
}

function ensureMetaPixel(pixelId: string) {
  const w = window as any;
  if (!w.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(args);
    } as any;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    w.fbq = fbq;
    w._fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  if (!w.__metaPixelInited) w.__metaPixelInited = {};
  if (!w.__metaPixelInited[pixelId]) {
    w.fbq("init", pixelId);
    w.__metaPixelInited[pixelId] = true;
  }
}

function getMetaCookie(name: string): string {
  const prefix = `${name}=`;
  const part = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export default function ExitLanding({
  apkUrl,
  imageUrl,
  title,
  autoDownload,
  promo,
  trackDownload = true,
  meta,
}: Props) {
  const started = useRef(false);
  const collected = useRef(false);
  const metaTracked = useRef(false);
  const downloadMarked = useRef(false);
  const downloadFrames = useRef<HTMLIFrameElement[]>([]);
  const cleanupTimers = useRef<number[]>([]);

  const getVisitId = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const visitId = Number(params.get("v") || 0);
    return Number.isFinite(visitId) ? visitId : 0;
  }, []);

  const markDownloaded = useCallback((visitId: number) => {
    if (!trackDownload) return;
    if (!visitId) return;
    if (downloadMarked.current) return;
    downloadMarked.current = true;
    navigator.sendBeacon?.(
      "/api/downloaded",
      new Blob([JSON.stringify({
        id: visitId,
        eventId: `lead_${visitId}`,
        fbp: getMetaCookie("_fbp"),
        fbc: getMetaCookie("_fbc"),
        fbclid: new URLSearchParams(window.location.search).get("fbclid") || "",
        url: window.location.href,
      })], { type: "application/json" })
    );
  }, [trackDownload]);

  const triggerDownload = useCallback((countDownload = true) => {
    if (!apkUrl) return;

    const visitId = getVisitId();
    if (countDownload) {
      markDownloaded(visitId);
    }

    const iframe = document.createElement("iframe");
    iframe.src = apkUrl;
    iframe.title = "download";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    downloadFrames.current.push(iframe);
    const timer = window.setTimeout(() => {
      iframe.remove();
      downloadFrames.current = downloadFrames.current.filter((item) => item !== iframe);
      cleanupTimers.current = cleanupTimers.current.filter((item) => item !== timer);
    }, 15000);
    cleanupTimers.current.push(timer);
  }, [apkUrl, getVisitId, markDownloaded]);

  useEffect(() => {
    if (collected.current) return;
    collected.current = true;

    const conn = (navigator as any).connection;
    const payload = {
      id: getVisitId(),
      promo,
      screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}x`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      network: conn ? conn.effectiveType || "" : "",
      fingerprint: buildFingerprint(),
      eventId: `vc_${getVisitId()}`,
      fbp: getMetaCookie("_fbp"),
      fbc: getMetaCookie("_fbc"),
      fbclid: new URLSearchParams(window.location.search).get("fbclid") || "",
      url: window.location.href,
    };

    // 回填客户端采集信息(瞬间执行,无感)
    navigator.sendBeacon?.("/api/collect", new Blob([JSON.stringify(payload)], { type: "application/json" }));
  }, [getVisitId, promo]);

  useEffect(() => {
    if (metaTracked.current || !meta?.pixelId) return;
    metaTracked.current = true;
    ensureMetaPixel(meta.pixelId);
  }, [meta]);

  useEffect(() => {
    if (started.current || !autoDownload || !apkUrl) return;
    started.current = true;

    // 贴近 smcy.shop：页面挂载后延迟尝试打开中转下载页；浏览器拦截时由用户点击兜底。
    const t = setTimeout(() => triggerDownload(true), 1000);
    return () => clearTimeout(t);
  }, [apkUrl, autoDownload, triggerDownload]);

  useEffect(() => {
    return () => {
      cleanupTimers.current.forEach((timer) => window.clearTimeout(timer));
      downloadFrames.current.forEach((frame) => frame.remove());
      cleanupTimers.current = [];
      downloadFrames.current = [];
    };
  }, []);

  const handlePageClick = useCallback(() => {
    triggerDownload(true);
  }, [triggerDownload]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        textAlign: "center",
        cursor: apkUrl ? "pointer" : "default",
      }}
      onClick={handlePageClick}
    >
      <h1 style={{ fontSize: 22 }}>{title}</h1>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
        />
      ) : null}
      <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
        If the download doesn't start, tap anywhere to install.
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerDownload(true);
        }}
        style={{
          width: "min(360px, calc(100vw - 48px))",
          minHeight: 64,
          padding: "14px 28px",
          fontSize: 24,
          fontWeight: 900,
          background: "linear-gradient(180deg, #ff6d8f 0%, #ff4c72 100%)",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
          boxShadow: "0 18px 36px rgba(255,76,114,0.34)",
          textShadow: "0 2px 8px rgba(0,0,0,0.22)",
        }}
      >
        Download and Install
      </button>
    </main>
  );
}
