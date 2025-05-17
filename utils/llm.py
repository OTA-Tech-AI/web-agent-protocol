"""Sub-goal generator helper

This tiny helper takes a text prompt, sends it to OpenAI via LangChain,
and returns the assistant's plain-text reply.
"""
from __future__ import annotations

import os
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain.schema import AIMessage, HumanMessage, SystemMessage

__all__ = ["ask_llm"]

# ---------------------------------------------------------------------------
# Basic LLM wrapper
# ---------------------------------------------------------------------------

def _build_llm(model: str = "gpt-4o", temperature: float = 0) -> ChatOpenAI:  # type: ignore
    """Create a LangChain ChatOpenAI client with sane defaults.

    Parameters
    ----------
    model : str
        OpenAI model name.  Defaults to *gpt-4o-mini* (fast/cheap).  Change to
        "gpt-4o" or "gpt-4-turbo" if you want higher quality.
    temperature : float
        Sampling temperature.
    """
    # The key must be available in the environment.  (Raise a clear error if not.)
    if "OPENAI_API_KEY" not in os.environ:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set.")

    return ChatOpenAI(model_name=model, temperature=temperature)


def ask_llm(prompt: str,
            system_prompt: Optional[str] = None,
            model: str = "gpt-4o",
            temperature: float = 0) -> str:
    """Send *prompt* to OpenAI and return the assistant text.

    Parameters
    ----------
    prompt : str
        User prompt / question.
    system_prompt : str | None
        Optional system message to steer model behaviour.
    model : str
        OpenAI model name (default: gpt-4o-mini).
    temperature : float
        Sampling temperature (default 0.2).

    Returns
    -------
    str
        Assistant's plain-text reply.
    """
    llm = _build_llm(model=model, temperature=temperature)

    messages = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))
    messages.append(HumanMessage(content=prompt))

    # Call the chat model.
    response = llm(messages)  # -> AIMessage

    if not isinstance(response, AIMessage):
        raise RuntimeError("Unexpected response type from LLM")

    return response.content.strip()
