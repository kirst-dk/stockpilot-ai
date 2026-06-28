"""Tradable-token discovery, synced with live Fluxion pools.

The Strategies tab must reflect the *actually tradable* xStock universe rather
than a hand-maintained list. This module:

1. Keeps a seed registry of xStock (original -> wrapped ERC-4626 vault) pairs.
2. Verifies on-chain, via the Fluxion factory, that each wrapped vault still has
   a live USDC pool — so removed/inactive pools drop out automatically.
3. Optionally auto-discovers brand-new Fluxion pools (e.g. SPCXx) from the
   factory's ``PoolCreated`` logs via the Etherscan v2 API (indexer-backed, so
   it needs no wide ``eth_getLogs`` range). New wrappers are resolved to their
   underlying xStock and persisted, so new listings appear with no code change.

All results are cached briefly so the endpoint stays cheap under load.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from web3 import Web3

logger = logging.getLogger(__name__)

MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
FLUXION_FACTORY = Web3.to_checksum_address("0xF883162Ed9c7E8EF604214c964c678E40c9B737C")
USDC = Web3.to_checksum_address("0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9")
MULTICALL3 = Web3.to_checksum_address("0xcA11bde05977b3631167028862bE2a173976CA11")
FEE_TIERS = (100, 500, 3000, 10000)
ZERO = "0x0000000000000000000000000000000000000000"

# PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24, address)
POOL_CREATED_TOPIC = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"

_FACTORY_ABI = [{
    "name": "getPool", "type": "function", "stateMutability": "view",
    "inputs": [{"type": "address"}, {"type": "address"}, {"type": "uint24"}],
    "outputs": [{"type": "address"}],
}]
_MULTICALL3_ABI = [{
    "name": "aggregate3", "type": "function", "stateMutability": "payable",
    "inputs": [{"components": [
        {"name": "target", "type": "address"},
        {"name": "allowFailure", "type": "bool"},
        {"name": "callData", "type": "bytes"}], "name": "calls", "type": "tuple[]"}],
    "outputs": [{"components": [
        {"name": "success", "type": "bool"},
        {"name": "returnData", "type": "bytes"}], "name": "returnData", "type": "tuple[]"}],
}]
_SYMBOL_ABI = [{"name": "symbol", "type": "function", "stateMutability": "view",
                "inputs": [], "outputs": [{"type": "string"}]}]
_ASSET_ABI = [{"name": "asset", "type": "function", "stateMutability": "view",
               "inputs": [], "outputs": [{"type": "address"}]}]

# Seed registry: symbol -> (original xStock token, wrapped ERC-4626 vault).
# These are the live Fluxion RWA pools at time of writing; verified on-chain on
# every refresh, and supplemented by Etherscan auto-discovery when a key is set.
SEED_REGISTRY: dict[str, tuple[str, str]] = {
    "AAPLx": ("0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a", "0x5aa7649fdbda47de64a07ac81d64b682af9c0724"),
    "ABBVx": ("0xfbf2398df672cee4afcc2a4a733222331c742a6a", "0x5cc079963fb70c0f987f65f539e3b61a6ebdf6db"),
    "ABTx": ("0x89233399708c18ac6887f90a2b4cd8ba5fedd06e", "0xd812b37181ae89801e4bb3f49e4c1faf11fc0b57"),
    "AMZNx": ("0x3557ba345b01efa20a1bddc61f573bfd87195081", "0xac85d37acbadca37545e21ab0fb991bce8c1187c"),
    "APPx": ("0x50a1291f69d9d3853def8209cfb1af0b46927be1", "0xd17e483364d849e3b3a52464bb2ca56626edfc31"),
    "AVGOx": ("0x38bac69cbbd28156796e4163b2b6dcb81e336565", "0x8deb752aaa807e0258afd5ccffe2b5a804026f28"),
    "AZNx": ("0x5d642505fe1a28897eb3baba665f454755d8daa2", "0xb908feaeab7e671db697d77c3acfd8859e92a4e2"),
    "BACx": ("0x314938c596f5ce31c3f75307d2979338c346d7f2", "0xa2b1335256cd663da89f650180508dd1f0dc3baa"),
    "CMCSAx": ("0xbc7170a1280be28513b4e940c681537eb25e39f4", "0xd1a01e3f9c7565e88b1cf2413ba0a0e671e57b33"),
    "COINx": ("0x364f210f430ec2448fc68a49203040f6124096f0", "0x3a98e79cdc7d8b2716a8696e25af028e429f11da"),
    "CRCLx": ("0xfebded1b0986a8ee107f5ab1a1c5a813491deceb", "0xa90872aca656ebe47bdebf3b19ec9dd9c5adc7f8"),
    "CRMx": ("0x4a4073f2eaf299a1be22254dcd2c41727f6f54a2", "0xc6b6b8d50a6673c04c495e30b411da5a7adf39f5"),
    "CRWDx": ("0x214151022c2a5e380ab80cdac31f23ae554a7345", "0xd71a6adbc40c2674591cdb11b8c7ae03a880b06e"),
    "CSCOx": ("0x053c784cd87b74f42e0c089f98643e79c1a3ff16", "0xcfa485bc42c2492917351f89f5cf5c7b2c5a66aa"),
    "CVXx": ("0xad5cdc3340904285b8159089974a99a1a09eb4c0", "0x7f88888b7a81546a036554aa67a289ea428b20d4"),
    "DHRx": ("0xdba228936f4079daf9aa906fd48a87f2300405f4", "0x6c7ad1886a6da37766fed060d5f08ff43285dcdd"),
    "GLDx": ("0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9", "0x61532ce3f1df7fbf5ffb7b891d184226e85b37c6"),
    "GMEx": ("0xe5f6d3b2405abdfe6f660e63202b25d23763160d", "0xb2f6ed0ed3eeb22bef7a648794ffc19b8af3761c"),
    "GOOGLx": ("0xe92f673ca36c5e2efd2de7628f815f84807e803f", "0x1630f08370917e79df0b7572395a5e907508bbbc"),
    "GSx": ("0x3ee7e9b3a992fd23cd1c363b0e296856b04ab149", "0x6eed78e2780d82be4e37d9937c27bcf32c8da072"),
    "HONx": ("0x62a48560861b0b451654bfffdb5be6e47aa8ff1b", "0xbd1b73b2e89967e83507b500d798998200a53380"),
    "HOODx": ("0xe1385fdd5ffb10081cd52c56584f25efa9084015", "0x953707d7a1cb30cc5c636bda8eaebe410341eb14"),
    "IBMx": ("0xd9913208647671fe0f48f7f260076b2c6f310aac", "0xa8f31436ffe4e71f51b2d65b7d5a5c457ae2000f"),
    "INTCx": ("0xf8a80d1cb9cfd70d03d655d9df42339846f3b3c8", "0x6a2a68ca7fc793d8cea36326a6ec1ef7ac3d9742"),
    "JNJx": ("0xdb0482cfad4789798623e64b15eeba01b16e917c", "0xcdb53a7cba9ec6d55dfe8f58bd6772826722d7bd"),
    "JPMx": ("0xd9fc3e075d45254a1d834fea18af8041207dea0a", "0xab635f839f81a12dc8db8ab31006af14e26292fe"),
    "KOx": ("0xdcc1a2699441079da889b1f49e12b69cc791129b", "0x9a2486fbe7bc17c9100be65c31abe7c9bf84c23c"),
    "LINx": ("0x15059c599c16fd8f70b633ade165502d6402cd49", "0x316ffea434348c2cb72024e62ae845770315351e"),
    "LLYx": ("0x19c41ea77b34bbdee61c3a87a75d1abda2ed0be4", "0x3644971a7e971f60e707f7e8716ccac5a0461290"),
    "MAx": ("0xb365cd2588065f522d379ad19e903304f6b622c6", "0x5b32624f352d2fc6cc70889967a143ba1814f82b"),
    "MCDx": ("0x80a77a372c1e12accda84299492f404902e2da67", "0x1717d8be2bcb27f4e8f36c817088fa6a2c0b3b30"),
    "METAx": ("0x96702be57cd9777f835117a809c7124fe4ec989a", "0x4e41a262caa93c6575d336e0a4eb79f3c67caa06"),
    "MRKx": ("0x17d8186ed8f68059124190d147174d0f6697dc40", "0x4728e48c2c201e32fe210aab68a71e419feac74a"),
    "MRVLx": ("0xeaad46f4146ded5a47b55aa7f6c48c191deaec88", "0x0d6fce45796d5c00689c0916b976645a0ff1f0ce"),
    "MSFTx": ("0x5621737f42dae558b81269fcb9e9e70c19aa6b35", "0x63ad27614231767c8c489745b9145272de50d09b"),
    "MSTRx": ("0xae2f842ef90c0d5213259ab82639d5bbf649b08e", "0x266e5923f6118f8b340ca5a23ae7f71897361476"),
    "NFLXx": ("0xa6a65ac27e76cd53cb790473e4345c46e5ebf961", "0xfe0d2545f9e7f3678cb35ed3cdf70488c5570d11"),
    "NVDAx": ("0xc845b2894dbddd03858fd2d643b4ef725fe0849d", "0x93e62845c1dd5822ebc807ab71a5fb750decd15a"),
    "NVOx": ("0xf9523e369c5f55ad72dbaa75b0a9b92b3d8b147e", "0x16e443aebc83e2089aa90431a1c0d311854eec69"),
    "ORCLx": ("0x548308e91ec9f285c7bff05295badbd56a6e4971", "0x54f34ceb15313caaee838f77c1c3c2fe2e94526a"),
    "PEPx": ("0x36c424a6ec0e264b1616102ad63ed2ad7857413e", "0xa00a5538708b5aca7045f2ca15104707965bac94"),
    "PFEx": ("0x1ac765b5bea23184802c7d2d497f7c33f1444a9e", "0x4e6894c3481b3a45393ce8ac9552945ad50a3758"),
    "PGx": ("0xa90424d5d3e770e8644103ab503ed775dd1318fd", "0x0afc19943fa98e9e9e90fc4ab4d4d3c13e162232"),
    "PLTRx": ("0x6d482cec5f9dd1f05ccee9fd3ff79b246170f8e2", "0xa3b6fe1a923585bb828fcfaa460b78eefd5ae2ec"),
    "PMx": ("0x02a6c1789c3b4fdb1a7a3dfa39f90e5d3c94f4f9", "0x7c2e00e6b0d519a8c492d20c2524342a4398ff34"),
    "QQQx": ("0xa753a7395cae905cd615da0b82a53e0560f250af", "0xdbd9232fee15351068fe02f0683146e16d9f2cea"),
    "SPYx": ("0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", "0xc88fcd8b874fdb3256e8b55b3decb8c24eab4c02"),
    "TBLLx": ("0x4cbf89ed7bb30b8a860fa86d3c96e9c72931299b", "0xcd932bf1c895b7143ec34df5ae7889d3853904d8"),
    "TQQQx": ("0xfdddb57878ef9d6f681ec4381dcb626b9e69ac86", "0x3d843414e617cbb9d2328c7ecf155d7c18139d6a"),
    "TSLAx": ("0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0", "0x43680abf18cf54898be84c6ef78237cfbd441883"),
    "UNHx": ("0x167a6375da1efc4a5be0f470e73ecefd66245048", "0xa0412ce46fe877b7f174b82acd95e70063bbaf2a"),
    "VTIx": ("0xbd730e618bcd88c82ddee52e10275cf2f88a4777", "0xe9161f111c55bdd67525c1d4f9bbca07750aaab7"),
    "Vx": ("0x2363fd1235c1b6d3a5088ddf8df3a0b3a30c5293", "0x3cf193acf378ec224a0209be888b4b0b963e1896"),
    "WMTx": ("0x7aefc9965699fbea943e03264d96e50cd4a97b21", "0xa24d9c43d64c76acd962003647fd43a85eb44db8"),
    "XOMx": ("0xeedb0273c5af792745180e9ff568cd01550ffa13", "0x448bc811f60eac772775dd53421380e8d4dc4338"),
}

# Discovered wrappers persist here so new listings survive restarts.
_EXTRA_PATH = Path(os.getenv("TRADABLE_EXTRA_PATH", "/opt/stockpilot-agent/data/tradable_extra.json"))
ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY", "")
ETHERSCAN_V2 = "https://api.etherscan.io/v2/api"
MANTLE_CHAIN_ID = 5000

_CACHE_TTL = 300
_cache: dict = {"ts": 0.0, "tokens": []}


def _w3() -> Web3:
    return Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 20}))


def _load_extra() -> dict[str, tuple[str, str]]:
    try:
        raw = json.loads(_EXTRA_PATH.read_text())
        return {k: (v[0], v[1]) for k, v in raw.items()}
    except Exception:  # noqa: BLE001
        return {}


def _save_extra(extra: dict[str, tuple[str, str]]) -> None:
    try:
        _EXTRA_PATH.parent.mkdir(parents=True, exist_ok=True)
        _EXTRA_PATH.write_text(json.dumps({k: list(v) for k, v in extra.items()}, indent=2))
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not persist discovered tokens: %s", e)


def _full_registry() -> dict[str, tuple[str, str]]:
    reg = dict(SEED_REGISTRY)
    reg.update(_load_extra())
    return reg


def _verify_pools(w3: Web3, registry: dict[str, tuple[str, str]]) -> list[dict]:
    """Return registry entries that currently have a live USDC pool on Fluxion.

    Uses one Multicall3 round-trip across every (wrapper, fee) candidate, so the
    whole universe is verified in a single RPC call.
    """
    factory = w3.eth.contract(address=FLUXION_FACTORY, abi=_FACTORY_ABI)
    mc = w3.eth.contract(address=MULTICALL3, abi=_MULTICALL3_ABI)

    items = list(registry.items())
    calls = []
    index: list[tuple[str, str, str, int]] = []  # (symbol, original, wrapper, fee)
    for sym, (original, wrapper) in items:
        wrp = Web3.to_checksum_address(wrapper)
        for fee in FEE_TIERS:
            calldata = factory.encodeABI(fn_name="getPool", args=[wrp, USDC, fee])
            calls.append((FLUXION_FACTORY, True, calldata))
            index.append((sym, original, wrapper, fee))

    try:
        results = mc.functions.aggregate3(calls).call()
    except Exception as e:  # noqa: BLE001
        logger.warning("Multicall pool verification failed (%s); falling back to per-call", e)
        results = []
        for (sym, original, wrapper, fee) in index:
            try:
                pool = factory.functions.getPool(
                    Web3.to_checksum_address(wrapper), USDC, fee).call()
                ok = pool and pool != ZERO
                results.append((ok, bytes.fromhex(pool[2:].rjust(64, "0")) if ok else b""))
            except Exception:  # noqa: BLE001
                results.append((False, b""))

    live: dict[str, dict] = {}
    for (sym, original, wrapper, fee), (success, ret) in zip(index, results):
        if sym in live or not success or len(ret) < 32:
            continue
        pool = Web3.to_checksum_address("0x" + ret[-20:].hex())
        if pool == ZERO:
            continue
        live[sym] = {
            "symbol": sym,
            "address": Web3.to_checksum_address(original),
            "wrapper": Web3.to_checksum_address(wrapper),
            "pool": pool,
            "fee": fee,
            "decimals": 18,
        }
    return sorted(live.values(), key=lambda t: t["symbol"])


def _discover_via_etherscan(w3: Web3, known_wrappers: set[str]) -> dict[str, tuple[str, str]]:
    """Find new USDC-paired ERC-4626 xStock pools via the Etherscan v2 logs API.

    Returns {symbol: (original, wrapper)} for wrappers not already known. No-op
    when ``ETHERSCAN_API_KEY`` is unset.
    """
    if not ETHERSCAN_API_KEY:
        return {}
    found: dict[str, tuple[str, str]] = {}
    try:
        with httpx.Client(timeout=25.0) as client:
            for page in range(1, 11):  # up to 10k logs
                resp = client.get(ETHERSCAN_V2, params={
                    "chainid": MANTLE_CHAIN_ID, "module": "logs", "action": "getLogs",
                    "address": FLUXION_FACTORY, "topic0": POOL_CREATED_TOPIC,
                    "fromBlock": 0, "toBlock": "latest", "page": page, "offset": 1000,
                    "apikey": ETHERSCAN_API_KEY,
                })
                rows = resp.json().get("result") or []
                if not isinstance(rows, list) or not rows:
                    break
                for r in rows:
                    topics = r.get("topics", [])
                    if len(topics) < 3:
                        continue
                    t0 = Web3.to_checksum_address("0x" + topics[1][-40:])
                    t1 = Web3.to_checksum_address("0x" + topics[2][-40:])
                    other = None
                    if t0 == USDC:
                        other = t1
                    elif t1 == USDC:
                        other = t0
                    if not other or other.lower() in known_wrappers or other.lower() in {v.lower() for _, v in found.values()}:
                        continue
                    pair = _resolve_wrapper(w3, other)
                    if pair:
                        found[pair[0]] = (pair[1], other)
                if len(rows) < 1000:
                    break
    except Exception as e:  # noqa: BLE001
        logger.warning("Etherscan discovery failed: %s", e)
    return found


def _resolve_wrapper(w3: Web3, wrapper: str) -> Optional[tuple[str, str]]:
    """Given a candidate wrapped vault, return (symbol, original) if it wraps an xStock."""
    try:
        vault = w3.eth.contract(address=Web3.to_checksum_address(wrapper), abi=_ASSET_ABI)
        original = vault.functions.asset().call()
        token = w3.eth.contract(address=Web3.to_checksum_address(original), abi=_SYMBOL_ABI)
        sym = token.functions.symbol().call()
        if sym and sym.endswith("x"):
            return sym, Web3.to_checksum_address(original)
    except Exception:  # noqa: BLE001
        return None
    return None


def get_tradable_tokens(force: bool = False) -> list[dict]:
    """Live tradable xStock universe (cached). Each entry: symbol, address, wrapper, pool, fee."""
    now = time.time()
    if not force and _cache["tokens"] and now - _cache["ts"] < _CACHE_TTL:
        return _cache["tokens"]

    w3 = _w3()
    registry = _full_registry()

    if ETHERSCAN_API_KEY:
        known = {w.lower() for _, w in registry.values()}
        discovered = _discover_via_etherscan(w3, known)
        if discovered:
            extra = _load_extra()
            extra.update(discovered)
            _save_extra(extra)
            registry.update(discovered)
            logger.info("Auto-discovered %d new Fluxion xStock pools: %s",
                        len(discovered), ", ".join(discovered))

    tokens = _verify_pools(w3, registry)
    _cache.update(ts=now, tokens=tokens)
    return tokens
