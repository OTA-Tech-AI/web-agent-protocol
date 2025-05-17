from browser_use.agent.views import ActionModel

from browser_use.browser.context import BrowserContext
from browser_use.controller.service import Controller

import re
from typing import Iterable, List, Dict, TypeVar, Optional, Tuple
from langchain_core.language_models.chat_models import BaseChatModel
Context = TypeVar('Context')

ALLOWED_ACTION_LIST = {"wait_for_element", "input_text_by_selector", "click_element_by_selector",
                       "select_option_by_selector", "click_element_by_text",
                       "send_keys", "open_tab", "go_to_url", "extract_content", "done"}

_TAG_RX   = re.compile(r"<\s*(\w+)[^>]*>", re.I)
_ATTR_RX  = re.compile(r'([\w:-]+)\s*=\s*"([^"]*?)"', re.I)
# _TEXT_RX  = re.compile(r">(.*?)<", re.S)
_STRIP_RX = re.compile(r"<[^>]+>")

# ---------------------------------------------------------------------------
# small envelope helper
# ---------------------------------------------------------------------------
def _make(action: str, **params) -> dict:
    """Return {"action": action, "action_params": {…}}"""
    return {"action": action, "action_params": params}


def _extract_inner_text_tag_type(raw_html: str) -> Tuple[str | None, str | None, str | None]:
    """Return (inner_text, tag, input_type)."""
    tag = itype = text = None

    if raw_html:
        m_tag = _TAG_RX.search(raw_html)
        if m_tag:
            tag = m_tag.group(1).lower()

        if tag == "input":
            for k, v in _ATTR_RX.findall(raw_html):
                if k.lower() == "type":
                    itype = v.lower()
                    break
            else:
                itype = ""

        stripped = _STRIP_RX.sub("", raw_html)
        stripped = re.sub(r"\s+", " ", stripped).strip()
        if stripped:
            text = stripped
    return text, tag, itype


def _selector_from_click(evt: Dict) -> Dict[str, str] | None:
    """
    Derive the most reliable selector from recorder payload.

    Priority
    --------
    1. #id
    2. Stable attrs: data-testid/data-test/data-automation/aria-label/name/
       aria-controls/data-bs-target/title/placeholder
    3. Tag-specific unique attrs: img@alt/src, a@href, option@value, input@value
    4. Visible text (last resort)           → {"mode":"text", …}
    """
    tgt = evt.get("eventTarget", {}) or {}

    # 1️⃣ id -------------------------------------------------------------------
    tid = tgt.get("targetId")
    if tid:
        return {"mode": "css", "selector": f"#{tid}"}

    raw_html = tgt.get("target", "")
    text, tag, _ = _extract_inner_text_tag_type(raw_html)
    attrs = {k.lower(): v for k, v in _ATTR_RX.findall(raw_html)}

    # 2️⃣ stable attribute selectors ------------------------------------------
    ATTR_PRIORITY = [
        "data-testid", "data-test", "data-automation",
        "aria-label", "aria-controls", "data-bs-target",
        "name", "title", "placeholder",
    ]
    for a in ATTR_PRIORITY:
        if a in attrs and attrs[a]:
            return {"mode": "css", "selector": f'{tag or "*"}[{a}="{attrs[a]}"]'}

    # 3️⃣ tag-specific unique attrs -------------------------------------------
    if tag == "img":
        if attrs.get("alt"):
            return {"mode": "css", "selector": f'img[alt="{attrs["alt"]}"]'}
        if attrs.get("src"):
            return {"mode": "css", "selector": f'img[src="{attrs["src"]}"]'}

    if tag == "a" and attrs.get("href"):
        return {"mode": "css", "selector": f'a[href="{attrs["href"]}"]'}

    if tag == "option" and attrs.get("value"):
        return {"mode": "css", "selector": f'option[value="{attrs["value"]}"]'}

    if tag == "input" and attrs.get("value"):
        return {"mode": "css", "selector": f'input[value="{attrs["value"]}"]'}

    # 4️⃣ last-resort: visible text -------------------------------------------
    if text:
        return {"mode": "text", "text": text, "tag": tag or "*"}

    return None


