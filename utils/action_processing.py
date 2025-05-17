import json, re, sys
from typing import Any, Dict
from utils.html_cleaner import run_html_sanitizer
from jinja2 import Template
from pathlib import Path

TEMPLATE_DIR = Path("prompts/subgoal_generation")

def choose_template(action_type: str) -> Path:
    """Return the correct template file for a given action_type."""
    match action_type:
        case "submit":
            return TEMPLATE_DIR / "submit.md"
        case "go-back-or-forward":
            return TEMPLATE_DIR / "go-back-or-forward.md"
        case "task-start":
            return TEMPLATE_DIR / "task-start.md"
        case "task-finish":
            return TEMPLATE_DIR / "task-finish.md"
        case _:
            return TEMPLATE_DIR / "common.md"


def extract_action_bundle(raw: Dict[str, Any], sanitize: bool = False) -> Dict[str, Any]:
    """
    Split the incoming JSON dict into:
        action         {type, eventTarget}
        change_events  list from `allEvents`
        page_content   sanitized or raw HTML

    Returns a dict with those keys.
    """
    # 1. Top‑level type + eventTarget
    action = {
        "type": raw.get("type"),
        "eventTarget": raw.get("eventTarget")
    }

    # 2. Change events
    change_events = raw.get("allEvents", [])

    if change_events == {}:
        change_events = "[changes not available]"

    # 3. Page HTML
    page_html = raw.get("pageHTMLContent", "")

    # Use prettify to format the HTML.
    if sanitize:
        # Use the top‑level type to decide how to sanitize, if desired.
        page_html = run_html_sanitizer(page_html, action["type"] or "")

    page_html = re.sub(r'[\n\r\t\\]+', '', page_html)
    return {
        "action_type": raw.get("type"),
        "action": action,
        "change_events": change_events,
        "page_content": page_html
    }


def generate_subgoal_speculate_prompt(summary_event: Dict[str, Any], ultimate_goal: str, subtask_name: str, output_path: str) -> None:
    # 1) bundle relevant pieces
    grouped_items = extract_action_bundle(summary_event, True)
    # 2) prepare the data that the template expects
    context = {
        "ultimate_goal": ultimate_goal,
        "action":         grouped_items["action"],
        "change_events":  grouped_items["change_events"],
        "page_content": grouped_items["page_content"],
    }

    template = choose_template(grouped_items["action_type"])
    template_text = template.read_text(encoding="utf-8")
    filled_markdown = Template(template_text).render(**context)

    # 4) save to  subgoals/subgoal_<YYYYMMDD_HHMMSS>.md
    output_dir = Path(output_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"subgoal_{subtask_name}_{grouped_items['action_type']}.md"
    out_path.write_text(filled_markdown, encoding="utf-8")

    return out_path

# ---------------------------------------------------------------------------
# helper: locate exactly one task-start file and return its taskDescription
# ---------------------------------------------------------------------------
def find_task_prompt(data_dir: str | Path) -> str:
    data_dir = Path(data_dir)

    # 0️⃣  Does the path exist?
    if not data_dir.exists():
        sys.exit(f"[OTA error] given path does not exist: {data_dir}")

    # 0️⃣b Is it a directory?
    if not data_dir.is_dir():
        sys.exit(f"[OTA error] path is not a directory: {data_dir}")

    # 1️⃣  Gather every *.json recursively (sub-folders included)
    json_paths = sorted(data_dir.rglob("*.json"))
    if not json_paths:
        sys.exit(f"[OTA error] no *.json files found under {data_dir}")

    # 2️⃣  First file (by name) must be task-start
    first = json.loads(json_paths[0].read_text(encoding="utf-8"))
    if first.get("type") != "task-start":
        sys.exit("[OTA error] first JSON file is not a task-start record")

    # 3️⃣  Collect *all* task-start files
    task_start_files = [
        p for p in json_paths
        if json.loads(p.read_text(encoding="utf-8")).get("type") == "task-start"
    ]
    if len(task_start_files) == 0:
        sys.exit("[OTA error] no task-start file found")
    if len(task_start_files) > 1:
        names = ", ".join(p.name for p in task_start_files)
        sys.exit(f"[OTA error] multiple task-start files detected: {names}")

    # 4️⃣  Extract taskDescription
    task_json = json.loads(task_start_files[0].read_text(encoding="utf-8"))
    task_id   = task_json.get("taskId")
    task_desc = task_json.get("taskDescription")
    if not task_desc or not task_id:
        sys.exit(f"[OTA error] task-start file {task_start_files[0].name} "
                 "has no taskDescription or taskId")

    return task_desc, task_id


def load_event_json(path: str | Path) -> Dict[str, Any]:
    """Read the given JSON file and return it as a Python dict."""
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Cannot find JSON file: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)