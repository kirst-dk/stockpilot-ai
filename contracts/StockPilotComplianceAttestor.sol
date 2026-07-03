// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title StockPilotComplianceAttestor — on-chain pre-trade compliance attestations
/// @notice Makes the StockPilot agent's compliance gate *verifiable on-chain*: for every
/// autonomous cycle the agent commits a keccak256 hash of its full compliance verdict (region
/// gate + sanctioned-wallet screening + per-asset disclosures + which legs were blocked). Anyone
/// can later call `verifyCompliance(report)` and get a MATCH, proving the compliance decision the
/// UI shows is exactly what the agent committed — the compliance layer is auditable, not a claim.
/// @dev Deliberately separate from the core agent and the identity contract so nothing is
/// redeployed and the existing decision/rationale history is preserved. Mirrors the
/// `anchorRationale`/`verifyRationale` pattern already used for AI rationale, extended to a
/// structured, per-asset-class eligibility verdict (attestation) that can be re-read as events.
contract StockPilotComplianceAttestor is Ownable {
    struct Attestation {
        uint256 decisionRef;   // index of the decision in StockPilotAgent.decisionHistory
        address agent;         // wallet that produced the verdict
        bool    passed;        // true = no legs blocked; false = at least one leg hard-blocked
        bytes32 complianceHash;// keccak256 of the full compliance report string
        string  region;        // self-declared jurisdiction the gate was evaluated against
        uint16  blockedCount;  // number of legs blocked (securities/jurisdiction/sanctions)
        uint256 timestamp;
    }

    Attestation[] public attestations;
    mapping(bytes32 => bool) public attestedHash;   // complianceHash => committed?
    mapping(address => bool) public isAgent;        // wallets allowed to attest

    uint256 public totalAttestations;
    uint256 public totalBlocked;                    // cumulative legs blocked across all cycles

    event AgentAuthorized(address indexed agent, bool allowed);
    event ComplianceAttested(
        uint256 indexed attestationIndex,
        uint256 indexed decisionRef,
        address indexed agent,
        bool    passed,
        bytes32 complianceHash,
        string  region,
        uint16  blockedCount,
        uint256 timestamp
    );

    constructor(address _owner, address _agent) Ownable(_owner) {
        if (_agent != address(0)) {
            isAgent[_agent] = true;
            emit AgentAuthorized(_agent, true);
        }
    }

    /// @notice Authorize (or revoke) a wallet that may submit compliance attestations.
    function setAgent(address agent, bool allowed) external onlyOwner {
        require(agent != address(0), "Zero agent");
        isAgent[agent] = allowed;
        emit AgentAuthorized(agent, allowed);
    }

    /// @notice Commit a compliance verdict for a decision on-chain.
    /// @param decisionRef Index of the decision in StockPilotAgent.decisionHistory.
    /// @param passed True if no leg was blocked by the gate this cycle.
    /// @param region Self-declared jurisdiction the gate was evaluated against.
    /// @param blockedCount Number of legs blocked this cycle.
    /// @param complianceHash keccak256(bytes(report)) of the full compliance verdict.
    /// @return attestationIndex Index of the stored attestation.
    function attestCompliance(
        uint256 decisionRef,
        bool passed,
        string calldata region,
        uint16 blockedCount,
        bytes32 complianceHash
    ) external returns (uint256 attestationIndex) {
        require(isAgent[msg.sender] || msg.sender == owner(), "Not an authorized agent");
        require(complianceHash != bytes32(0), "Empty hash");

        attestationIndex = attestations.length;
        attestations.push(Attestation({
            decisionRef: decisionRef,
            agent: msg.sender,
            passed: passed,
            complianceHash: complianceHash,
            region: region,
            blockedCount: blockedCount,
            timestamp: block.timestamp
        }));
        attestedHash[complianceHash] = true;
        totalAttestations += 1;
        totalBlocked += blockedCount;

        emit ComplianceAttested(
            attestationIndex, decisionRef, msg.sender, passed, complianceHash, region, blockedCount, block.timestamp
        );
    }

    /// @notice Verify a compliance report string matches a previously committed attestation.
    /// @return True if keccak256 of the given report was committed on-chain.
    function verifyCompliance(string calldata report) external view returns (bool) {
        return attestedHash[keccak256(bytes(report))];
    }

    /// @notice Verify a raw compliance hash was committed.
    function verifyComplianceHash(bytes32 complianceHash) external view returns (bool) {
        return attestedHash[complianceHash];
    }

    // --- Views ---

    function getAttestationCount() external view returns (uint256) {
        return attestations.length;
    }

    function getRecentAttestations(uint256 limit) external view returns (Attestation[] memory) {
        uint256 total = attestations.length;
        uint256 count = limit < total ? limit : total;
        Attestation[] memory out = new Attestation[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = attestations[total - 1 - i];
        }
        return out;
    }

    function latestAttestation() external view returns (Attestation memory) {
        require(attestations.length > 0, "No attestations");
        return attestations[attestations.length - 1];
    }
}
