"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const downloadFrame = useRef<HTMLIFrameElement | null>(null);
  const [imageReady, setImageReady] = useState(!imageUrl);

  useEffect(() => {
    setImageReady(!imageUrl);
  }, [imageUrl]);

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

  const triggerDownload = useCallback(() => {
    if (!apkUrl) return;

    const visitId = getVisitId();
    markDownloaded(visitId);

    const iframe = document.createElement("iframe");
    iframe.src = apkUrl;
    iframe.title = "download";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    downloadFrame.current?.remove();
    downloadFrame.current = iframe;
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
    if (started.current || !autoDownload || !apkUrl || !imageReady) return;
    started.current = true;

    // 先让落地页主体和图片完成渲染，再在当前页内触发下载。
    const t = setTimeout(triggerDownload, 1800);
    return () => clearTimeout(t);
  }, [apkUrl, autoDownload, imageReady, triggerDownload]);

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
      }}
    >
      <h1 style={{ fontSize: 22 }}>{title}</h1>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(true)}
          onClick={triggerDownload}
          style={{ maxWidth: "100%", maxHeight: "70vh", cursor: "pointer", borderRadius: 8 }}
        />
      ) : null}
      <button
        onClick={triggerDownload}
        style={{
          padding: "12px 32px",
          fontSize: 16,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        点击下载
      </button>
      <p style={{ color: "#888", fontSize: 13 }}>若未弹出下载,请点击上方按钮</p>
    </main>
  );
}
