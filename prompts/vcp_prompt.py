"""
vcp_prompt.py — VCP Fundamental Scoring Benchmark
--------------------------------------------------
Usage:
  python vcp_prompt.py                        # run all tickers, all models
  python vcp_prompt.py --ticker TSLA          # single ticker, all models
  python vcp_prompt.py --ticker TSLA PLTR     # multiple tickers, all models
  python vcp_prompt.py --model qwen3:32b      # all tickers, single model
  python vcp_prompt.py --ticker TSLA --model deepseek-r1:32b qwen3:32b
  python vcp_prompt.py --skip-p2             # skip qualitative prompt (faster)
"""

import json
import time
import argparse
import requests
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL = "http://192.168.1.230:11434/api/chat"

DEFAULT_MODELS = [
    "deepseek-r1:70b",
    "deepseek-r1:32b",
    "qwen3:32b",
]

# Expected scores per ticker for accuracy checking
EXPECTED_SCORES = {
    "TSLA": 4,
    "PLTR": 10,
    "MSFT": 9,
    "META": 8,
}

# ── Load data files ───────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent

def load_json(filename):
    path = SCRIPT_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}. Make sure {filename} is in the same folder as this script.")
    with open(path) as f:
        return json.load(f)

# ── Prompts ───────────────────────────────────────────────────────────────────

PROMPT1_SYSTEM = """You are a quantitative analyst scoring a stock's fundamental quality for VCP (Volatility Contraction Pattern) trading.

VCP fundamental scoring measures whether a stock has business quality worth owning when a technical breakout triggers. You are NOT scoring for a catalyst event. You are scoring for earnings growth consistency, revenue growth consistency, profitability, and forward trajectory.

You will receive a JSON object with quarterly_earnings and annual_earnings. Score strictly using the criteria below. Apply them mechanically in order. Do not use external knowledge. Do not infer or estimate missing values.

---

## STEP 1 — IDENTIFY WORKING DATASET
Collect the last 4 quarterly entries where eps_reported is not null. Label them Q-1 (most recent), Q-2, Q-3, Q-4 (oldest). For YoY comparisons, match by quarter label (e.g. Q1 '25 vs Q1 '24).

---

## SCORING CRITERIA (Maximum 10 points)

### Criterion A — Profitability Status (0–3 points)
Examine eps_reported across the last 4 quarters (Q-1 through Q-4).
- All 4 quarters profitable (eps_reported > 0)              → 3 points
- 3 of 4 quarters profitable                                → 2 points
- 2 of 4 quarters profitable                                → 1 point
- Fewer than 2 quarters profitable                          → 0 points

### Criterion B — EPS Growth Trend (0–3 points)
For each of the last 4 quarters, compare eps_reported YoY against the same quarter one year prior.
Count only quarters where both current and prior year eps_reported are available AND prior year eps_reported > 0.
Count how many quarters show positive YoY EPS growth.
- 4 quarters of positive YoY growth     → 3 points
- 3 quarters of positive YoY growth     → 2 points
- 2 quarters of positive YoY growth     → 1 point
- Fewer than 2                          → 0 points

If fewer than 2 quarters have valid YoY comparisons available, score 0 points for this criterion.

### Criterion C — Revenue Growth Trend (0–2 points)
For each of the last 4 quarters, compare revenue_reported YoY against the same quarter one year prior.
Count how many quarters show positive YoY revenue growth.
- 3 or 4 quarters of positive YoY growth    → 2 points
- 2 quarters of positive YoY growth         → 1 point
- Fewer than 2                              → 0 points

### Criterion D — Forward Annual EPS Trajectory (0–2 points)
Find the most recently completed annual eps_reported (latest annual entry where eps_reported is not null).
Find the next annual eps_estimate (earliest annual entry where eps_reported is null and eps_estimate is not null).
If either value is null, not available, or the completed annual eps_reported is zero or negative, score 0 points.
Compute forward growth = (eps_estimate - eps_reported) / abs(eps_reported).
- Growth >= 30%     → 2 points
- Growth >= 10%     → 1 point
- Growth < 10%      → 0 points
- Negative growth   → 0 points

### Criterion E — Profitability Inflection Bonus (0–1 point)
Find the two most recently completed annual entries where eps_reported is not null.
- If the most recent annual eps_reported > 0 AND the prior annual eps_reported < 0   → 1 point
- Otherwise                                                                          → 0 points
If fewer than 2 completed annual entries exist, score 0 points.

---

## FINAL SCORE RULES
- Sum points from A + B + C + D + E.
- Minimum score: 1. Maximum score: 10.
- Do not round up. Truncate to integer.
- Scores of 5 and above indicate fundamentally sound. Scores below 5 indicate fundamentally weak.
- Do not adjust score based on sector, price action, valuation, or any factor not listed above.

---

## OUTPUT
Respond with valid JSON only. No preamble. No markdown. No code fences. No trailing text.
The response must start with { and end with }.

{"vcp_fundamental_score": <integer>, "justification": [<one string per criterion, max 20 words each>]}"""

