// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title StockPilotAgentIdentity — ERC-8004-style agent identity, reputation & verifiable-AI anchor
/// @notice Issues a unique on-chain identity NFT to the StockPilot autonomous agent (the
/// hackathon's ERC-8004 "agent identity" requirement), tracks its reputation from recorded
/// decisions, and anchors a keccak256 hash of each decision's AI rationale so anyone can later
/// prove the reasoning they were shown matches what the agent committed on-chain (verifiable AI,
/// not a black box).
/// @dev Kept as a separate contract from StockPilotAgent so the existing on-chain decision
/// history is preserved (no redeploy of the core agent). The agent wallet is registered here and
/// anchors rationale hashes after each recordDecision call.
contract StockPilotAgentIdentity is ERC721, Ownable {
    // --- Identity (ERC-8004) ---

    struct Agent {
        address operator;      // wallet the agent signs/executes with
        string  name;          // human-readable agent name
        string  metadataURI;   // off-chain agent card / metadata (ERC-8004 resolvable pointer)
        uint256 registeredAt;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;          // agentId => Agent
    mapping(address => uint256) public agentIdOf;     // operator => agentId (0 = none)

    // --- Reputation ---

    struct Reputation {
        uint256 decisions;     // number of decisions attributed to the agent
        uint256 anchors;       // number of rationale hashes anchored
        int256  score;         // cumulative reputation score (e.g. loss-avoided bps, +/- feedback)
        uint256 lastUpdate;
    }

    mapping(uint256 => Reputation) public reputationOf; // agentId => Reputation

    // --- Verifiable-AI rationale anchors ---

    struct Anchor {
        uint256 agentId;
        uint256 decisionRef;   // index of the decision in StockPilotAgent.decisionHistory
        bytes32 rationaleHash; // keccak256 of the full AI rationale string
        uint256 timestamp;
    }

    Anchor[] public anchors;
    mapping(bytes32 => bool) public anchoredHash; // rationaleHash => committed?

    // --- Events ---

    event AgentRegistered(uint256 indexed agentId, address indexed operator, string name, string metadataURI);
    event AgentMetadataUpdated(uint256 indexed agentId, string metadataURI);
    event RationaleAnchored(
        uint256 indexed agentId,
        uint256 indexed decisionRef,
        bytes32 indexed rationaleHash,
        uint256 anchorIndex,
        uint256 timestamp
    );
    event ReputationUpdated(uint256 indexed agentId, int256 delta, int256 newScore);

    constructor(address _owner)
        ERC721("StockPilot Agent Identity", "SPAID")
        Ownable(_owner)
    {}

    // --- Identity management ---

    /// @notice Register a new agent and mint its identity NFT to the operator wallet.
    /// @param operator The wallet the agent executes with (also the NFT holder).
    /// @param name Human-readable agent name.
    /// @param metadataURI ERC-8004 resolvable pointer to the agent card / metadata.
    /// @return agentId The freshly minted agent identity id.
    function registerAgent(
        address operator,
        string calldata name,
        string calldata metadataURI
    ) external onlyOwner returns (uint256 agentId) {
        require(operator != address(0), "Zero operator");
        require(agentIdOf[operator] == 0, "Operator already registered");

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            operator: operator,
            name: name,
            metadataURI: metadataURI,
            registeredAt: block.timestamp
        });
        agentIdOf[operator] = agentId;
        reputationOf[agentId] = Reputation({decisions: 0, anchors: 0, score: 0, lastUpdate: block.timestamp});

        _safeMint(operator, agentId);
        emit AgentRegistered(agentId, operator, name, metadataURI);
    }

    /// @notice Update an agent's off-chain metadata pointer.
    function setMetadataURI(uint256 agentId, string calldata metadataURI) external {
        require(_isAuthorized(agentId), "Not authorized");
        agents[agentId].metadataURI = metadataURI;
        emit AgentMetadataUpdated(agentId, metadataURI);
    }

    // --- Verifiable-AI: anchor a rationale hash for a decision ---

    /// @notice Anchor the keccak256 hash of a decision's AI rationale on-chain.
    /// @dev Callable by the agent operator (or owner). Increments reputation counters.
    /// @param decisionRef Index of the decision in StockPilotAgent.decisionHistory.
    /// @param rationaleHash keccak256(bytes(rationale)) committed by the agent.
    function anchorRationale(uint256 decisionRef, bytes32 rationaleHash) external returns (uint256 anchorIndex) {
        uint256 agentId = agentIdOf[msg.sender];
        require(agentId != 0 || msg.sender == owner(), "Not a registered agent");
        if (agentId == 0) {
            agentId = 1; // owner anchors on behalf of the primary agent
        }
        require(rationaleHash != bytes32(0), "Empty hash");

        anchorIndex = anchors.length;
        anchors.push(Anchor({
            agentId: agentId,
            decisionRef: decisionRef,
            rationaleHash: rationaleHash,
            timestamp: block.timestamp
        }));
        anchoredHash[rationaleHash] = true;

        Reputation storage rep = reputationOf[agentId];
        rep.decisions += 1;
        rep.anchors += 1;
        rep.lastUpdate = block.timestamp;

        emit RationaleAnchored(agentId, decisionRef, rationaleHash, anchorIndex, block.timestamp);
    }

    /// @notice Verify that a rationale string matches a previously anchored hash.
    /// @return True if keccak256 of the given rationale was committed on-chain.
    function verifyRationale(string calldata rationale) external view returns (bool) {
        return anchoredHash[keccak256(bytes(rationale))];
    }

    /// @notice Verify a raw hash was anchored.
    function verifyRationaleHash(bytes32 rationaleHash) external view returns (bool) {
        return anchoredHash[rationaleHash];
    }

    // --- Reputation feedback (e.g. Human-vs-AI loss-avoided bps, or client feedback) ---

    /// @notice Adjust an agent's cumulative reputation score. Owner-gated to keep it honest.
    function submitFeedback(uint256 agentId, int256 delta) external onlyOwner {
        require(agentId != 0 && agentId < nextAgentId, "Unknown agent");
        Reputation storage rep = reputationOf[agentId];
        rep.score += delta;
        rep.lastUpdate = block.timestamp;
        emit ReputationUpdated(agentId, delta, rep.score);
    }

    // --- Views ---

    function getAnchorCount() external view returns (uint256) {
        return anchors.length;
    }

    function getRecentAnchors(uint256 limit) external view returns (Anchor[] memory) {
        uint256 total = anchors.length;
        uint256 count = limit < total ? limit : total;
        Anchor[] memory out = new Anchor[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = anchors[total - 1 - i];
        }
        return out;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return agents[tokenId].metadataURI;
    }

    // --- Internal ---

    function _isAuthorized(uint256 agentId) internal view returns (bool) {
        return msg.sender == owner() || (agentId != 0 && agents[agentId].operator == msg.sender);
    }
}
