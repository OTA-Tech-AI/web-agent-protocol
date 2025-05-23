from mcp.server.fastmcp import FastMCP
import httpx
import os
import json
import argparse
from typing import Optional
import utils.llm
import glob
from dotenv import load_dotenv

load_dotenv()

def extract_ultimate_goal(task_id: str) -> str:
    """
    Try to extract ultimate_goal from either exact_replay or smart_replay file.
    
    Args:
        task_id: The task ID to look for in the replay files
        
    Returns:
        The ultimate_goal string if found
        
    Raises:
        FileNotFoundError: If neither replay file exists
        ValueError: If ultimate_goal field is not found
    """
    exact_replay_path = os.path.join(".", "data_processed", "exact_replay", f"wap_exact_replay_list_{task_id}.json")
    smart_replay_path = os.path.join(".", "data_processed", "smart_replay", f"wap_smart_replay_list_{task_id}.json")
    
    for file_path in [exact_replay_path, smart_replay_path]:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    return data['ultimate_goal']
            except (json.JSONDecodeError, KeyError):
                continue
    
    raise ValueError(f"Could not find ultimate_goal in replay files for task_id {task_id}")

def summarize_goal(ultimate_goal: str) -> str:
    """
    Generate a function name from the ultimate goal.
    This is a placeholder - in practice you would call OpenAI API here.
    """
    return utils.llm.ask_llm(f"Summarize the following to a single function name with underscore in plaintext: {ultimate_goal}")

def create_mcp_server(ultimate_goal: str, function_name: str, task_id: str) -> str:
    """
    Creates an MCP server file with the specified parameters.
    
    Args:
        ultimate_goal: The goal description for the MCP
        function_name: The base name for the functions
        task_id: The task ID used in file paths
        
    Returns:
        The complete Python code as a string
    """
    exact_replay_path = os.path.join(".", "data_processed", "exact_replay", f"wap_exact_replay_list_{task_id}.json")
    smart_replay_path = os.path.join(".", "data_processed", "smart_replay", f"wap_smart_replay_list_{task_id}.json")
    
    smart_docstring = f"smart replay: {ultimate_goal}"
    exact_docstring = f"exact replay: {ultimate_goal}"
    
    code = f'''
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("{ultimate_goal}")
'''
    
    # Only include the tool function for the existing replay file
    if os.path.exists(smart_replay_path):
        code += f'''
@mcp.tool()
async def {function_name}_smart_replay() -> str:
    """{smart_docstring}"""
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.get(
            "http://localhost:3089/replay",
            params={{
                "concurrent": 1,
                "model": "openai",
                "file_path": 'data_processed/smart_replay/wap_smart_replay_list_{task_id}.json'
            }}
        )
        return response.text
    return "FAILED"
'''
    if os.path.exists(exact_replay_path):
        code += f'''
@mcp.tool()
async def {function_name}_exact_replay() -> str:
    """{exact_docstring}"""
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.get(
            "http://localhost:3089/replay",
            params={{
                "concurrent": 1,
                "model": "openai",
                "file_path": 'data_processed/exact_replay/wap_exact_replay_list_{task_id}.json'
            }}
        )
        return response.text
    return "FAILED"
'''
    
    code += '''
if __name__ == "__main__":
    mcp.run(transport="stdio")
'''
    return code

def main():
    parser = argparse.ArgumentParser(description='Create MCP server file from replay data')
    parser.add_argument('--task_id', required=True, help='Task ID to process')
    args = parser.parse_args()
    
    try:
        # Extract ultimate_goal from replay files
        ultimate_goal = extract_ultimate_goal(args.task_id)
        
        # Generate function name
        function_name = summarize_goal(ultimate_goal)
        
        # Generate the code
        server_code = create_mcp_server(ultimate_goal, function_name, args.task_id)
        
        # Create mcp_servers directory if it doesn't exist
        os.makedirs("mcp_servers", exist_ok=True)
        
        # Check for existing files with the same task_id
        existing_files = glob.glob(os.path.join("mcp_servers", f"*_{args.task_id}_mcp_server.py"))
        
        # If duplicates exist, remove them
        for existing_file in existing_files:
            os.remove(existing_file)
            print(f"Removed duplicate: {existing_file}")
        
        # Save to file in the mcp_servers folder
        filename = os.path.join("mcp_servers", f"{function_name}_{args.task_id}_mcp_server.py")
        with open(filename, "w") as file:
            file.write(server_code)
        
        print(f"Successfully created/updated {filename}")
    except Exception as e:
        print(f"Error: {str(e)}")
        exit(1)

if __name__ == "__main__":
    main()