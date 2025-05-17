"""
Batch-convert recorded event-JSON files into the canonical smart-replay”
action list by calling `record_metadata_to_actions` from browser-use.

Usage
-----
python wap_replay/generate_smart_replay_list.py --data_dir_path <folder_with_json_files> \
                             [--output_dir_path data_processed/exact_replay]
                             
Example
-----
python wap_replay/generate_smart_replay_list.py --data_dir_path data/20250423/Allrecipes--4 \
                             --output_dir_path data_processed/smart_replay
"""
import argparse
from pathlib import Path
from dotenv import load_dotenv
from utils.action_processing import generate_subgoal_speculate_prompt, find_task_prompt, load_event_json
from utils.subgoal_generator import generate_subgoals_from_dir, wap_subgoal_list_generation
load_dotenv()


def subgoal_prompt_generation(path: str,  output_path: str, ultimate_goal: str) -> None:
    # 1️⃣  collect every .json file under the root folder --------------------
    root = Path(path)
    json_paths = list(root.rglob("*.json"))
    if not json_paths:
        print(f"[OTA Info] No JSON files found under {root}")
        return

    print(f"[OTA Info] Found {len(json_paths)} event files.")
    # 2️⃣  process each event file ------------------------------------------
    for idx, event_path in enumerate(json_paths, 1):
        print(f"\n[{idx}/{len(json_paths)}] Loading {event_path}")
        summary_event = load_event_json(event_path)

        print("   Generating sub-goal …")
        generate_subgoal_speculate_prompt(summary_event, ultimate_goal, event_path.stem, output_path)

    print("\n[OTA Info] All done.")


def subgoal_llm_generation(folder, jsonl_name):
    results = generate_subgoals_from_dir(
        folder,
        system_prompt="You are a concise sub-goal assistant fot analysis of actions in browser.",
        model="gpt-4o",
        temperature=0,
        save_jsonl= jsonl_name
    )

def main() -> None:
    parser = argparse.ArgumentParser(description="Smart-replay pipeline")
    parser.add_argument("--data_dir_path", required=True,
                        help="Directory containing recorded event JSON files")
    parser.add_argument("--output_dir_path", default="data_processed/smart_replay",
                    help="Directory where all output will be placed "
                         "(default: data_processed/smart_replay)")
    args = parser.parse_args()

    data_dir   = Path(args.data_dir_path)
    output_dir = Path(args.output_dir_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    task_prompt, task_id = find_task_prompt(data_dir)
    print("[OTA Info] Using task prompt =>", task_prompt)
    print("[OTA Info] taskId           =>", task_id)

    subgoals_dir = output_dir / f"subgoals_{task_id}"
    subgoals_dir.mkdir(parents=True, exist_ok=True)

    subgoals_jsonl = subgoals_dir / "subgoals_output.jsonl"
    wap_json       = output_dir / f"wap_smart_replay_list_{task_id}.json"

    subgoal_prompt_generation(
        data_dir,
        subgoals_dir,
        task_prompt,
    )

    subgoal_llm_generation(
        subgoals_dir,
        subgoals_jsonl,
    )

    wap_subgoal_list_generation(
        task_prompt,
        task_id,
        subgoals_jsonl,
        wap_json,
    )

if __name__ == "__main__":
    main()