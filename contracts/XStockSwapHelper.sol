// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC4626 {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title XStockSwapHelper
/// @notice Wraps/unwraps xStock tokens and swaps via Fluxion (Uniswap V3) in a single transaction.
///         User only needs to approve this contract once per token.
contract XStockSwapHelper {
    ISwapRouter public immutable router;

    constructor(address _router) {
        router = ISwapRouter(_router);
    }

    /// @notice Wrap original xStock → swap wrapped for output token (e.g., NVDAx → USDC)
    /// @param xstock Original xStock token address
    /// @param wrapper Wrapped xStock (ERC-4626 vault) address
    /// @param tokenOut Output token address (e.g., USDC)
    /// @param amountIn Amount of original xStock to sell
    /// @param fee Pool fee tier (e.g., 3000 = 0.3%, 10000 = 1%)
    /// @param amountOutMin Minimum output amount (slippage protection)
    /// @param deadline Transaction deadline timestamp
    function wrapAndSwap(
        address xstock,
        address wrapper,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        require(IERC20(xstock).transferFrom(msg.sender, address(this), amountIn), "transferFrom failed");
        IERC20(xstock).approve(wrapper, amountIn);
        uint256 shares = IERC4626(wrapper).deposit(amountIn, address(this));

        IERC20(wrapper).approve(address(router), shares);
        amountOut = router.exactInputSingle(ISwapRouter.ExactInputSingleParams({
            tokenIn: wrapper,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender,
            deadline: deadline,
            amountIn: shares,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        }));
    }

    /// @notice Swap input token for wrapped xStock → unwrap to original (e.g., USDC → NVDAx)
    /// @param tokenIn Input token address (e.g., USDC)
    /// @param wrapper Wrapped xStock (ERC-4626 vault) address
    /// @param amountIn Amount of input token to spend
    /// @param fee Pool fee tier
    /// @param amountOutMin Minimum wrapped shares output (slippage protection)
    /// @param deadline Transaction deadline timestamp
    function swapAndUnwrap(
        address tokenIn,
        address wrapper,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256 assets) {
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "transferFrom failed");
        IERC20(tokenIn).approve(address(router), amountIn);
        uint256 shares = router.exactInputSingle(ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: wrapper,
            fee: fee,
            recipient: address(this),
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        }));

        assets = IERC4626(wrapper).redeem(shares, msg.sender, address(this));
    }
}