def _handle_task_start(evt: Dict, plan: List[Dict]) -> None:
    url = evt["allEvents"][0]["current_url"]
    plan.extend([
        _make("open_tab", url=url)
    ])

def _handle_click(evt: Dict, plan: List[Dict]) -> None:
    sel_info = _selector_from_click(evt)
    if not sel_info:
        print(f"[OTA warning]: event: {evt} has no corresponding action handler")
        return

    if sel_info["mode"] == "css":
        css = sel_info["selector"]
        plan.extend([
            _make("wait_for_element", selector=css, timeout=5_000),
            _make("click_element_by_selector", css_selector=css),
        ])

    elif sel_info["mode"] == "text":
        txt   = sel_info["text"]
        etype = sel_info["tag"]            # may be "*" (any)
        # wait using the same visible-text trick (BrowserUse supports it)
        plan.extend([
            _make("wait_for_element", selector=f'{etype}:text("{txt}")', timeout=5_000),
            _make("click_element_by_text", text=txt, element_type=None if etype == "*" else etype, nth=0),
        ])

def _handle_go_back_or_forward(evt: Dict, plan: List[Dict]) -> None:
    url = evt["eventTarget"]["target"]
    plan.extend([
        _make("go_to_url", url=url),
        _make("wait_for_element", selector="body", timeout=8_000),
    ])

def _handle_submit(evt: Dict, plan: List[Dict]) -> None:
    """
    Convert one submit-form event (new JSON shape) into canonical actions
    and extend *plan*.

    Handles these control kinds
    ---------------------------
    • Text-like <input> types: text | search | password | email | number |
      tel | url | date | datetime-local
    • <textarea>
    • <select>
    • Checkbox / radio
    • <button> or <input type="submit|button"> (treated as "click")
    Ignores hidden inputs, file-uploads, reset buttons, etc.
    """
    all_events = evt.get("allEvents") or {}
    if not all_events:
        print("[warn] submit event has no allEvents payload")
        return

    TEXT_INPUT_TYPES = {
        "text", "search", "password", "email", "number",
        "tel", "url", "date", "datetime-local", ""
    }
    CHECKABLE_TYPES = {"checkbox", "radio"}
    BUTTON_TYPES    = {"submit", "button", "image"}
    IGNORE_TYPES    = {"hidden", "file", "reset"}

    last_selector_for_enter = None

    # ── iterate over every control that contributed to the submission ─────
    for ctrl in all_events.values():
        val = ctrl.get("value")
        if val is None:              # e.g. unchecked checkbox
            continue

        sel = (ctrl.get("selector") or "").strip()
        tag = (ctrl.get("tag") or "").lower()
        typ = (ctrl.get("type") or "").lower()

        if not sel or typ in IGNORE_TYPES:
            continue  # skip controls we cannot / need not replay

        # always wait for the element to appear
        plan.append(_make("wait_for_element", selector=sel, timeout=5_000))

        # ---- plain text-like inputs ------------------------------------ #
        if tag == "input" and typ in TEXT_INPUT_TYPES:
            plan.append(_make("input_text_by_selector", selector=sel, text=val))
            last_selector_for_enter = sel

        # ---- textarea --------------------------------------------------- #
        elif tag == "textarea":
            plan.append(_make("input_text_by_selector", selector=sel, text=val))
            last_selector_for_enter = sel

        # ---- checkbox / radio ------------------------------------------- #
        elif tag == "input" and typ in CHECKABLE_TYPES:
            plan.append(_make("click_element_by_selector", css_selector=sel))

        elif tag == "select":
            plan.append(_make(
                "select_option_by_selector",
                css_selector=sel,
                value=val,              # use recorded <option value="…">
                # label=None            # or add a 'label' field if you record it
            ))

        # ---- submit / generic buttons inside the form ------------------- #
        elif (tag == "button") or (tag == "input" and typ in BUTTON_TYPES):
            plan.append(_make("click_element_by_selector", css_selector=sel))

        # ---- other control types are ignored ---------------------------- #

    # ── final “submit” action ─────────────────────────────────────────────
    if last_selector_for_enter:
        # Typing Enter in the last text control often triggers the form.
        plan.append(_make("send_keys", keys="Enter"))
    else:
        # Fall back to clicking the recorded submit/ form selector
        submit_sel = evt.get("eventTarget", {}).get("selector")
        if submit_sel:
            plan.extend([
                _make("wait_for_element", selector=submit_sel, timeout=5_000),
                _make("click_element_by_selector", css_selector=submit_sel),
            ])


