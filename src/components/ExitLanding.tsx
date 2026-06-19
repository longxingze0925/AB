"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // 从 URL 取 visitId(入口跳转时带过来),回填客户端信息
    const params = new URLSearchParams(window.location.search);
    const visitId = params.get("v");

    const conn = (navigator as any).connection;
    const payload = {
      id: visitId ? Number(visitId) : 0,
      promo,
      screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}x`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      network: conn ? conn.effectiveType || "" : "",
      fingerprint: buildFingerprint(),
    };

    // 回填客户端采集信息(瞬间执行,无感)
    navigator.sendBeacon?.("/api/collect", new Blob([JSON.stringify(payload)], { type: "application/json" }));

    // 自动触发 APK 下载
    if (autoDownload && apkUrl) {
      const t = setTimeout(() => {
        if (visitId) {
          // 标记下载
          navigator.sendBeacon?.("/api/downloaded", new Blob([JSON.stringify({ id: Number(visitId) })], { type: "application/json" }));
        }
        window.location.href = apkUrl;
      }, 800);
      return () => clearTimeout(t);
    }
  }, [apkUrl, autoDownload, promo]);

  const handleManual = () => {
    if (apkUrl) window.location.href = apkUrl;
  };

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
          onClick={handleManual}
          style={{ maxWidth: "100%", maxHeight: "70vh", cursor: "pointer", borderRadius: 8 }}
        />
      ) : null}
      <button
        onClick={handleManual}
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
      <p style={{ color: "#888", fontSize: 13 }}>若未自动开始,请点击上方按钮</p>
    </main>
  );
}
