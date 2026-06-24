"""Agent portfolio reader.

Reads the *real* on-chain holdings of the agent wallet on Mantle and values them
in USD so the Stocky Agent UI can show **current vs target** allocation and so the
rebalance loop can compute the swap diff.

Critical correctness note (the bug this module fixes): xStocks exist in two forms
on Mantle — the **original** token (e.g. ``NVDAx``) and an **ERC-4626 wrapper**
(e.g. ``wNVDAx``) that Fluxion pools actually trade. A naive reader that only looks
at the wrapper address reports ~0 even when the wallet holds the original. Here we
sum **both** the original and the wrapper balance for every xStock and value them
at the wrapper's pool price (wrap ratio is ~1:1 for these tokens).

Pricing is done fully on-chain from Fluxion V3 pool ``slot0`` (no external price
API), mirroring the frontend's direct-quote path, with USDY priced from the Ondo
oracle. Every call is wrapped so a single RPC hiccup never crashes a cycle.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from web3 import Web3

logger = logging.getLogger(__name__)

MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")

# --- Core token addresses (Mantle Mainnet) ---
USDC = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"   # 6 decimals — the cash/base leg
USDY = os.getenv("USDY_TOKEN_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6")
METH = os.getenv("METH_TOKEN_ADDRESS", "0xcDA86A272531e8640cD7F1a92c01839911B90bb0")

# Ondo USDY oracle — getPrice() returns the redemption price scaled by 1e18 (~1.05 USD).
USDY_ORACLE = os.getenv("USDY_ORACLE_ADDRESS", "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f")

# Fluxion V3 factory (for on-chain pricing).
FLUXION_FACTORY = "0xF883162Ed9c7E8EF604214c964c678E40c9B737C"

# xStocks registry: symbol -> (original token, ERC-4626 wrapper used by Fluxion pools).
# Sourced from the frontend's BASE_TOKENS + UNWRAPPED_TO_WRAPPED maps. Both balances
# are counted; the wrapper is what carries a USDC pool for pricing/swaps.
XSTOCK_TOKENS: dict[str, dict[str, str]] = {
    "AAPLx":  {"original": "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a", "wrapper": "0x5aa7649fdbda47de64a07ac81d64b682af9c0724"},
    "NVDAx":  {"original": "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", "wrapper": "0x93e62845c1dd5822ebc807ab71a5fb750decd15a"},
    "SPYx":   {"original": "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", "wrapper": "0xc88fcd8b874fdb3256e8b55b3decb8c24eab4c02"},
    "TSLAx":  {"original": "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0", "wrapper": "0x43680abf18cf54898be84c6ef78237cfbd441883"},
    "MSFTx":  {"original": "0x5621737f42dae558b81269fcb9e9e70c19aa6b35", "wrapper": "0x63ad27614231767c8c489745b9145272de50d09b"},
    "GOOGLx": {"original": "0xe92f673ca36c5e2efd2de7628f815f84807e803f", "wrapper": "0x1630f08370917e79df0b7572395a5e907508bbbc"},
    "AMZNx":  {"original": "0x3557ba345b01efa20a1bddc61f573bfd87195081", "wrapper": "0xac85d37acbadca37545e21ab0fb991bce8c1187c"},
    "METAx":  {"original": "0x96702be57cd9777f835117a809c7124fe4ec989a", "wrapper": "0x4e41a262caa93c6575d336e0a4eb79f3c67caa06"},
    "QQQx":   {"original": "0xa753a7395cae905cd615da0b82a53e0560f250af", "wrapper": "0xdbd9232fee15351068fe02f0683146e16d9f2cea"},
    "MSTRx":  {"original": "0xae2f842ef90c0d5213259ab82639d5bbf649b08e", "wrapper": "0x266e5923f6118f8b340ca5a23ae7f71897361476"},
    "HOODx":  {"original": "0xe1385fdd5ffb10081cd52c56584f25efa9084015", "wrapper": "0x953707d7a1cb30cc5c636bda8eaebe410341eb14"},
    "CRCLx":  {"original": "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb", "wrapper": "0xa90872aca656ebe47bdebf3b19ec9dd9c5adc7f8"},
}

_ERC20_ABI = [
    {"inputs": [{"name": "a", "type": "address"}], "name": "balanceOf",
     "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
]
_FACTORY_ABI = [
    {"inputs": [{"name": "a", "type": "address"}, {"name": "b", "type": "address"}, {"name": "f", "type": "uint24"}],
     "name": "getPool", "outputs": [{"name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
]
_SLOT0_ABI = [
    {"inputs": [], "name": "slot0",
     "outputs": [{"name": "sqrtPriceX96", "type": "uint160"}, {"name": "tick", "type": "int24"},
                 {"name": "o", "type": "uint16"}, {"name": "oc", "type": "uint16"}, {"name": "on", "type": "uint16"},
                 {"name": "f", "type": "uint8"}, {"name": "u", "type": "bool"}],
     "stateMutability": "view", "type": "function"},
]
_ORACLE_ABI = [
    {"inputs": [], "name": "getPrice", "outputs": [{"type": "uint256", "name": ""}],
     "stateMutability": "view", "type": "function"},
]

_Q192 = 2 ** 192
_FEE_TIERS = [3000, 500, 10000]


def _w3() -> Web3:
    return Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 20}))


def _xstock_registry() -> dict[str, dict[str, str]]:
    """Symbol -> {original, wrapper} for every *live* Fluxion xStock.

    Built from the dynamic tradable-token list (so auto-discovered listings like
    SPCXx are valued too) and merged over the static seed map. Falls back to the
    static map if the live sync is unavailable.
    """
    registry = dict(XSTOCK_TOKENS)
    try:
        from agent.tokens import get_tradable_tokens

        for t in get_tradable_tokens():
            registry[t["symbol"]] = {"original": t["address"], "wrapper": t["wrapper"]}
    except Exception as e:  # noqa: BLE001
        logger.warning("dynamic xStock registry unavailable, using static seed: %s", e)
    return registry


def _balance(w3: Web3, token: str, wallet: str) -> int:
    c = w3.eth.contract(address=Web3.to_checksum_address(token), abi=_ERC20_ABI)
    return int(c.functions.balanceOf(Web3.to_checksum_address(wallet)).call())


def price_in_usdc(w3: Web3, token: str, decimals: int = 18) -> Optional[float]:
    """USD price of one whole ``token`` from its Fluxion V3 USDC pool, or None.

    Computes the pool's spot price from ``slot0.sqrtPriceX96`` exactly the way the
    frontend's direct on-chain quote does, so valuation matches what a swap would get.
    """
    token = Web3.to_checksum_address(token)
    usdc = Web3.to_checksum_address(USDC)
    if token == usdc:
        return 1.0
    fac = w3.eth.contract(address=Web3.to_checksum_address(FLUXION_FACTORY), abi=_FACTORY_ABI)
    for fee in _FEE_TIERS:
        try:
            pool = fac.functions.getPool(token, usdc, fee).call()
            if int(pool, 16) == 0:
                continue
            sp = w3.eth.contract(address=Web3.to_checksum_address(pool), abi=_SLOT0_ABI).functions.slot0().call()[0]
            if sp == 0:
                continue
            amount_in = 10 ** decimals  # one whole token
            token0 = min(token.lower(), usdc.lower())
            if token.lower() == token0:
                out = amount_in * sp * sp // _Q192
            else:
                out = amount_in * _Q192 // (sp * sp)
            if out <= 0:
                continue
            return out / 1e6  # USDC has 6 decimals
        except Exception as e:  # noqa: BLE001 - pricing must never crash a cycle
            logger.debug("price_in_usdc(%s) fee=%s failed: %s", token, fee, e)
            continue
    return None


def _usdy_price(w3: Web3) -> float:
    try:
        oracle = w3.eth.contract(address=Web3.to_checksum_address(USDY_ORACLE), abi=_ORACLE_ABI)
        return oracle.functions.getPrice().call() / 1e18
    except Exception as e:  # noqa: BLE001
        logger.warning("USDY oracle price failed: %s", e)
        return 1.0


def read_agent_portfolio(wallet: str, symbols: Optional[list[str]] = None) -> dict:
    """Read and value the agent wallet's holdings across the three layers + cash.

    Returns a dict with per-asset holdings (amount + USD), per-layer USD/weight, the
    total USD value and current 3-layer weights in basis points (xStocks/USDY/mETH),
    suitable for the UI's current-vs-target view and the rebalance diff.
    """
    out: dict = {
        "wallet": wallet,
        "holdings": [],
        "layers": {"xstocks_usd": 0.0, "usdy_usd": 0.0, "meth_usd": 0.0, "cash_usd": 0.0},
        "total_usd": 0.0,
        "current_bps": {"xStocks": 0, "USDY": 0, "mETH": 0},
        "ok": False,
    }
    try:
        w3 = _w3()
        registry = _xstock_registry()
        syms = [s for s in (symbols or list(registry)) if s in registry] or list(registry)

        def add(symbol: str, amount: float, usd: float, layer: str, kind: str = "token") -> None:
            out["holdings"].append({
                "symbol": symbol, "amount": round(amount, 8),
                "usd": round(usd, 2), "layer": layer, "kind": kind,
            })

        # Cash leg — USDC.
        usdc_amt = _balance(w3, USDC, wallet) / 1e6
        out["layers"]["cash_usd"] += usdc_amt
        if usdc_amt > 0:
            add("USDC", usdc_amt, usdc_amt, "cash")

        # Defensive leg — USDY (priced from the Ondo oracle; not Fluxion-traded).
        usdy_raw = _balance(w3, USDY, wallet)
        if usdy_raw > 0:
            usdy_amt = usdy_raw / 1e18
            usdy_usd = usdy_amt * _usdy_price(w3)
            out["layers"]["usdy_usd"] += usdy_usd
            add("USDY", usdy_amt, usdy_usd, "usdy")

        # Yield leg — mETH.
        meth_raw = _balance(w3, METH, wallet)
        if meth_raw > 0:
            meth_amt = meth_raw / 1e18
            meth_px = price_in_usdc(w3, METH, 18) or 0.0
            meth_usd = meth_amt * meth_px
            out["layers"]["meth_usd"] += meth_usd
            add("mETH", meth_amt, meth_usd, "meth")

        # Growth leg — xStocks. Count BOTH the original and the wrapper balance.
        for sym in syms:
            reg = registry[sym]
            orig_amt = _balance(w3, reg["original"], wallet) / 1e18
            wrap_amt = _balance(w3, reg["wrapper"], wallet) / 1e18
            total_amt = orig_amt + wrap_amt
            if total_amt <= 1e-9:
                continue
            px = price_in_usdc(w3, reg["wrapper"], 18) or 0.0  # wrapper carries the pool
            usd = total_amt * px
            if usd < 0.01:
                continue
            out["layers"]["xstocks_usd"] += usd
            add(sym, total_amt, usd, "xstocks")

        total = sum(out["layers"].values())
        out["total_usd"] = round(total, 2)
        # Invested = everything except idle cash; layer weights are vs invested capital.
        invested = out["layers"]["xstocks_usd"] + out["layers"]["usdy_usd"] + out["layers"]["meth_usd"]
        if invested > 0:
            out["current_bps"] = {
                "xStocks": round(out["layers"]["xstocks_usd"] / invested * 10000),
                "USDY": round(out["layers"]["usdy_usd"] / invested * 10000),
                "mETH": round(out["layers"]["meth_usd"] / invested * 10000),
            }
        for k in out["layers"]:
            out["layers"][k] = round(out["layers"][k], 2)
        out["invested_usd"] = round(invested, 2)
        out["ok"] = True
    except Exception as e:  # noqa: BLE001
        logger.error("read_agent_portfolio failed: %s", e)
        out["error"] = str(e)
    return out