def _handle_input_change(evt: Dict, plan: List[Dict]) -> None:
    """
    Map a single `input-change` event to canonical actions.

    Supports:
      • <input type=text|search|password|email|number|tel|url|date|datetime-local>
      • <textarea>
      • <select>
      • <input type=checkbox|radio>
    Ignores hidden / file / reset inputs.
    """
    tgt = evt.get("eventTarget", {}) or {}
    val = tgt.get("value")
    if val is None:                          # unchecked checkbox etc.
        return

    # -------- selector --------------------------------------------------
    sel_info = _selector_from_click({"eventTarget": tgt})
    if not sel_info or sel_info["mode"] != "css":
        return                               # need a CSS selector here
    sel_css = sel_info["selector"]

    # -------- tag / input-type -----------------------------------------
    raw_html            = tgt.get("target", "")
    _, tag, input_type  = _extract_inner_text_tag_type(raw_html)

    TEXT_INPUT_TYPES = {
        "text", "search", "password", "email", "number",
        "tel", "url", "date", "datetime-local", ""
    }
    CHECKABLE_TYPES = {"checkbox", "radio"}
    IGNORE_TYPES    = {"hidden", "file", "reset"}

    if tag == "input" and input_type in IGNORE_TYPES:
        return                                # skip

    # always wait for the element
    plan.append(_make("wait_for_element", selector=sel_css, timeout=5_000))

    # -------- specific actions -----------------------------------------
    if tag == "input" and input_type in TEXT_INPUT_TYPES:
        plan.append(_make("input_text_by_selector", selector=sel_css, text=val))

    elif tag == "textarea":
        plan.append(_make("input_text_by_selector", selector=sel_css, text=val))

    elif tag == "input" and input_type in CHECKABLE_TYPES:
        plan.append(_make("click_element_by_selector", css_selector=sel_css))

    elif tag == "select":
        plan.append(_make(
            "select_option_by_selector",
            css_selector=sel_css,
            value=val,
        ))


def _handle_task_finish(evt: Dict, plan: List[Dict]) -> None:
    goal = evt.get("taskDescription", "")
    plan.extend([
        _make("extract_content", goal=goal, should_strip_link_urls=False),
        _make("done", text="task executed successfully", success=True),
    ])

def _handle_unknown(evt: Dict, plan: List[Dict]) -> None:
    print(f"[warn] Unknown event type: {evt.get('type')}")

# ---------------------------------------------------------------------------
# main dispatcher
# ---------------------------------------------------------------------------
def record_metadata_to_actions(events: Iterable[Dict]) -> List[Dict]:
    plan: List[Dict] = []

    handlers = {
        "task-start": _handle_task_start,
        "click": _handle_click,
        "go-back-or-forward": _handle_go_back_or_forward,
        "submit": _handle_submit,
        "task-finish": _handle_task_finish,
        "input-change": _handle_input_change
    }

    for evt in events:
        etype = evt.get("type")
        handler = handlers.get(etype, _handle_unknown)
        handler(evt, plan)
    return plan


async def run_exact_replay(
    exact_replay_list: list[dict],
    controller: Controller,
    browser: BrowserContext,
    action_model: ActionModel,
    page_extraction_llm: Optional[BaseChatModel] = None,
    sensitive_data: Optional[Dict[str, str]] = None,
    available_file_paths: Optional[list[str]] = None,
    context: Context | None = None,
):
    results = []
    for step in exact_replay_list:
        act = step["action"]
        params = {act: step["action_params"]}
        cur_action_model = action_model(**params)
        print("[OTA exact replay] Current action: ", params)

        if act in ALLOWED_ACTION_LIST:
            result = await controller.act(
                cur_action_model,
                browser_context=browser,
                page_extraction_llm=page_extraction_llm,
                sensitive_data=sensitive_data,
                available_file_paths=available_file_paths,
                context=context
            )
        else:
            raise ValueError(f"Unknown plan action: {act}")
        results.append(result)
    return results