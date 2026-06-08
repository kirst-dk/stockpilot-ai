const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StockPilotAgent", function () {
  let agent;
  let owner;
  let user;
  let mockUSDC;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Use a placeholder address for USDC in testing
    const usdcAddress = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

    const StockPilotAgent = await ethers.getContractFactory("StockPilotAgent");
    agent = await StockPilotAgent.deploy("Test Agent", usdcAddress, owner.address);
    await agent.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct agent name", async function () {
      expect(await agent.agentName()).to.equal("Test Agent");
    });

    it("should set the correct owner", async function () {
      expect(await agent.owner()).to.equal(owner.address);
    });

    it("should set the default strategy", async function () {
      const strategy = await agent.currentStrategy();
      expect(strategy.name).to.equal("Balanced Growth");
      expect(strategy.riskLevel).to.equal(5);
    });
  });

  describe("Token Management", function () {
    const tokenAddress = "0x1234567890123456789012345678901234567890";

    it("should add supported tokens", async function () {
      await agent.addSupportedToken(tokenAddress, "TSLAx");
      expect(await agent.supportedTokens(tokenAddress)).to.be.true;
    });

    it("should emit event on token addition", async function () {
      await expect(agent.addSupportedToken(tokenAddress, "TSLAx"))
        .to.emit(agent, "TokenAdded")
        .withArgs(tokenAddress, "TSLAx");
    });

    it("should not add duplicate tokens", async function () {
      await agent.addSupportedToken(tokenAddress, "TSLAx");
      await expect(agent.addSupportedToken(tokenAddress, "TSLAx"))
        .to.be.revertedWith("Token already supported");
    });
  });

  describe("Agent Actions", function () {
    const tokenAddress = "0x1234567890123456789012345678901234567890";
    const price = ethers.parseUnits("250", 8); // $250.00

    beforeEach(async function () {
      await agent.addSupportedToken(tokenAddress, "TSLAx");
    });

    it("should execute buy action", async function () {
      const amount = ethers.parseEther("10");
      await agent.executeBuy(tokenAddress, amount, price, "AI: Strong momentum signal");

      const position = await agent.positions(tokenAddress);
      expect(position.isActive).to.be.true;
      expect(position.amount).to.equal(amount);
      expect(position.entryPriceUsd).to.equal(price);
    });

    it("should record action in history", async function () {
      const amount = ethers.parseEther("10");
      await agent.executeBuy(tokenAddress, amount, price, "Test buy");

      expect(await agent.getActionCount()).to.equal(1);
    });

    it("should emit action event", async function () {
      const amount = ethers.parseEther("10");
      await expect(agent.executeBuy(tokenAddress, amount, price, "Test buy"))
        .to.emit(agent, "AgentActionRecorded");
    });

    it("should execute sell action", async function () {
      const buyAmount = ethers.parseEther("10");
      await agent.executeBuy(tokenAddress, buyAmount, price, "Buy");

      const sellAmount = ethers.parseEther("5");
      const sellPrice = ethers.parseUnits("260", 8);
      await agent.executeSell(tokenAddress, sellAmount, sellPrice, "Take profit");

      const position = await agent.positions(tokenAddress);
      expect(position.amount).to.equal(ethers.parseEther("5"));
      expect(position.isActive).to.be.true;
    });

    it("should close position when fully sold", async function () {
      const amount = ethers.parseEther("10");
      await agent.executeBuy(tokenAddress, amount, price, "Buy");
      await agent.executeSell(tokenAddress, amount, price, "Close position");

      const position = await agent.positions(tokenAddress);
      expect(position.isActive).to.be.false;
    });

    it("should reject buy for unsupported token", async function () {
      const otherToken = "0x0000000000000000000000000000000000000099";
      await expect(
        agent.executeBuy(otherToken, ethers.parseEther("1"), price, "Fail")
      ).to.be.revertedWith("Token not supported");
    });

    it("should reject sell without position", async function () {
      await expect(
        agent.executeSell(tokenAddress, ethers.parseEther("1"), price, "Fail")
      ).to.be.revertedWith("No active position");
    });
  });

  describe("Strategy Management", function () {
    it("should update strategy", async function () {
      await agent.setStrategy("Aggressive Growth", 8, 4000, 1500, 3000);
      const strategy = await agent.currentStrategy();
      expect(strategy.name).to.equal("Aggressive Growth");
      expect(strategy.riskLevel).to.equal(8);
    });

    it("should reject invalid risk level", async function () {
      await expect(agent.setStrategy("Bad", 0, 2500, 1000, 2000))
        .to.be.revertedWith("Risk level must be 1-10");
    });
  });

  describe("Performance Metrics", function () {
    it("should track total trades", async function () {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      await agent.addSupportedToken(tokenAddress, "TSLAx");

      const amount = ethers.parseEther("10");
      const price = ethers.parseUnits("250", 8);

      await agent.executeBuy(tokenAddress, amount, price, "Buy");
      await agent.executeSell(tokenAddress, amount, ethers.parseUnits("260", 8), "Sell");

      const metrics = await agent.getPerformanceMetrics();
      expect(metrics.totalTrades).to.equal(2);
      expect(metrics.profitable).to.equal(1);
    });
  });

  describe("Access Control", function () {
    it("should prevent non-owner from executing trades", async function () {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      await agent.addSupportedToken(tokenAddress, "TSLAx");

      await expect(
        agent.connect(user).executeBuy(
          tokenAddress, ethers.parseEther("1"), ethers.parseUnits("100", 8), "Unauthorized"
        )
      ).to.be.reverted;
    });
  });

  describe("Autopilot — Autonomous RWA Yield Agent", function () {
    // Regime: 0=RISK_OFF, 1=NEUTRAL, 2=RISK_ON
    const NEUTRAL = 1, RISK_ON = 2, RISK_OFF = 0;

    it("defaults the agent to the owner", async function () {
      expect(await agent.agent()).to.equal(owner.address);
    });

    it("records a neutral (40/40/20) decision and exposes it via views", async function () {
      await expect(agent.recordDecision(NEUTRAL, 4000, 4000, 2000, "Mixed signals"))
        .to.emit(agent, "DecisionRecorded")
        .withArgs(0, NEUTRAL, 4000, 4000, 2000, "Mixed signals", anyValueTs());

      expect(await agent.getDecisionCount()).to.equal(1);
      const d = await agent.getDecision(0);
      expect(d.regime).to.equal(NEUTRAL);
      expect(d.wStocks).to.equal(4000);
      expect(d.wUSDY).to.equal(4000);
      expect(d.wMETH).to.equal(2000);
      expect(d.reason).to.equal("Mixed signals");

      const t = await agent.getTargetWeights();
      expect(t[0]).to.equal(4000);
      expect(t[1]).to.equal(4000);
      expect(t[2]).to.equal(2000);
    });

    it("records a risk-on (55/20/25) decision", async function () {
      await agent.recordDecision(RISK_ON, 5500, 2000, 2500, "Smart money inflow, low vol");
      const d = await agent.getLatestDecision();
      expect(d.regime).to.equal(RISK_ON);
      expect(d.wStocks).to.equal(5500);
    });

    it("returns recent decisions newest-first", async function () {
      await agent.recordDecision(NEUTRAL, 4000, 4000, 2000, "first");
      await agent.recordDecision(RISK_ON, 5500, 2000, 2500, "second");
      const recent = await agent.getRecentDecisions(10);
      expect(recent.length).to.equal(2);
      expect(recent[0].reason).to.equal("second");
      expect(recent[1].reason).to.equal("first");
    });

    it("rejects weights that do not sum to 10000", async function () {
      await expect(agent.recordDecision(NEUTRAL, 4000, 4000, 1000, "bad"))
        .to.be.revertedWith("Weights must sum to 10000");
    });

    it("rejects an invalid regime value", async function () {
      await expect(agent.recordDecision(5, 4000, 4000, 2000, "bad regime"))
        .to.be.revertedWith("Invalid regime");
    });

    it("enforces maxAssetWeight guardrail", async function () {
      // 80% to a single layer exceeds the 70% default cap
      await expect(agent.recordDecision(RISK_OFF, 1000, 8000, 1000, "too concentrated"))
        .to.be.revertedWith("Asset weight exceeds guardrail");
    });

    it("enforces minUSDYWeightRiskOff in RISK_OFF", async function () {
      // risk-off but USDY only 30% < 50% minimum
      await expect(agent.recordDecision(RISK_OFF, 4000, 3000, 3000, "weak defense"))
        .to.be.revertedWith("USDY below risk-off minimum");
    });

    it("accepts a compliant risk-off (20/65/15) decision", async function () {
      await agent.recordDecision(RISK_OFF, 2000, 6500, 1500, "High vol, flight to safety");
      const d = await agent.getLatestDecision();
      expect(d.wUSDY).to.equal(6500);
    });

    it("allows owner to set a dedicated agent wallet and that wallet to record", async function () {
      await expect(agent.setAgent(user.address))
        .to.emit(agent, "AgentUpdated").withArgs(owner.address, user.address);
      await agent.connect(user).recordDecision(NEUTRAL, 4000, 4000, 2000, "by agent");
      expect(await agent.getDecisionCount()).to.equal(1);
    });

    it("prevents a non-agent / non-owner from recording", async function () {
      await expect(
        agent.connect(user).recordDecision(NEUTRAL, 4000, 4000, 2000, "unauthorized")
      ).to.be.revertedWith("Not authorized agent");
    });

    it("lets owner update guardrails and enforces the new cap", async function () {
      await expect(agent.setGuardrails(5000, 1500, 4000))
        .to.emit(agent, "GuardrailsUpdated").withArgs(5000, 1500, 4000);
      // 55% now exceeds the new 50% cap
      await expect(agent.recordDecision(RISK_ON, 5500, 2000, 2500, "now too big"))
        .to.be.revertedWith("Asset weight exceeds guardrail");
    });

    it("prevents non-owner from changing guardrails / agent", async function () {
      await expect(agent.connect(user).setGuardrails(5000, 1500, 4000)).to.be.reverted;
      await expect(agent.connect(user).setAgent(user.address)).to.be.reverted;
    });
  });
});

// Helper: matches any timestamp argument in event assertions.
function anyValueTs() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