PROMPT2_SYSTEM = """You are a financial analyst reviewing an earnings release to identify qualitative risks and anomalies.

You will receive:
1. A VCP fundamental score (integer 1-10) already computed from the quantitative data
2. The company's earnings release text

Your job is to:
- Identify any one-time, non-recurring, or extraordinary items that may have materially distorted EPS or revenue in any quarter (anomaly flags)
- Identify key business risks visible in the earnings release that would NOT be captured by a quantitative score (risk flags)

Rules:
- Maximum 3 anomaly flags. Each max 20 words.
- Maximum 4 risk flags. Each max 20 words.
- If no anomalies exist, return empty array for anomaly_flags.
- Respond with valid JSON only. No preamble. No markdown. No code fences. No trailing text.
- The response must start with { and end with }.

{"anomaly_flags": [<strings>], "risk_flags": [<strings>]}"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_code_fences(text):
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:] if lines[0].startswith("```") else lines
        lines = lines[:-1] if lines and lines[-1].strip() == "```" else lines
        text = "\n".join(lines).strip()
    return text


def call_ollama(model, system_prompt, user_message, label):
    print(f"\n{'='*60}")
    print(f"▶  {label}  [{model}]")
    print(f"{'='*60}\n")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message}
        ],
        "stream": True,
        "options": {"temperature": 0, "num_predict": 1000}
    }

    full_response = ""
    token_count = 0
    start = time.time()
    last_heartbeat = start

    try:
        with requests.post(OLLAMA_URL, json=payload, stream=True, timeout=300) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                chunk = json.loads(line.decode("utf-8"))
                token = chunk.get("message", {}).get("content", "")
                full_response += token
                token_count += 1
                print(token, end="", flush=True)

                now = time.time()
                if now - last_heartbeat >= 10:
                    print(f"\n  ⏱  [{now - start:.0f}s — {token_count} tokens, still running...]\n", flush=True)
                    last_heartbeat = now

                if chunk.get("done"):
                    break

        elapsed = time.time() - start
        tps = token_count / elapsed if elapsed > 0 else 0

        print(f"\n\n{'─'*60}")
        print(f"  ✅ {elapsed:.1f}s | {token_count} tokens | {tps:.1f} tok/s")

        cleaned = strip_code_fences(full_response)
        try:
            parsed = json.loads(cleaned)
            print(f"  JSON: ✅")
        except json.JSONDecodeError:
            parsed = None
            print(f"  JSON: ❌")
        print(f"{'─'*60}")

        return parsed, elapsed, tps

    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to {OLLAMA_URL} — is Ollama running?")
        return None, 0, 0
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None, 0, 0

# ── Core runner ───────────────────────────────────────────────────────────────

def run_ticker_model(ticker, model, earnings_data, release_data, skip_p2=False):
    earnings = earnings_data.get(ticker)
    release  = release_data.get(ticker, "")

    if not earnings:
        print(f"  ⚠️  No earnings data found for {ticker}")
        return None

    result = {
        "ticker": ticker,
        "model": model,
        "score": None,
        "expected": EXPECTED_SCORES.get(ticker),
        "score_correct": None,
        "p1_json_valid": False,
        "p2_json_valid": False,
        "p1_time": 0,
        "p2_time": 0,
        "total_time": 0,
        "p1_tps": 0,
        "p2_tps": 0,
        "anomaly_flags": [],
        "risk_flags": [],
        "justification": [],
    }

    # Prompt 1 — Quantitative scorer
    p1_parsed, p1_time, p1_tps = call_ollama(
        model, PROMPT1_SYSTEM,
        json.dumps(earnings, indent=2),
        f"P1 Scorer — {ticker}"
    )
    result["p1_time"] = p1_time
    result["p1_tps"]  = p1_tps

    if p1_parsed:
        result["p1_json_valid"]  = True
        result["score"]          = p1_parsed.get("vcp_fundamental_score")
        result["justification"]  = p1_parsed.get("justification", [])
        result["score_correct"]  = result["score"] == result["expected"]

    # Prompt 2 — Qualitative analyser (optional)
    if not skip_p2 and release:
        p2_user = f"VCP Fundamental Score:\n{json.dumps(p1_parsed or {}, indent=2)}\n\nEarnings Release:\n{release}"
        p2_parsed, p2_time, p2_tps = call_ollama(
            model, PROMPT2_SYSTEM,
            p2_user,
            f"P2 Qualitative — {ticker}"
        )
        result["p2_time"] = p2_time
        result["p2_tps"]  = p2_tps
        if p2_parsed:
            result["p2_json_valid"]  = True
            result["anomaly_flags"]  = p2_parsed.get("anomaly_flags", [])
            result["risk_flags"]     = p2_parsed.get("risk_flags", [])

    result["total_time"] = result["p1_time"] + result["p2_time"]
    return result

# ── Summary printer ───────────────────────────────────────────────────────────

def print_summary(results, skip_p2):
    print(f"\n\n{'='*70}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*70}")

    col = 14
    hdrs = ["Ticker", "Model", "Score", "Correct?", "P1 JSON", "P1 Time", "P1 tok/s"]
    if not skip_p2:
        hdrs += ["P2 JSON", "P2 Time", "P2 tok/s"]
    hdrs += ["Total"]

    print("  " + "  ".join(h.ljust(col) for h in hdrs))
    print("  " + "─" * (col * len(hdrs) + 2 * len(hdrs)))

    for r in results:
        if r is None:
            continue
        expected_str = f"{r['score']} (exp {r['expected']})" if r['expected'] else str(r['score'])
        row = [
            r["ticker"],
            r["model"].split(":")[0] + ":" + r["model"].split(":")[-1],
            expected_str,
            "✅" if r["score_correct"] else "❌",
            "✅" if r["p1_json_valid"] else "❌",
            f"{r['p1_time']:.1f}s",
            f"{r['p1_tps']:.1f}",
        ]
        if not skip_p2:
            row += [
                "✅" if r["p2_json_valid"] else "❌",
                f"{r['p2_time']:.1f}s",
                f"{r['p2_tps']:.1f}",
            ]
        row += [f"{r['total_time']:.1f}s"]
        print("  " + "  ".join(str(v).ljust(col) for v in row))

    if not skip_p2:
        print(f"\n{'─'*70}")
        print("  Qualitative Flags")
        print(f"{'─'*70}")
        for r in results:
            if r is None or not r["p2_json_valid"]:
                continue
            print(f"\n  [{r['ticker']} — {r['model']}]")
            for f in r["anomaly_flags"]:
                print(f"  ⚠️  {f}")
            for f in r["risk_flags"]:
                print(f"  🔴 {f}")

    print(f"\n{'='*70}\n")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="VCP Fundamental Scoring Benchmark")
    parser.add_argument("--ticker", nargs="+", help="Ticker(s) to run e.g. TSLA PLTR")
    parser.add_argument("--model",  nargs="+", help="Model(s) to use e.g. qwen3:32b")
    parser.add_argument("--skip-p2", action="store_true", help="Skip qualitative prompt (faster)")
    args = parser.parse_args()

    earnings_data = load_json("earnings.json")
    release_data  = load_json("release.json")

    tickers = args.ticker if args.ticker else list(earnings_data.keys())
    models  = args.model  if args.model  else DEFAULT_MODELS

    print(f"\n{'='*70}")
    print(f"  VCP Benchmark")
    print(f"  Tickers : {', '.join(tickers)}")
    print(f"  Models  : {', '.join(models)}")
    print(f"  P2      : {'disabled' if args.skip_p2 else 'enabled'}")
    print(f"  Host    : {OLLAMA_URL}")
    print(f"{'='*70}")

    all_results = []
    for ticker in tickers:
        for model in models:
            result = run_ticker_model(ticker, model, earnings_data, release_data, skip_p2=args.skip_p2)
            all_results.append(result)

    print_summary(all_results, skip_p2=args.skip_p2)


if __name__ == "__main__":
    main()
