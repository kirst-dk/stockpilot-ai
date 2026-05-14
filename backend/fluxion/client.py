"""Fluxion Network DEX client for on-chain xStocks trading on Mantle.

Fluxion is the core spot DEX on Mantle ecosystem, providing AMM V2/V3
liquidity pools and smart routing for optimal trade execution.

Docs: https://fluxion-network.gitbook.io/fluxion-network
Site: https://fluxion.network
"""

from web3 import Web3
from typing import Optional

# Fluxion Network contract addresses on Mantle Mainnet
FLUXION_CONTRACTS = {
    "v2": {
        "router": "0xd772E655af24Fe5Af92504D613D1Da0d9cFb6408",
        "pool_factory": "0x9336B143C572D75F1f2b7374532e8C96Eed41fe9",
        "factory_registry": "0x47c401407F11482d562E2c00b67944c379fD8710",
    },
    "v3": {
        "swap_router": "0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0",
        "factory": "0xF883162Ed9c7E8EF604214c964c678E40c9B737C",
        "quoter_v2": "0x3E4eE18Ac7280813236a1EB850679Da5322E14CE",
        "position_manager": "0x2b70C4e7cA8E920435A5dB191e066E9E3AFd8DB3",
    },
    "weth": "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8",
}

# Minimal ABIs for Fluxion interaction
QUOTER_V2_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenIn", "type": "address"},
            {"internalType": "address", "name": "tokenOut", "type": "address"},
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"},
            {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"},
        ],
        "name": "quoteExactInputSingle",
        "outputs": [
            {"internalType": "uint256", "name": "amountOut", "type": "uint256"},
            {"internalType": "uint160", "name": "sqrtPriceX96After", "type": "uint160"},
            {"internalType": "uint32", "name": "initializedTicksCrossed", "type": "uint32"},
            {"internalType": "uint256", "name": "gasEstimate", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

FACTORY_V3_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenA", "type": "address"},
            {"internalType": "address", "name": "tokenB", "type": "address"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"},
        ],
        "name": "getPool",
        "outputs": [{"internalType": "address", "name": "pool", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    }
]

ROUTER_V2_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "address[]", "name": "path", "type": "address[]"},
        ],
        "name": "getAmountsOut",
        "outputs": [
            {"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}
        ],
        "stateMutability": "view",
        "type": "function",
    }
]

# Standard fee tiers for V3 pools
FEE_TIERS = [100, 500, 3000, 10000]  # 0.01%, 0.05%, 0.3%, 1%

# Known stablecoin addresses on Mantle
MANTLE_STABLECOINS = {
    "USDC": "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    "USDT": "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
}


