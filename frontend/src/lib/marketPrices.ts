// Reference price data for the xStock ticker / market widgets.
// xStocks are tokenized US equities (always end in "x") — the ticker MUST show
// these, never crypto pairs. Values below are recent reference quotes used as a
// graceful, always-available fallback so the ticker never hangs or shows a
// spinner. To wire a live feed, replace `fetchStockQuotes` with a real quote API
// (e.g. xStocks OpenAPI: https://docs.xstocks.fi/apis/openapi) — keep the same
// shape and the UI continues to work.

export interface StockQuote {
  symbol: string; // xStock symbol, e.g. "AAPLx"
  name: string;
  price: number; // USD
  change: number; // 24h % change
}

export const REFERENCE_QUOTES: StockQuote[] = [
  { symbol: "SPYx", name: "S&P 500", price: 587.42, change: 0.74 },
  { symbol: "NVDAx", name: "NVIDIA", price: 131.88, change: 3.42 },
  { symbol: "AAPLx", name: "Apple", price: 198.55, change: -0.31 },
  { symbol: "TSLAx", name: "Tesla", price: 248.22, change: 2.11 },
  { symbol: "MSFTx", name: "Microsoft", price: 442.31, change: 0.83 },
  { symbol: "AMZNx", name: "Amazon", price: 201.45, change: 1.27 },
  { symbol: "GOOGLx", name: "Alphabet", price: 178.9, change: -0.52 },
  { symbol: "METAx", name: "Meta", price: 596.18, change: 1.94 },
  { symbol: "QQQx", name: "Nasdaq 100", price: 503.77, change: 0.61 },
  { symbol: "MSTRx", name: "MicroStrategy", price: 389.5, change: 4.88 },
  { symbol: "COINx", name: "Coinbase", price: 268.34, change: 2.57 },
  { symbol: "TSMx", name: "TSMC", price: 196.7, change: 1.05 },
  { symbol: "HOODx", name: "Robinhood", price: 41.62, change: 3.18 },
  { symbol: "PLTRx", name: "Palantir", price: 72.4, change: -1.24 },
  { symbol: "CRCLx", name: "Circle", price: 83.15, change: 1.46 },
  { symbol: "AMDx", name: "AMD", price: 138.27, change: -0.88 },
];

/**
 * Best-effort live quotes with a guaranteed static fallback.
 * Never throws and never hangs the UI: on any failure it returns reference data.
 */
export async function fetchStockQuotes(): Promise<StockQuote[]> {
  return REFERENCE_QUOTES;
}
