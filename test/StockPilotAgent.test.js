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
});
