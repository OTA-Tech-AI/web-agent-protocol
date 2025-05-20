<!-- markdownlint-disable first-line-h1 -->
<!-- markdownlint-disable html -->
<!-- markdownlint-disable no-duplicate-header -->

<div align="center">
  <img src="chrome-extension/assets/beholder-tool-kit-long.png" width="100%" alt="OTA-tool-kits" style="border-radius: 10px;" />
</div>
<br>
<div align="center" style="line-height: 1;">
  <a href="https://www.otatech.ai/"><img alt="Homepage"
	src="https://img.shields.io/badge/Home-Page-blue"/></a>
  <a href="https://huggingface.co/OTA-AI/OTA-v1"><img alt="Hugging Face"
	src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-OTA%20AI-ffc107?color=ffc107&logoColor=white"/></a>
  <a href="https://github.com/OTA-Tech-AI/webagentprotocol/blob/main/LICENSE"><img alt="Code License"
	src="https://img.shields.io/badge/Code_License-MIT-f5de53?&color=f5deff"/></a>
  <br><br><br>
</div>

# Web Agent Protocol

This repository lets you

1. **Collect** user‑interaction data with the [OTA‑WAP Chrome extension](https://github.com/OTA-Tech-AI/webagentprotocol/tree/main/chrome-extension).
2. **Convert** the raw event stream into either **_exact‑replay_** or **_smart‑replay_** action lists.
3. **Replay** those lists with our customised *browser‑use* agent.

## Overview

The Web Agent Protocol (WAP) is a standardized framework designed to enable seamless interaction between users, web agents, and browsers by recording and replaying browser actions. It separates the concerns of action recording and execution, allowing for efficient automation and reusability. The Python SDK for WAP implements the full specification, making it easy to:

- Record browser actions from human or agent interactions.
- Replay recorded actions using the WAP-Replay protocol to ensure accurate browser operations.
- Convert recorded actions into MCP servers for reuse by any agent or user.

### Without WAP
![image](https://github.com/user-attachments/assets/843ea9da-45c0-48e9-8a25-44f5bfb31786)

### WAP Record
![image](https://github.com/user-attachments/assets/3d041f56-9e76-4b61-9b56-0686070723a3)

### WAP Replay
![image](https://github.com/user-attachments/assets/e13ca7c7-3cc1-4952-8a79-3bd1e9e98580)

## Example using WAP
![image](https://github.com/user-attachments/assets/c8fc4645-babf-4bcd-82ad-3e5eafb62b64)


## Setup
Install the dependencies with the following command:

Create a conda env

```bash
conda create -n WAP python=3.11
```

Activate the conda env

```bash
conda activate WAP
```

Install the dependencies

```bash
pip install -r requirements.txt
```

Setup your repo source path:
```
set PYTHONPATH=C:/path/to/webagentprotocol # for Windows
export PYTHONPATH=/path/to/webagentprotocol # for Linux
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
| **Exact replay** – exactly reproduce every action | `python wap_replay/generate_exact_replay_list.py --data_dir_path data/<date>/<task_id> --output_dir_path data_processed/exact_replay` |
| **Smart replay** – condensed goal‑oriented steps   | `python wap_replay/generate_smart_replay_list.py --data_dir_path data/<date>/<task_id> --output_dir_path data_processed/smart_replay` |

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
python run_replay.py --model-provider openai --wap_replay_list data_processed/exact_replay/wap_exact_replay_list_<task_id>.json --max-concurrent 1
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
