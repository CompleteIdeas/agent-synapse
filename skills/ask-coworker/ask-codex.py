#!/usr/bin/env python3
"""Query OpenAI Codex models via the Responses API.

Usage:
    python ask-codex.py "question"
    python ask-codex.py -m gpt-5.3-codex "question"
    python ask-codex.py -s "You are a TypeScript expert" "question"

Models: gpt-5.2-codex (default), gpt-5.3-codex (if project has access)
These models require /v1/responses, not /v1/chat/completions.
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Error: httpx not installed. Run: pip install httpx", file=sys.stderr)
    sys.exit(1)


def get_api_key():
    """Get OpenAI API key from llm's keys.json or environment."""
    # Try llm's key store first
    keys_path = Path(os.environ.get("APPDATA", "")) / "io.datasette.llm" / "keys.json"
    if keys_path.exists():
        try:
            keys = json.loads(keys_path.read_text())
            if "openai" in keys:
                return keys["openai"]
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback to environment variable
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key

    print("Error: No OpenAI API key found.", file=sys.stderr)
    print("Set OPENAI_API_KEY or run: llm keys set openai", file=sys.stderr)
    sys.exit(1)


def query_codex(question: str, model: str = "gpt-5.2-codex", system: str | None = None) -> str:
    """Send a question to the OpenAI Responses API."""
    api_key = get_api_key()

    body = {"model": model, "input": question}
    if system:
        body["instructions"] = system

    response = httpx.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json=body,
        timeout=120.0,
    )

    data = response.json()

    if response.status_code != 200:
        try:
            err = data.get("error", {})
            msg = err.get("message") or err.get("code") or response.text
        except Exception:
            msg = response.text
        print(f"Error (HTTP {response.status_code}): {msg}", file=sys.stderr)
        sys.exit(1)

    if data.get("error"):
        print(f"Error: {data['error']}", file=sys.stderr)
        sys.exit(1)

    # Extract text from the response
    parts = []
    for item in data.get("output", []):
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    parts.append(content["text"])
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(description="Query OpenAI Codex models via the Responses API")
    parser.add_argument("question", help="The question to ask")
    parser.add_argument("-m", "--model", default="gpt-5.2-codex",
                        help="Model to use (default: gpt-5.2-codex)")
    parser.add_argument("-s", "--system", default=None,
                        help="System/instructions prompt")
    args = parser.parse_args()

    result = query_codex(args.question, model=args.model, system=args.system)
    sys.stdout.buffer.write(result.encode("utf-8", errors="replace"))
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
