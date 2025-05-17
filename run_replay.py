import argparse
import asyncio
import json
import logging
import os
import shutil
from asyncio import Semaphore
from dataclasses import dataclass
from pathlib import Path
from typing import Generator, Literal, TypedDict, Dict
import traceback

from browser_use import Agent, Browser, BrowserConfig
from browser_use.browser.context import BrowserContextConfig
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_ollama import ChatOllama
from pydantic import SecretStr

load_dotenv()

class TaskData(TypedDict):
    id: str
    web: str
    ques: str

EvalResult = Literal["success", "failed", "unknown"]

def cleanup_webdriver_cache() -> None:
    """Clean up webdriver cache directories."""
    cache_paths = [
        Path.home() / ".wdm",
        Path.home() / ".cache" / "selenium",
        Path.home() / "Library" / "Caches" / "selenium",
    ]
    for path in cache_paths:
        if path.exists():
            print(f"Removing cache directory: {path}")
            shutil.rmtree(path, ignore_errors=True)

@dataclass
class LLMModel:
    model: AzureChatOpenAI
    token_limit: int

def get_llm_model_generator(
    model_provider: str,
) -> Generator[AzureChatOpenAI | ChatAnthropic | ChatOpenAI, None, None]:
    """Generator that creates fresh model instances each time"""
    while True:
        # Force reload environment variables
        load_dotenv(override=True)

        if model_provider == "anthropic":
            # Create fresh instances each time, reading current env vars
            yield ChatAnthropic(
                model_name="claude-3-7-sonnet-20250219",
                timeout=25,
                stop=None,
                temperature=0.0,
            )

        elif model_provider == "azure":
            # Create fresh instances each time, reading current env vars
            west_eu = LLMModel(
                model=AzureChatOpenAI(
                    model="gpt-4o",
                    api_version="2024-10-21",
                    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_WEST_EU", ""),
                    api_key=SecretStr(os.getenv("AZURE_OPENAI_API_KEY_WEST_EU", "")),
                ),
                token_limit=900,
            )
            east_us = LLMModel(
                model=AzureChatOpenAI(
                    model="gpt-4o",
                    api_version="2024-10-21",
                    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_EAST_US", ""),
                    api_key=SecretStr(os.getenv("AZURE_OPENAI_API_KEY_EAST_US", "")),
                ),
                token_limit=450,
            )
            east_us_2 = LLMModel(
                model=AzureChatOpenAI(
                    model="gpt-4o",
                    api_version="2024-10-21",
                    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_EAST_US_2", ""),
                    api_key=SecretStr(os.getenv("AZURE_OPENAI_API_KEY_EAST_US_2", "")),
                ),
                token_limit=450,
            )
            west_us = LLMModel(
                model=AzureChatOpenAI(
                    model="gpt-4o",
                    api_version="2024-10-21",
                    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_WEST_US", ""),
                    api_key=SecretStr(os.getenv("AZURE_OPENAI_API_KEY_WEST_US", "")),
                ),
                token_limit=450,
            )

            # Yield fresh instances in the same pattern
            yield west_eu.model  # First 900
            yield west_eu.model  # Second 900
            yield east_us.model  # 450
            yield east_us_2.model  # 450
            yield west_us.model  # 450
        elif model_provider == "openai":
            llm = ChatOpenAI(model="gpt-4o", temperature=0)
            yield llm
        elif model_provider == "ollama":
            llm = ChatOllama(model="ota-preview-v16", num_ctx=20000,temperature=0)
            yield llm
        else:
            raise ValueError(f"Invalid model provider: {model_provider}")

