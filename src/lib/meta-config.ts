import type { LandingRoute } from "./db";

export interface MetaBrowserConfig {
  pixelId: string;
  testEventCode: string;
  currency: string;
  value: number;
  pageViewEnabled: boolean;
  viewContentEnabled: boolean;
  leadEnabled: boolean;
}

export function getMetaBrowserConfig(route: LandingRoute): MetaBrowserConfig | null {
  if (!route.meta_enabled || !route.meta_pixel_id) return null;
  return {
    pixelId: route.meta_pixel_id,
    testEventCode: route.meta_test_event_code || "",
    currency: route.meta_currency || "USD",
    value: Number(route.meta_value || 0),
    pageViewEnabled: route.meta_page_view_enabled === 1,
    viewContentEnabled: route.meta_view_content_enabled === 1,
    leadEnabled: route.meta_lead_enabled === 1,
  };
}