class FluxionClient:
    """Client for interacting with Fluxion Network DEX on Mantle.

    Provides price quoting, pool discovery, and swap routing for
    xStocks tokens on the secondary market via Fluxion's AMM.
    """

    def __init__(self, rpc_url: str = "https://rpc.mantle.xyz"):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.contracts = FLUXION_CONTRACTS

        # Initialize contract instances
        self.quoter_v3 = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.contracts["v3"]["quoter_v2"]),
            abi=QUOTER_V2_ABI,
        )
        self.factory_v3 = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.contracts["v3"]["factory"]),
            abi=FACTORY_V3_ABI,
        )
        self.router_v2 = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.contracts["v2"]["router"]),
            abi=ROUTER_V2_ABI,
        )

    def get_contract_addresses(self) -> dict:
        """Return all Fluxion contract addresses on Mantle."""
        return self.contracts

    def check_pool_exists(self, token_a: str, token_b: str, fee: int = 3000) -> str:
        """Check if a V3 liquidity pool exists for a token pair.

        Args:
            token_a: Address of first token
            token_b: Address of second token
            fee: Fee tier (100, 500, 3000, or 10000)

        Returns:
            Pool address or zero address if pool doesn't exist
        """
        pool = self.factory_v3.functions.getPool(
            Web3.to_checksum_address(token_a),
            Web3.to_checksum_address(token_b),
            fee,
        ).call()
        return pool

    def find_best_pool(self, token_a: str, token_b: str) -> dict:
        """Find the best available pool across all fee tiers.

        Returns:
            Dict with pool address, fee tier, and whether pool exists
        """
        zero_addr = "0x0000000000000000000000000000000000000000"
        for fee in FEE_TIERS:
            pool = self.check_pool_exists(token_a, token_b, fee)
            if pool != zero_addr:
                return {
                    "pool": pool,
                    "fee": fee,
                    "fee_percent": fee / 10000,
                    "exists": True,
                }
        return {"pool": zero_addr, "fee": 0, "fee_percent": 0, "exists": False}

    def get_quote_v3(
        self, token_in: str, token_out: str, amount_in: int, fee: int = 3000
    ) -> dict:
        """Get a price quote from Fluxion V3 pool.

        Args:
            token_in: Input token address
            token_out: Output token address
            amount_in: Amount of input token (in wei)
            fee: Pool fee tier

        Returns:
            Quote with expected output amount and gas estimate
        """
        try:
            result = self.quoter_v3.functions.quoteExactInputSingle(
                Web3.to_checksum_address(token_in),
                Web3.to_checksum_address(token_out),
                amount_in,
                fee,
                0,  # sqrtPriceLimitX96 = 0 means no limit
            ).call()

            return {
                "amount_out": result[0],
                "sqrt_price_after": result[1],
                "ticks_crossed": result[2],
                "gas_estimate": result[3],
                "fee_tier": fee,
                "source": "fluxion_v3",
            }
        except Exception as e:
            return {"error": str(e), "source": "fluxion_v3"}

    def get_quote_v2(
        self, token_in: str, token_out: str, amount_in: int
    ) -> dict:
        """Get a price quote from Fluxion V2 router.

        Args:
            token_in: Input token address
            token_out: Output token address
            amount_in: Amount of input token (in wei)

        Returns:
            Quote with expected output amount
        """
        try:
            path = [
                Web3.to_checksum_address(token_in),
                Web3.to_checksum_address(token_out),
            ]
            amounts = self.router_v2.functions.getAmountsOut(amount_in, path).call()
            return {
                "amount_out": amounts[-1],
                "path": path,
                "source": "fluxion_v2",
            }
        except Exception as e:
            return {"error": str(e), "source": "fluxion_v2"}

    def get_best_quote(
        self, token_in: str, token_out: str, amount_in: int
    ) -> dict:
        """Get the best quote across V2 and V3 pools.

        Compares quotes from all V3 fee tiers and V2, returns the best one.

        Args:
            token_in: Input token address
            token_out: Output token address
            amount_in: Amount of input token (in wei)

        Returns:
            Best available quote with source information
        """
        best = None

        # Try all V3 fee tiers
        for fee in FEE_TIERS:
            quote = self.get_quote_v3(token_in, token_out, amount_in, fee)
            if "error" not in quote:
                if best is None or quote["amount_out"] > best["amount_out"]:
                    best = quote

        # Try V2
        v2_quote = self.get_quote_v2(token_in, token_out, amount_in)
        if "error" not in v2_quote:
            if best is None or v2_quote["amount_out"] > best["amount_out"]:
                best = v2_quote

        if best is None:
            return {
                "error": "No liquidity available on Fluxion for this pair",
                "token_in": token_in,
                "token_out": token_out,
            }

        return best

    def get_xstock_liquidity_info(self, xstock_address: str) -> dict:
        """Check available liquidity for an xStock token on Fluxion.

        Scans all stablecoin pairs and fee tiers to find available pools.

        Args:
            xstock_address: Contract address of the xStock token on Mantle

        Returns:
            Dict with available pools and their details
        """
        pools = []
        for stable_name, stable_addr in MANTLE_STABLECOINS.items():
            for fee in FEE_TIERS:
                pool = self.check_pool_exists(xstock_address, stable_addr, fee)
                zero = "0x0000000000000000000000000000000000000000"
                if pool != zero:
                    pools.append({
                        "pair": f"xStock/{stable_name}",
                        "pool_address": pool,
                        "fee_tier": fee,
                        "fee_percent": fee / 10000,
                        "stablecoin": stable_name,
                        "dex": "Fluxion V3",
                    })

        return {
            "xstock_address": xstock_address,
            "fluxion_pools": pools,
            "has_liquidity": len(pools) > 0,
            "pool_count": len(pools),
        }
