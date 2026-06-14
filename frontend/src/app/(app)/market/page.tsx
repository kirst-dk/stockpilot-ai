"use client";

import { MarketTab, useAppData } from "@/components/AppCore";

export default function MarketPage() {
  const d = useAppData();
  return (
    <MarketTab
      strategies={d.strategies}
      activeStrategy={d.activeStrategy}
      setActiveStrategy={d.setActiveStrategy}
      strategyAiInfo={d.strategyAiInfo}
      strategyAiLoading={d.strategyAiLoading}
      getStrategyAiInfo={d.getStrategyAiInfo}
      allXStocks={d.allXStocks}
      xStocksLoading={d.xStocksLoading}
      filteredXStocks={d.filteredXStocks}
      xStocksFilter={d.xStocksFilter}
      setXStocksFilter={d.setXStocksFilter}
      xStocksCategory={d.xStocksCategory}
      setXStocksCategory={d.setXStocksCategory}
      aiStockInfo={d.aiStockInfo}
      aiStockLoading={d.aiStockLoading}
      getStockAiInfo={d.getStockAiInfo}
      setActiveTab={d.setActiveTab}
    />
  );
}
