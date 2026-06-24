import { getRouteById, type LandingRoute } from "./db";
import { getClientIp } from "./visit";
import { getVisitById } from "./visit";

export type MetaEventName = "ViewContent" | "Lead";

interface SendMetaEventInput {
  route: LandingRoute;
  eventName: MetaEventName;
  eventId: string;
  headers: Headers;
  eventSourceUrl: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
}

interface SendMetaVisitEventInput {
  visitId: number;
  eventName: MetaEventName;
  eventId: string;
  headers: Headers;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
}

export async function sendMetaEventForVisit(input: SendMetaVisitEventInput) {
  const visit = getVisitById(input.visitId);
  if (!visit || visit.page_variant !== "real" || !visit.route_id) return;

  const route = getRouteById(visit.route_id);
  if (!route) return;

  const eventSourceUrl =
    input.eventSourceUrl || buildVisitSourceUrl(route, visit.exit_domain, input.visitId);

  await sendMetaEvent({
    route,
    eventName: input.eventName,
    eventId: input.eventId,
    headers: input.headers,
    eventSourceUrl,
    fbp: input.fbp,
    fbc: input.fbc,
    fbclid: input.fbclid,
  });
}

export async function sendMetaEvent(input: SendMetaEventInput) {
  const { route, eventName } = input;
  if (!route.meta_enabled || !route.meta_pixel_id || !route.meta_capi_token) return;
  if (eventName === "ViewContent" && route.meta_view_content_enabled !== 1) return;
  if (eventName === "Lead" && route.meta_lead_enabled !== 1) return;

  const eventTime = Math.floor(Date.now() / 1000);
  const customData: Record<string, string | number> = {
    content_name: route.title || route.name || route.entry_domain,
    currency: route.meta_currency || "USD",
  };
  const value = Number(route.meta_value || 0);
  if (Number.isFinite(value) && value > 0) customData.value = value;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.eventSourceUrl,
        user_data: buildUserData(input.headers, input.eventSourceUrl, input.fbp, input.fbc, input.fbclid),
        custom_data: customData,
      },
    ],
  };

  if (route.meta_test_event_code) {
    payload.test_event_code = route.meta_test_event_code;
  }

  const version = process.env.META_GRAPH_VERSION || "v20.0";
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(
    route.meta_pixel_id
  )}/events?access_token=${encodeURIComponent(route.meta_capi_token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Meta CAPI failed", res.status, text.slice(0, 300));
    }
  } catch (err) {
    console.error("Meta CAPI error", err);
  }
}

function buildUserData(
  headers: Headers,
  eventSourceUrl: string,
  fbp?: string,
  fbc?: string,
  fbclid?: string
) {
  const userData: Record<string, string> = {};
  const ip = getClientIp(headers);
  const ua = headers.get("user-agent") || "";
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;

  const fbpValue = cleanMetaValue(fbp) || getCookie(headers, "_fbp");
  const fbcValue =
    cleanMetaValue(fbc) ||
    getCookie(headers, "_fbc") ||
    buildFbc(cleanMetaValue(fbclid) || getFbclidFromUrl(eventSourceUrl));

  if (fbpValue) userData.fbp = fbpValue;
  if (fbcValue) userData.fbc = fbcValue;
  return userData;
}

function buildFbc(fbclid: string): string {
  if (!fbclid) return "";
  return `fb.1.${Date.now()}.${fbclid}`;
}

function getFbclidFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get("fbclid") || "";
  } catch {
    return "";
  }
}

function cleanMetaValue(value: unknown): string {
  return String(value || "").trim();
}

function getCookie(headers: Headers, name: string): string {
  const raw = headers.get("cookie") || "";
  const prefix = `${name}=`;
  const part = raw.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!part) return "";
  return decodeURIComponent(part.slice(prefix.length));
}

function buildVisitSourceUrl(route: LandingRoute, exitDomain: string, visitId: number): string {
  if (route.real_target_type === "external") return route.external_url;
  const domain = exitDomain || route.exit_domain || route.entry_domain;
  const url = new URL(`https://${domain}/`);
  if (visitId) url.searchParams.set("v", String(visitId));
  return url.toString();
}
