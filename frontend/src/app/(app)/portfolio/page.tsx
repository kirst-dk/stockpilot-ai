"use client";

import { DashboardTab, useAppData } from "@/components/AppCore";

export default function PortfolioPage() {
  const d = useAppData();
  return (
    <DashboardTab
      isConnected={d.isConnected}
      address={d.address}
      balance={d.balance}
      portfolioSelected={d.portfolioSelected}
      selectedStrategy={d.selectedStrategy}
      strategy={d.strategy}
      totalAllocation={d.totalAllocation}
      selectedCount={d.selectedCount}
      toggleXStock={d.toggleXStock}
      updateAllocation={d.updateAllocation}
      applyAiStrategy={d.applyAiStrategy}
      analyzePortfolio={d.analyzePortfolio}
      aiAnalysis={d.aiAnalysis}
      aiAnalyzing={d.aiAnalyzing}
      allXStocks={d.allXStocks}
      setActiveTab={d.setActiveTab}
    />
  );
}
