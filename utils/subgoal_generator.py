"""Sub‑goal batch generator.

Given a directory path, this helper loads every `*.md` file (each file is
assumed to contain a prompt) and sends the content to OpenAI (via
`ask_llm`).  It returns a list of dicts with filename, prompt, and reply.
"""
from __future__ import annotations

import json, re
from pathlib import Path
from typing import List, Dict, Any, Optional

from utils.llm import ask_llm

__all__ = ["generate_subgoals_from_dir"]


def _load_prompts(dir_path: str | Path) -> List[tuple[Path, str]]:
    """Return a list of (path, text) for every .md file in *dir_path*."""
    dir_path = Path(dir_path)
    paths = sorted(dir_path.glob("*.md"))
    prompts: List[tuple[Path, str]] = []
    for p in paths:
        text = p.read_text(encoding="utf-8").strip()
        if text:
            prompts.append((p, text))
    return prompts


def generate_subgoals_from_dir(
    dir_path: str | Path,
    *,
    system_prompt: Optional[str] = None,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    save_jsonl: Optional[str | Path] = None,
) -> List[Dict[str, Any]]:
    """Load all .md files under *dir_path*, query the LLM, and return results.

    Parameters
    ----------
    dir_path : str | Path
        Directory containing `*.md` prompt files.
    system_prompt : str | None
        Optional system message for the LLM.
    model : str
        OpenAI model name.
    temperature : float
        Sampling temperature.
    save_jsonl : str | Path | None
        If given, write a JSON‑lines file with each result.

    Returns
    -------
    list[dict]
        Each dict contains {"file", "prompt", "reply"}.
    """
    prompts = _load_prompts(dir_path)
    if not prompts:
        raise FileNotFoundError(f"No .md files found in {dir_path}")

    if save_jsonl:
        save_path = Path(save_jsonl)
        if save_path.exists():
            save_path.unlink()

    results: List[Dict[str, Any]] = []

    for idx, (path, prompt_text) in enumerate(prompts, 1):
        print(f"[{idx}/{len(prompts)}] Querying LLM for {path.name} …")
        reply = ask_llm(
            prompt_text,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
        )
        result = {
            "file": path.name,
            "prompt": prompt_text,
            "reply": reply,
        }
        results.append(result)

        # Optionally append to JSONL file incrementally
        if save_jsonl:
            with Path(save_jsonl).open("a", encoding="utf-8") as f:
                f.write(json.dumps(result, ensure_ascii=False) + "\n")

    return results

# ---------------------------------------------------------------------------
# JSONL "reply" → next_goal extractor
# ---------------------------------------------------------------------------

def _clean_reply(raw_reply: str) -> str:
    """Remove markdown fences and whitespace from a reply string."""
    # strip triple back‑tick blocks if present
    fenced = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
    m = fenced.search(raw_reply)
    if m:
        return m.group(1).strip()
    return raw_reply.strip()


def wap_subgoal_list_generation(
    ultimate_goal: str,
    task_id: str,
    jsonl_path: str | Path,
    out_path: str | Path = "wap_subgoal.json",
) -> List[str]:
    """Read *jsonl_path*, extract the `next_goal` from each line's `reply`,
    and write the list of next goals to *out_path* (as a JSON array).

    Returns the list for immediate use.
    """
    jsonl_path = Path(jsonl_path)
    if not jsonl_path.is_file():
        raise FileNotFoundError(jsonl_path)

    goals: List[Dict[str, str]] = [{"index": 0, "subgoal": "task starts, go for the next sub-goal"}]
    with jsonl_path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                print(f"[extract] line {line_no}: malformed JSON – skipped")
                continue

            raw_reply = str(record.get("reply", ""))
            cleaned = _clean_reply(raw_reply)
            try:
                reply_json = json.loads(cleaned)
            except json.JSONDecodeError:
                print(f"[extract] line {line_no}: reply not valid JSON – skipped")
                continue

            goal_text = reply_json.get("next_goal")
            if goal_text:
                goals.append({"index": len(goals), "subgoal": goal_text})
            else:
                print(f"[extract] line {line_no}: no 'next_goal' key – skipped")

    goals.append({"index": len(goals), "subgoal": "task done"})
    
    final_output = {
        "ultimate_goal": ultimate_goal,
        "task_id": task_id,
        "type": "smart_replay",
        "subgoal_list": goals
    }
    Path(out_path).write_text(json.dumps(final_output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[extract] wrote {len(goals)} sub‑goals → {out_path}")
    return goals
