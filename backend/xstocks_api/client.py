"""xStocks API client for fetching tokenized equity data and prices."""

import httpx
from typing import Optional


XSTOCKS_API_BASE = "https://api.backed.fi/api/v2"


class XStocksClient:
    """Client for the xStocks public API (no authentication required for public endpoints)."""

    def __init__(self, api_key: Optional[str] = None):
        self.base_url = XSTOCKS_API_BASE
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=30.0,
            headers=self._build_headers(),
        )

    def _build_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-KEY"] = self.api_key
        return headers

    async def get_all_assets(self, page: int = 1) -> dict:
        """List all available xStocks assets."""
        resp = await self._client.get(f"/public/assets", params={"page": page})
        resp.raise_for_status()
        return resp.json()

    async def get_asset_price(self, symbol: str) -> dict:
        """Get current price data for a specific xStock asset.

        Args:
            symbol: The xStock symbol (e.g., 'TSLAx', 'AAPLx', 'SPYx')

        Returns:
            Price data dict with 'quote' field
        """
        resp = await self._client.get(f"/public/assets/{symbol}/price-data")
        resp.raise_for_status()
        return resp.json()

    async def get_asset_details(self, symbol: str) -> dict:
        """Get detailed info about a specific asset including contract addresses."""
        resp = await self._client.get(f"/public/assets/{symbol}")
        resp.raise_for_status()
        return resp.json()

    async def get_multiplier(self, symbol: str) -> dict:
        """Get current multiplier for an asset (for corporate actions like dividends/splits)."""
        resp = await self._client.get(f"/public/assets/{symbol}/multiplier")
        resp.raise_for_status()
        return resp.json()

    async def get_multiplier_history(self, symbol: str) -> dict:
        """Get historical multiplier changes for an asset."""
        resp = await self._client.get(f"/public/assets/{symbol}/multiplier/history")
        resp.raise_for_status()
        return resp.json()

    async def get_proof_of_reserves(self) -> dict:
        """Get proof of reserves data for all assets."""
        resp = await self._client.get("/public/proof-of-reserves")
        resp.raise_for_status()
        return resp.json()

    async def get_oracle_data(self) -> dict:
        """Get on-chain oracle price feed data."""
        resp = await self._client.get("/public/oracles")
        resp.raise_for_status()
        return resp.json()

    async def get_prices_batch(self, symbols: list[str]) -> dict[str, float]:
        """Get prices for multiple assets at once.

        Returns:
            Dict mapping symbol to USD price
        """
        prices = {}
        for symbol in symbols:
            try:
                data = await self.get_asset_price(symbol)
                prices[symbol] = data.get("quote", 0.0)
            except httpx.HTTPError:
                prices[symbol] = 0.0
        return prices

    async def get_mantle_deployments(self) -> list[dict]:
        """Get all xStock tokens deployed on Mantle network."""
        assets = await self.get_all_assets()
        mantle_tokens = []

        for asset in assets.get("nodes", []):
            for deployment in asset.get("deployments", []):
                if deployment.get("chain", "").lower() == "mantle":
                    mantle_tokens.append({
                        "symbol": asset["symbol"],
                        "name": asset["name"],
                        "address": deployment["address"],
                        "underlying": asset.get("underlyingSymbol", ""),
                    })

        return mantle_tokens

    async def close(self):
        await self._client.aclose()
