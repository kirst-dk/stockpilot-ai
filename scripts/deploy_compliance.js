/**
 * Deploy StockPilotComplianceAttestor — on-chain, verifiable pre-trade compliance attestations
 * for the StockPilot autonomous agent, and authorize the agent wallet to attest.
 *
 *   AGENT_OPERATOR — wallet the agent executes/attests with. Defaults to deployer.
 *
 * Run: npx hardhat run scripts/deploy_compliance.js --network mantleMainnet
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const operator = process.env.AGENT_OPERATOR || deployer.address;

  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "MNT");

  const Attestor = await hre.ethers.getContractFactory("StockPilotComplianceAttestor");
  const attestor = await Attestor.deploy(deployer.address, operator);
  await attestor.waitForDeployment();
  const addr = await attestor.getAddress();
  console.log("StockPilotComplianceAttestor deployed to:", addr);
  console.log("Authorized agent:", operator);

  console.log("\n--- Summary ---");
  console.log("StockPilotComplianceAttestor:", addr);
  console.log("owner:", deployer.address);
  console.log("agent:", operator);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for confirmations before verify...");
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", { address: addr, constructorArguments: [deployer.address, operator] });
      console.log("Verified on Mantlescan!");
    } catch (e) {
      console.log("Verification note:", e.message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
