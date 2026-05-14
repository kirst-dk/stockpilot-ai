// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IxStock - Interface for xStocks tokenized equity tokens on Mantle
/// @notice xStocks are ERC-20 tokens with rebasing logic. balanceOf() returns adjusted balance automatically.
interface IxStock is IERC20 {
    /// @notice Returns the current multiplier (scaled by 1e18)
    function multiplier() external view returns (uint256);

    /// @notice Returns the underlying asset symbol (e.g., "TSLA", "AAPL")
    function underlyingSymbol() external view returns (string memory);
}
