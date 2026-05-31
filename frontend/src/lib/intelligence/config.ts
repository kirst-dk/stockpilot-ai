/**
 * Stocky intelligence layer — API endpoints.
 *
 * All API keys are stripped on the server by nginx reverse-proxies on
 * https://app.stockpilotai.xyz/api/{altllm,elfa,nansen}/.
 *
 * In production (when the app is served from app.stockpilotai.xyz)
 * we use same-origin relative URLs. In development we fall back to
 * absolute URLs pointed at the production proxy so the keys stay hidden
 * and CORS just works.
 */

const PROD_HOST = "https://app.stockpilotai.xyz";

export function apiBase(): string {
  if (typeof window === "undefined") return PROD_HOST;
  const host = window.location.hostname;
  if (host === "app.stockpilotai.xyz") return "";
  return PROD_HOST;
}

export const ALTLLM_BASE = () => `${apiBase()}/api/altllm`;
export const ELFA_BASE = () => `${apiBase()}/api/elfa`;
export const NANSEN_BASE = () => `${apiBase()}/api/nansen`;

export const ALTLLM_DEFAULT_MODEL = "altllm-standard";
export const ALTLLM_MIN_MAX_TOKENS = 128;

export const NANSEN_CHAINS_DEFAULT = ["ethereum", "mantle"] as const;
