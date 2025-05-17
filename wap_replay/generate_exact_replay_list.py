"""
Batch-convert recorded event-JSON files into the canonical “exact-replay”
action list by calling `record_metadata_to_actions` from browser-use.

Usage
-----
python wap_replay/generate_exact_replay_list.py --data_dir_path <folder_with_json_files> \
                             [--output_dir_path data_processed/exact_replay]
                             
Example
-----
python wap_replay/generate_exact_replay_list.py --data_dir_path data/20250423/Allrecipes--4 \
                             --output_dir_path data_processed/exact_replay
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Dict, Any
from browser_use.wap.exact_replay import record_metadata_to_actions
from utils.action_processing import find_task_prompt, load_event_json

# ---------------------------------------------------------------------------#
# core function                                                              #
# ---------------------------------------------------------------------------#
def folder_to_actions(folder_path: str | Path) -> List[Dict[str, Any]]:
    """
    Walk sub-directories recursively, load every *.json file, convert each
    to replay actions via `record_metadata_to_actions`, and return the
    concatenated list.
    """
    folder_path = Path(folder_path)

    if not folder_path.is_dir():
        raise NotADirectoryError(folder_path)

    json_paths = list(folder_path.rglob("*.json"))   # recursive search
    if not json_paths:
        print(f"[OTA Info] No JSON files found under {folder_path}")
        return []

    print(f"[OTA Info] Found {len(json_paths)} event files.")

    all_actions: List[Dict[str, Any]] = []

    for idx, event_path in enumerate(json_paths, 1):
        print(f"[{idx}/{len(json_paths)}] Loading {event_path}")
        try:
            event_json = load_event_json(event_path)
            actions = record_metadata_to_actions([event_json])
            all_actions.extend(actions)
        except Exception as exc:
            print(f"[warn] could not process {event_path.name}: {exc}")

    print("[OTA Info] All done.")
    return all_actions


def save_exact_replay_bundle(
    path: Path,
    *,
    ultimate_goal: str,
    task_id: str,
    actions: List[Dict[str, Any]],
) -> None:
    """
    Write a JSON file shaped like
    """
    bundle = {
        "ultimate_goal": ultimate_goal,
        "task_id": task_id,
        "type": "exact_replay",
        "action_list": actions,
    }
    path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OTA info] wrote {len(actions)} actions → {path}")


# ---------------------------------------------------------------------------#
# command-line interface                                                     #
# ---------------------------------------------------------------------------#
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create exact-replay action list from a folder of event JSON files.")
    parser.add_argument("--data_dir_path", required=True, help="Folder containing recorded *.json files.")
    parser.add_argument("--output_dir_path", default="data_processed/exact_replay", help="Directory to store result file.")
    return parser.parse_args()

def main() -> None:
    args = parse_args()

    input_folder = Path(args.data_dir_path)
    output_dir = Path(args.output_dir_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    task_prompt, task_id = find_task_prompt(input_folder)
    output_path = output_dir / f"wap_exact_replay_list_{task_id}.json"

    actions = folder_to_actions(input_folder)
    save_exact_replay_bundle(
        output_path,
        ultimate_goal=task_prompt,
        task_id=task_id,
        actions=actions,
    )

if __name__ == "__main__":
    main()