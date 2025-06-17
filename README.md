[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/ota-tech-ai-web-agent-protocol-badge.png)](https://mseep.ai/app/ota-tech-ai-web-agent-protocol)

<!-- markdownlint-disable first-line-h1 -->
<!-- markdownlint-disable html -->
<!-- markdownlint-disable no-duplicate-header -->

<div align="center">
  <img src="chrome-extension/assets/beholder-tool-kit-long.png" width="100%" alt="OTA-tool-kits" style="border-radius: 10px;" />
</div>
<br>
<div align="center" style="line-height: 1;">
  <a href="https://www.otatech.ai/"><img alt="Homepage"
	src="https://img.shields.io/badge/Visit-otatech.ai-blue"/></a>
  <a href="https://huggingface.co/OTA-AI/OTA-v1"><img alt="Hugging Face"
	src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-OTA%20AI-ffc107?color=ffc107&logoColor=white"/></a>
  <a href="https://github.com/OTA-Tech-AI/webagentprotocol/blob/main/LICENSE"><img alt="Code License"
	src="https://img.shields.io/badge/Code_License-MIT-f5de53?&color=f5deff"/></a>
  <br><br><br>
</div>

# Web Agent Protocol

## Overview

The Web Agent Protocol (WAP) is a standardized framework designed to enable seamless interaction between users, web agents, and browsers by recording and replaying browser actions. It separates the concerns of action recording and execution, allowing for efficient automation and reusability. The Python SDK for WAP implements the full specification, making it easy to:

1. **Collect** user‑interaction data with the [OTA‑WAP Chrome extension](https://github.com/OTA-Tech-AI/webagentprotocol/tree/main/chrome-extension).
2. **Convert** the raw event stream into either **_exact‑replay_** or **_smart‑replay_** action lists.
3. **Convert** recorded actions into **_MCP_** servers for reuse by any agent or user
4. **Replay** those lists using the **_WAP-Replay_** protocol to ensure accurate browser operations.

### WAP FULL DEMO

[![Watch the video](https://img.youtube.com/vi/joh9FXJfnwk/0.jpg)](https://www.youtube.com/watch?v=joh9FXJfnwk)

### Without WAP
![image](https://github.com/user-attachments/assets/843ea9da-45c0-48e9-8a25-44f5bfb31786)

### WAP Record
![image](https://github.com/user-attachments/assets/3d041f56-9e76-4b61-9b56-0686070723a3)

### WAP Replay
![image](https://github.com/user-attachments/assets/e13ca7c7-3cc1-4952-8a79-3bd1e9e98580)

## Example using WAP
![image](https://github.com/user-attachments/assets/ccb7387b-0677-498c-b4ad-a10590e37e27)

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

Create **.env** file under the repo root directory with your own API keys:
```
OPENAI_API_KEY=sk-proj-...
DEEPSEEK_API_KEY=sk-...
```

## Record

### WAP record extension
Please refer to [OTA‑WAP Chrome Extension](https://github.com/OTA-Tech-AI/webagentprotocol/tree/main/chrome-extension) to setup action capturer in your Chrome browser.

### Start data‑collection server

Run the following command to start the server to collect data from the extension:
```bash
python action_collect_server.py
```
**Once the server is up, you can start to record from the page using WAP Chrome extension.**

The server listens on http://localhost:4934/action-data by default, please make sure the Host and Port in the extension settings match this server config.
Each session will be saved to:

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

## Replay
```bash
python run_replay.py --model-provider openai --wap_replay_list data_processed/exact_replay/wap_exact_replay_list_<task_id>.json --max-concurrent 1
```
For **smart-replay**, replace the path with a smart‑replay JSON to test this mode.

## Convert to MCP Server

```bash
python wap_replay\generate_mcp_server.py --task_id <task_id>
```

converted MCP servers will be located under ``` mcp_servers ``` folder

## Replay with MCP

You would need 2 terminals to replay with MCP. In the first termnial
```bash
python wap_service.py
```

In the second termnial
```bash
python mcp_client.py
```

Then enter your prompt in the second terminal

```bash
example: find a top rated keyboard on amazon.ca using smart replay
```

## Replay with our Desktop App

We provide out-of-box desktop app for running replay lists. It is easy to install and you don't need any extra steps for setup and deployments. Visit [WAP Replay Tool releases](https://github.com/OTA-Tech-AI/web-agent-protocol/releases) for more details.

<img src="assets/wap_replay_tool_demo.gif" alt="WAP Replay Tool Demo GIF" width="500"/>


## Troubleshooting

**ModuleNotFoundError** – run commands from the project root or export PYTHONPATH=. (set PYTHONPATH=. for Windows).

“no task‑start file” – ensure the extension recorded a full session;
the generators require exactly one task-start and one task-finish record.

## Acknowledgement

Browser-Use: https://github.com/browser-use/browser-use

MCP: https://github.com/modelcontextprotocol/python-sdk

DOM Extension: https://github.com/kdzwinel/DOMListenerExtension
