
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("find a top rated keyboard on amazon.ca")

@mcp.tool()
async def find_top_rated_keyboard_amazon_ca_smart_replay() -> str:
    """smart replay: find a top rated keyboard on amazon.ca"""
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.get(
            "http://localhost:3089/replay",
            params={
                "concurrent": 1,
                "model": "openai",
                "file_path": 'data_processed/smart_replay/wap_smart_replay_list_1EtuQqZ34UcEFqF8.json'
            }
        )
        return response.text
    return "FAILED"

@mcp.tool()
async def find_top_rated_keyboard_amazon_ca_exact_replay() -> str:
    """exact replay: find a top rated keyboard on amazon.ca"""
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.get(
            "http://localhost:3089/replay",
            params={
                "concurrent": 1,
                "model": "openai",
                "file_path": 'data_processed/exact_replay/wap_exact_replay_list_1EtuQqZ34UcEFqF8.json'
            }
        )
        return response.text
    return "FAILED"

if __name__ == "__main__":
    mcp.run(transport="stdio")
