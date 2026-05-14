// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPortfolioManager {
    struct Position {
        address xStockToken;
        uint256 amount;
        uint256 entryPriceUsd; // scaled by 1e8
        uint256 timestamp;
    }

    struct PortfolioAllocation {
        address xStockToken;
        uint256 targetWeight; // basis points (10000 = 100%)
    }

    event PositionOpened(address indexed token, uint256 amount, uint256 priceUsd);
    event PositionClosed(address indexed token, uint256 amount, uint256 priceUsd);
    event PortfolioRebalanced(uint256 timestamp);
    event StrategyUpdated(string strategyName);

    function openPosition(address xStockToken, uint256 amount, uint256 priceUsd) external;
    function closePosition(address xStockToken, uint256 amount, uint256 priceUsd) external;
    function rebalance(PortfolioAllocation[] calldata allocations) external;
    function getPositions() external view returns (Position[] memory);
    function getTotalValueUsd() external view returns (uint256);
}