async def process_single_task(
    replay_list: Dict,
    client: AzureChatOpenAI | ChatAnthropic | ChatOpenAI,
    results_dir: Path,
    browser: Browser,
) -> None:
    """Process a single task asynchronously."""
    # task_str = f"{task['ques']} on {task['web']}"
    task_str = replay_list["ultimate_goal"]
    task_dir = results_dir / f"{replay_list['task_id']}"
    replay_mode = replay_list["type"]
    task_dir.mkdir(exist_ok=True)
    subgoal_list: list[dict] = []
    exact_replay_list: list[dict] = []

    try:
        if not (task_dir / "task_result.json").exists():
            logging.getLogger("browser_use").setLevel(logging.INFO)
            
            ### Load WAP files ###
            if replay_mode == "smart_replay":
                    subgoal_list = replay_list["subgoal_list"]
            elif replay_mode == "exact_replay":
                    exact_replay_list = replay_list["action_list"]
            else:
                raise Exception("Error setting WAP replay mode, no mode type: ", replay_mode)

            agent = Agent(
                task=task_str,
                llm=client,
                browser=browser,
                validate_output=True,
                generate_gif=False,
                use_vision=False,
                subgoal_list=subgoal_list,
                exact_replay_list=exact_replay_list,
                replay_mode=replay_mode
            )
            history = await agent.run(max_steps=20)
            history.save_to_file(task_dir / "history.json")

    except Exception as e:
        logging.error(f"Error processing task {replay_list['task_id']}: {str(e)}")
        return

    finally:
        await browser.close()


async def main(max_concurrent_tasks: int,
               model_provider: str,
               wap_replay_list_path: str = None) -> None:
    try:
        # Setup
        cleanup_webdriver_cache()
        semaphore = Semaphore(max_concurrent_tasks)

        # Load tasks
        replay_list = []
        with open(wap_replay_list_path, "r", encoding="utf-8") as f:
            replay_list.append(json.load(f))

        # Initialize
        results_dir = Path("results")
        results_dir.mkdir(parents=True, exist_ok=True)

        # Process tasks concurrently with semaphore
        async def process_with_semaphore(
            replay_list: Dict,
            client: AzureChatOpenAI | ChatAnthropic | ChatOpenAI,
        ) -> None:
            async with semaphore:
                print(f"\n=== Now at task {replay_list['task_id']} ===")

                # Create browser instance inside the semaphore block
                browser = Browser(
                    config=BrowserConfig(
                        # headless=True,
                        headless=False,
                        disable_security=True,
                        new_context_config=BrowserContextConfig(
                            disable_security=True,
                            wait_for_network_idle_page_load_time=5,
                            maximum_wait_page_load_time=20,
                            # no_viewport=True,
                            browser_window_size={
                                "width": 1280,
                                "height": 1100,
                            },
                        ),
                    )
                )
                await process_single_task(
                    replay_list,
                    client,
                    results_dir,
                    browser
                )
                # Add this to ensure browser is always closed
                try:
                    await browser.close()
                except Exception as e:
                    logging.error(f"Error closing browser: {e}")

        # Create and run all tasks
        all_tasks = []
        for i, task in enumerate(replay_list):
            model = next(get_llm_model_generator(model_provider))
            all_tasks.append(process_with_semaphore(task, model))

        # Add timeout and better error handling
        await asyncio.gather(*all_tasks, return_exceptions=True)
    except Exception as e:
        traceback.print_exc()
        logging.error(f"Main loop error: {e}")
    finally:
        # Cleanup code here
        logging.info("Shutting down...")


if __name__ == "__main__":
    if os.path.exists("results"):
        shutil.rmtree("results")
    try:
        parser = argparse.ArgumentParser(
            description="Run browser tasks with concurrent execution"
        )
        parser.add_argument(
            "--max-concurrent",
            type=int,
            default=1,
            help="Maximum number of concurrent tasks (default: 1)",
        )
        parser.add_argument(
            "--model-provider",
            type=str,
            default="azure",
            help="Model provider (default: azure)",
            choices=[
                "azure",
                "anthropic",
                "openai",
                "ollama",
            ],
        )
        parser.add_argument(
            "--wap_replay_list",
            type=str,
            default="",
            help="the json file for WAP smart / exact replay list",
        )

        args = parser.parse_args()
        logging.info(f"Running with {args.max_concurrent} concurrent tasks")
        asyncio.run(main(args.max_concurrent,
                         args.model_provider,
                         wap_replay_list_path=args.wap_replay_list))
    except KeyboardInterrupt:
        print("\nReceived keyboard interrupt, shutting down...")
    except Exception as e:
        print(f"Fatal error: {e}")
        logging.exception("Fatal error occurred")

# python run_replay.py --max-concurrent 1 --model-provider openai --wap_replay_list data_processed/smart_replay/wap_smart_replay_list.json
