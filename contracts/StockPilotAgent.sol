// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StockPilotAgent - AI Agent for managing tokenized equity portfolios on Mantle
/// @notice Autonomous agent that manages xStocks positions based on AI-driven strategies
/// @dev All agent decisions are recorded on-chain for transparency and benchmarking
contract StockPilotAgent is Ownable {
    using SafeERC20 for IERC20;

    // --- Types ---

    enum ActionType {
        BUY,
        SELL,
        REBALANCE,
        STOP_LOSS,
        TAKE_PROFIT
    }

    struct AgentAction {
        ActionType actionType;
        address xStockToken;
        uint256 amount;
        uint256 priceUsd; // scaled by 1e8
        string reasoning; // AI reasoning for transparency
        uint256 timestamp;
    }

    struct Position {
        address xStockToken;
        string symbol;
        uint256 amount;
        uint256 entryPriceUsd; // scaled by 1e8
        uint256 currentPriceUsd; // scaled by 1e8
        uint256 openedAt;
        bool isActive;
    }

    struct Strategy {
        string name;
        uint256 riskLevel; // 1-10
        uint256 maxPositionSize; // basis points of total portfolio (10000 = 100%)
        uint256 stopLossPercent; // basis points
        uint256 takeProfitPercent; // basis points
        bool isActive;
    }

    /// @notice A recorded AI Yield Optimizer decision: how capital is split between
    /// USDY (tokenized US Treasuries) and xStocks (growth) at a point in time.
    struct YieldDecision {
        uint8   usdyPct;
        uint8   stocksPct;
        string  reason;
        uint256 usdyYieldBps; // yield in basis points, e.g. 523 = 5.23%
        uint256 timestamp;
    }

    // --- State ---

    string public agentName;
    string public agentVersion;

    Strategy public currentStrategy;

    mapping(address => Position) public positions;
    address[] public activePositionTokens;

    AgentAction[] public actionHistory;

    address public stablecoin; // USDC on Mantle
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    // Supported xStock tokens
    mapping(address => bool) public supportedTokens;
    address[] public tokenList;

    // Performance tracking
    uint256 public portfolioHighWaterMark;
    uint256 public totalTradesExecuted;
    uint256 public profitableTrades;
    uint256 public totalPnlUsd; // can be negative, stored as int via offset

    // RWA / AI Yield Optimizer — history of USDY vs xStocks allocation decisions
    YieldDecision[] public yieldDecisionHistory;

    // --- Events ---

    event AgentActionRecorded(
        ActionType indexed actionType,
        address indexed token,
        uint256 amount,
        uint256 priceUsd,
        string reasoning
    );
    event StrategyChanged(string name, uint256 riskLevel);
    event TokenAdded(address indexed token, string symbol);
    event TokenRemoved(address indexed token);
    event FundsDeposited(address indexed token, uint256 amount);
    event FundsWithdrawn(address indexed token, uint256 amount);
    event PortfolioValueUpdated(uint256 totalValueUsd);
    event YieldDecisionRecorded(
        uint8   indexed usdyPct,
        uint8   indexed stocksPct,
        string  reason,
        uint256 timestamp
    );

    // --- Constructor ---

    constructor(
        string memory _agentName,
        address _stablecoin,
        address _owner
    ) Ownable(_owner) {
        agentName = _agentName;
        agentVersion = "1.0.0";
        stablecoin = _stablecoin;

        currentStrategy = Strategy({
            name: "Balanced Growth",
            riskLevel: 5,
            maxPositionSize: 2500, // 25%
            stopLossPercent: 1000, // 10%
            takeProfitPercent: 2000, // 20%
            isActive: true
        });
    }

    // --- Agent Actions (called by AI backend) ---

    /// @notice Execute a buy action for an xStock token
    /// @param xStockToken The xStock token address on Mantle
    /// @param amount Amount of stablecoin to spend
    /// @param priceUsd Current price in USD (scaled by 1e8)
    /// @param reasoning AI reasoning for this decision
    function executeBuy(
        address xStockToken,
        uint256 amount,
        uint256 priceUsd,
        string calldata reasoning
    ) external onlyOwner {
        require(supportedTokens[xStockToken], "Token not supported");
        require(amount > 0, "Amount must be > 0");

        // Record action on-chain
        _recordAction(ActionType.BUY, xStockToken, amount, priceUsd, reasoning);

        // Update position
        Position storage pos = positions[xStockToken];
        if (!pos.isActive) {
            pos.xStockToken = xStockToken;
            pos.entryPriceUsd = priceUsd;
            pos.openedAt = block.timestamp;
            pos.isActive = true;
            activePositionTokens.push(xStockToken);
        }
        pos.amount += amount;
        pos.currentPriceUsd = priceUsd;

        totalTradesExecuted++;
    }

    /// @notice Execute a sell action for an xStock token
    /// @param xStockToken The xStock token address
    /// @param amount Amount of xStock tokens to sell
    /// @param priceUsd Current price in USD (scaled by 1e8)
    /// @param reasoning AI reasoning for this decision
    function executeSell(
        address xStockToken,
        uint256 amount,
        uint256 priceUsd,
        string calldata reasoning
    ) external onlyOwner {
        Position storage pos = positions[xStockToken];
        require(pos.isActive, "No active position");
        require(pos.amount >= amount, "Insufficient position");

        _recordAction(ActionType.SELL, xStockToken, amount, priceUsd, reasoning);

        pos.amount -= amount;
        pos.currentPriceUsd = priceUsd;

        if (priceUsd > pos.entryPriceUsd) {
            profitableTrades++;
        }

        if (pos.amount == 0) {
            pos.isActive = false;
            _removeFromActivePositions(xStockToken);
        }

        totalTradesExecuted++;
    }

    /// @notice Execute a portfolio rebalance
    /// @param tokens Array of token addresses
    /// @param amounts Array of new target amounts
    /// @param prices Array of current prices (scaled by 1e8)
    /// @param reasoning AI reasoning for rebalance
    function executeRebalance(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata prices,
        string calldata reasoning
    ) external onlyOwner {
        require(tokens.length == amounts.length && amounts.length == prices.length, "Array length mismatch");

        for (uint256 i = 0; i < tokens.length; i++) {
            Position storage pos = positions[tokens[i]];
            pos.amount = amounts[i];
            pos.currentPriceUsd = prices[i];

            if (amounts[i] > 0 && !pos.isActive) {
                pos.xStockToken = tokens[i];
                pos.entryPriceUsd = prices[i];
                pos.openedAt = block.timestamp;
                pos.isActive = true;
                activePositionTokens.push(tokens[i]);
            } else if (amounts[i] == 0 && pos.isActive) {
                pos.isActive = false;
                _removeFromActivePositions(tokens[i]);
            }
        }

        _recordAction(ActionType.REBALANCE, address(0), 0, 0, reasoning);
        totalTradesExecuted++;
    }

    /// @notice Update prices for all active positions
    /// @param tokens Token addresses to update
    /// @param prices New prices (scaled by 1e8)
    function updatePrices(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external onlyOwner {
        require(tokens.length == prices.length, "Array length mismatch");

        for (uint256 i = 0; i < tokens.length; i++) {
            if (positions[tokens[i]].isActive) {
                positions[tokens[i]].currentPriceUsd = prices[i];
            }
        }

        uint256 totalValue = getTotalPortfolioValueUsd();
        if (totalValue > portfolioHighWaterMark) {
            portfolioHighWaterMark = totalValue;
        }

        emit PortfolioValueUpdated(totalValue);
    }

    // --- Strategy Management ---

    /// @notice Update the active trading strategy
    function setStrategy(
        string calldata name,
        uint256 riskLevel,
        uint256 maxPositionSize,
        uint256 stopLossPercent,
        uint256 takeProfitPercent
    ) external onlyOwner {
        require(riskLevel >= 1 && riskLevel <= 10, "Risk level must be 1-10");
        require(maxPositionSize <= 10000, "Max position size exceeded");

        currentStrategy = Strategy({
            name: name,
            riskLevel: riskLevel,
            maxPositionSize: maxPositionSize,
            stopLossPercent: stopLossPercent,
            takeProfitPercent: takeProfitPercent,
            isActive: true
        });

        emit StrategyChanged(name, riskLevel);
    }

    // --- Token Management ---

    /// @notice Add a supported xStock token
    function addSupportedToken(address token, string calldata symbol) external onlyOwner {
        require(!supportedTokens[token], "Token already supported");
        supportedTokens[token] = true;
        tokenList.push(token);

        // Initialize position
        positions[token].xStockToken = token;
        positions[token].symbol = symbol;

        emit TokenAdded(token, symbol);
    }

    /// @notice Remove a supported xStock token
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "Token not supported");
        require(!positions[token].isActive, "Cannot remove token with active position");
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    // --- Fund Management ---

    /// @notice Deposit stablecoin into the agent
    function deposit(uint256 amount) external {
        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        emit FundsDeposited(stablecoin, amount);
    }

    /// @notice Withdraw stablecoin from the agent
    function withdraw(uint256 amount) external onlyOwner {
        IERC20(stablecoin).safeTransfer(owner(), amount);
        totalWithdrawn += amount;
        emit FundsWithdrawn(stablecoin, amount);
    }

    /// @notice Withdraw xStock tokens from the agent
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit FundsWithdrawn(token, amount);
    }

    // --- View Functions ---

    /// @notice Get total portfolio value in USD (scaled by 1e8)
    function getTotalPortfolioValueUsd() public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < activePositionTokens.length; i++) {
            Position storage pos = positions[activePositionTokens[i]];
            if (pos.isActive) {
                total += (pos.amount * pos.currentPriceUsd) / 1e18;
            }
        }
        return total;
    }

    /// @notice Get all active positions
    function getActivePositions() external view returns (Position[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < activePositionTokens.length; i++) {
            if (positions[activePositionTokens[i]].isActive) {
                count++;
            }
        }

        Position[] memory result = new Position[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < activePositionTokens.length; i++) {
            if (positions[activePositionTokens[i]].isActive) {
                result[idx] = positions[activePositionTokens[i]];
                idx++;
            }
        }
        return result;
    }

    /// @notice Get action history length
    function getActionCount() external view returns (uint256) {
        return actionHistory.length;
    }

    /// @notice Get paginated action history
    function getActions(uint256 offset, uint256 limit) external view returns (AgentAction[] memory) {
        uint256 end = offset + limit;
        if (end > actionHistory.length) {
            end = actionHistory.length;
        }
        uint256 length = end - offset;

        AgentAction[] memory result = new AgentAction[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = actionHistory[offset + i];
        }
        return result;
    }

    /// @notice Get number of supported tokens
    function getTokenCount() external view returns (uint256) {
        return tokenList.length;
    }

    /// @notice Get the number of active positions
    function getActivePositionCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < activePositionTokens.length; i++) {
            if (positions[activePositionTokens[i]].isActive) {
                count++;
            }
        }
        return count;
    }

    /// @notice Get agent performance metrics
    function getPerformanceMetrics()
        external
        view
        returns (
            uint256 totalTrades,
            uint256 profitable,
            uint256 highWaterMark,
            uint256 currentValue,
            uint256 deposited,
            uint256 withdrawn
        )
    {
        return (
            totalTradesExecuted,
            profitableTrades,
            portfolioHighWaterMark,
            getTotalPortfolioValueUsd(),
            totalDeposited,
            totalWithdrawn
        );
    }

    // --- RWA / AI Yield Optimizer ---

    /// @notice Record an AI yield-allocation decision (USDY vs xStocks) on-chain
    /// @param usdyPct Percentage allocated to USDY (0-100)
    /// @param stocksPct Percentage allocated to xStocks (0-100)
    /// @param reason AI reasoning for the allocation
    /// @param usdyYieldBps Current USDY yield in basis points (523 = 5.23%)
    function recordYieldDecision(
        uint8          usdyPct,
        uint8          stocksPct,
        string calldata reason,
        uint256        usdyYieldBps
    ) external onlyOwner {
        require(usdyPct + stocksPct == 100, "Percentages must sum to 100");
        yieldDecisionHistory.push(YieldDecision({
            usdyPct:      usdyPct,
            stocksPct:    stocksPct,
            reason:       reason,
            usdyYieldBps: usdyYieldBps,
            timestamp:    block.timestamp
        }));
        emit YieldDecisionRecorded(usdyPct, stocksPct, reason, block.timestamp);
    }

    /// @notice Number of recorded yield decisions
    function getYieldDecisionCount() external view returns (uint256) {
        return yieldDecisionHistory.length;
    }

    /// @notice Get the most recent yield decision
    function getLatestYieldDecision() external view returns (YieldDecision memory) {
        require(yieldDecisionHistory.length > 0, "No decisions yet");
        return yieldDecisionHistory[yieldDecisionHistory.length - 1];
    }

    /// @notice Get the most recent yield decisions, newest first (capped at `limit`)
    function getRecentYieldDecisions(uint256 limit) external view returns (YieldDecision[] memory) {
        uint256 total = yieldDecisionHistory.length;
        uint256 count = limit < total ? limit : total;
        YieldDecision[] memory result = new YieldDecision[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = yieldDecisionHistory[total - 1 - i];
        }
        return result;
    }

    // --- Internal ---

    function _recordAction(
        ActionType actionType,
        address token,
        uint256 amount,
        uint256 priceUsd,
        string memory reasoning
    ) internal {
        actionHistory.push(
            AgentAction({
                actionType: actionType,
                xStockToken: token,
                amount: amount,
                priceUsd: priceUsd,
                reasoning: reasoning,
                timestamp: block.timestamp
            })
        );

        emit AgentActionRecorded(actionType, token, amount, priceUsd, reasoning);
    }

    function _removeFromActivePositions(address token) internal {
        for (uint256 i = 0; i < activePositionTokens.length; i++) {
            if (activePositionTokens[i] == token) {
                activePositionTokens[i] = activePositionTokens[activePositionTokens.length - 1];
                activePositionTokens.pop();
                break;
            }
        }
    }
}
