/**
 * Deploy StockPilotAgentIdentity (ERC-8004-style agent identity + reputation + rationale anchor)
 * and register the StockPilot autonomous agent, minting identity NFT #1 to the agent wallet.
 *
 *   AGENT_OPERATOR   — wallet the agent executes with (gets the identity NFT). Defaults to deployer.
 *   AGENT_METADATA_URI — ERC-8004 agent card pointer. Defaults to the hosted agent.json.
 *
 * Run: npx hardhat run scripts/deploy_identity.js --network mantleMainnet
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const operator = process.env.AGENT_OPERATOR || deployer.address;
  const metadataURI =
    process.env.AGENT_METADATA_URI || "https://app.stockpilotai.xyz/agent.json";

  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "MNT");

  const Identity = await hre.ethers.getContractFactory("StockPilotAgentIdentity");
  const identity = await Identity.deploy(deployer.address);
  await identity.waitForDeployment();
  const addr = await identity.getAddress();
  console.log("StockPilotAgentIdentity deployed to:", addr);

  const tx = await identity.registerAgent(
    operator,
    "StockPilot Autonomous RWA Agent",
    metadataURI
  );
  const rcpt = await tx.wait();
  const agentId = await identity.agentIdOf(operator);
  console.log("registerAgent tx:", rcpt.hash);
  console.log("Agent identity NFT minted — agentId:", agentId.toString(), "operator:", operator);

  console.log("\n--- Summary ---");
  console.log("StockPilotAgentIdentity:", addr);
  console.log("agentId:", agentId.toString());
  console.log("operator/holder:", operator);
  console.log("metadataURI:", metadataURI);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for confirmations before verify...");
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", { address: addr, constructorArguments: [deployer.address] });
      console.log("Verified on Mantlescan!");
    } catch (e) {
      console.log("Verification note:", e.message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
