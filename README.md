# Web Agent Protocol specification

This repository lets you

1. **Collect** user‑interaction data with the [OTA‑WAP Chrome extension](https://github.com/OTA-Tech-AI/OTA-WAP-browser-data-collector).
2. **Convert** the raw event stream into either **_exact‑replay_** or **_smart‑replay_** action lists.
3. **Replay** those lists with our customised *browser‑use* agent.

## Setup
Install the dependencies with the following command:

```bash
pip install -r requirements.txt      # Python 3.9+ recommended
```


## Start data‑collection server

Run the following command to start the server to collect data from the extension:
```bash
python action_collect_server.py
```

The server listens on http://localhost:4934/action-data and saves each session to:

```bash
data/YYYYMMDD/taskid/summary_event_<timestamp>.json
```

An example of the formatted data which you will received in the WAP backend server is like:

```json
{
  "taskId": "MkCAhQsHgXn7YgaK",
  "type": "click",
  "actionTimestamp": 1746325231479,
  "eventTarget": {
    "type": "click",
    "target": "<a ota-use-interactive-target=\"1\" data-ordinal=\"3\" href=\"https://www.allrecipes.com/recipe/68925/cheesy-baked-salmon/\" data-tax-levels=\"\" data-doc-id=\"6592066\" class=\"comp mntl-card-list-card--extendable mntl-universal-card mntl-document-card mntl-card card card--no-image\" id=\"mntl-card-list-card--extendable_3-0\">\n<div class=\"loc card__top\"><div class=\"card__media mntl-image card__media universal-image__container\">...",
    "targetId": "mntl-card-list-card--extendable_3-0",
    "targetClass": "comp mntl-card-list-card--extendable mntl-universal-card mntl-document-card mntl-card card card--no-image"
  },
  "allEvents": {},
  "pageHTMLContent": "<header data-tracking-container=\"true\" data-collapsible=\"true\" class=\"comp header mntl-header mntl-header--magazine mntl-header--open-search-bar mntl-header--myr\" id=\"header_1-0\"><a data-tracking-container=\"true\" id=\"mntl-skip-to-content_1-0\" class=\"mntl-skip-to-content mntl-text-link\" rel=\"nocaes\" href=\"#main\"></a><div class=\"mntl-header__menu-top\">..."
}
```


## Generate replay lists

| Mode                                               | Command                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exact replay** – exactly reproduce every action | `python wap_replay/generate_exact_replay_list.py --data_dir_path data/20250423/<task_id> --output_dir_path data_processed/exact_replay` |
| **Smart replay** – condensed goal‑oriented steps   | `python wap_replay/generate_smart_replay_list.py --data_dir_path data/20250423/<task_id> --output_dir_path data_processed/smart_replay` |

Replace **<task_id>** with the folder produced by the extension
(e.g. em3h6UBDZykz0gnH).

Output structure:
```bash
data_processed/smart_replay/
 ├─ subgoals_<task_id>/                     # intermediate prompts & replies
 └─ wap_smart_replay_list_<task_id>.json   # final smart replay list for the agent

data_processed/exact_replay/
 └─ wap_smart_replay_list_<task_id>.json   # final exact replay list for the agent
```

## Run the agent
```bash
python run_replay.py \
       --model-provider openai \
       --wap_replay_list data_processed/exact_replay/wap_exact_replay_list_<task_id>.json \
       --max-concurrent 1
```
Swap the path for the smart‑replay JSON to test that mode.

## Convert to MCP Server
```bash
python wap_replay\generate_mcp_server.py --task_id <task_id>
```

converted MCP servers will be located under ``` mcp_servers ``` folder

## Troubleshooting

**ModuleNotFoundError** – run commands from the project root or export PYTHONPATH=. (set PYTHONPATH=. for Windows).

“no task‑start file” – ensure the extension recorded a full session;
the generators require exactly one task-start and one task-finish record.
