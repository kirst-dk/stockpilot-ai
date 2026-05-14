const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "MNT");

  // USDC on Mantle (use testnet address for sepolia)
  const USDC_MANTLE = process.env.USDC_ADDRESS || "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";

  // Deploy StockPilotAgent
  const StockPilotAgent = await hre.ethers.getContractFactory("StockPilotAgent");
  const agent = await StockPilotAgent.deploy(
    "StockPilot AI Agent",
    USDC_MANTLE,
    deployer.address
  );
  await agent.waitForDeployment();
  const agentAddress = await agent.getAddress();
  console.log("StockPilotAgent deployed to:", agentAddress);

  // Add supported xStocks tokens
  // These addresses should be updated with real xStock token addresses on Mantle
  const xStockTokens = [
    { address: process.env.XSTOCK_SPY || "0x0000000000000000000000000000000000000001", symbol: "SPYx" },
    { address: process.env.XSTOCK_NVDA || "0x0000000000000000000000000000000000000002", symbol: "NVDAx" },
    { address: process.env.XSTOCK_AAPL || "0x0000000000000000000000000000000000000003", symbol: "AAPLx" },
    { address: process.env.XSTOCK_TSLA || "0x0000000000000000000000000000000000000004", symbol: "TSLAx" },
    { address: process.env.XSTOCK_MSFT || "0x0000000000000000000000000000000000000005", symbol: "MSFTx" },
  ];

  for (const token of xStockTokens) {
    if (token.address !== "0x0000000000000000000000000000000000000001") {
      try {
        const tx = await agent.addSupportedToken(token.address, token.symbol);
        await tx.wait();
        console.log(`Added ${token.symbol} (${token.address})`);
      } catch (e) {
        console.log(`Skipped ${token.symbol}: ${e.message}`);
      }
    }
  }

  console.log("\n--- Deployment Summary ---");
  console.log("Network:", hre.network.name);
  console.log("StockPilotAgent:", agentAddress);
  console.log("Owner:", deployer.address);
  console.log("Stablecoin (USDC):", USDC_MANTLE);

  // Verify contract if on a live network
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    await new Promise((resolve) => setTimeout(resolve, 30000));

    try {
      await hre.run("verify:verify", {
        address: agentAddress,
        constructorArguments: ["StockPilot AI Agent", USDC_MANTLE, deployer.address],
      });
      console.log("Contract verified on Mantlescan!");
    } catch (e) {
      console.log("Verification failed:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
