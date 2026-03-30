import json
import time
import requests

OLLAMA_URL = "http://192.168.1.230:11434/api/chat"
MODEL = "deepseek-r1:70b"  # adjust if your model name differs

TESLA_EARNINGS = {
    "quarterly_earnings": [
        {"period_label": "Q1 '24", "periodicity": "Quarterly", "eps_reported": 0.45, "eps_estimate": 0.49, "eps_surprise_pct": -8.54, "revenue_reported": 21300000000, "revenue_estimate": 22220000000, "revenue_surprise_pct": -4.14},
        {"period_label": "Q2 '24", "periodicity": "Quarterly", "eps_reported": 0.52, "eps_estimate": 0.61, "eps_surprise_pct": -15.23, "revenue_reported": 25500000000, "revenue_estimate": 24520000000, "revenue_surprise_pct": 3.99},
        {"period_label": "Q3 '24", "periodicity": "Quarterly", "eps_reported": 0.72, "eps_estimate": 0.59, "eps_surprise_pct": 21.34, "revenue_reported": 25180000000, "revenue_estimate": 25470000000, "revenue_surprise_pct": -1.12},
        {"period_label": "Q4 '24", "periodicity": "Quarterly", "eps_reported": 0.73, "eps_estimate": 0.77, "eps_surprise_pct": -5.73, "revenue_reported": 25710000000, "revenue_estimate": 27260000000, "revenue_surprise_pct": -5.69},
        {"period_label": "Q1 '25", "periodicity": "Quarterly", "eps_reported": 0.27, "eps_estimate": 0.41, "eps_surprise_pct": -34.72, "revenue_reported": 19340000000, "revenue_estimate": 21270000000, "revenue_surprise_pct": -9.1},
        {"period_label": "Q2 '25", "periodicity": "Quarterly", "eps_reported": 0.4, "eps_estimate": 0.4, "eps_surprise_pct": 0.7, "revenue_reported": 22500000000, "revenue_estimate": 22280000000, "revenue_surprise_pct": 0.97},
        {"period_label": "Q3 '25", "periodicity": "Quarterly", "eps_reported": 0.5, "eps_estimate": 0.56, "eps_surprise_pct": -10.42, "revenue_reported": 28090000000, "revenue_estimate": 26540000000, "revenue_surprise_pct": 5.86},
        {"period_label": "Q4 '25", "periodicity": "Quarterly", "eps_reported": 0.5, "eps_estimate": 0.45, "eps_surprise_pct": 9.94, "revenue_reported": 24900000000, "revenue_estimate": 24780000000, "revenue_surprise_pct": 0.5},
        {"period_label": "Q1 '26", "periodicity": "Quarterly", "eps_reported": None, "eps_estimate": 0.41, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 22960000000, "revenue_surprise_pct": None},
        {"period_label": "Q2 '26", "periodicity": "Quarterly", "eps_reported": None, "eps_estimate": 0.46, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 24770000000, "revenue_surprise_pct": None},
        {"period_label": "Q3 '26", "periodicity": "Quarterly", "eps_reported": None, "eps_estimate": 0.52, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 27230000000, "revenue_surprise_pct": None},
        {"period_label": "Q4 '26", "periodicity": "Quarterly", "eps_reported": None, "eps_estimate": 0.58, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 28510000000, "revenue_surprise_pct": None}
    ],
    "annual_earnings": [
        {"period_label": "2019", "periodicity": "Annual", "eps_reported": 0, "eps_estimate": 0, "eps_surprise_pct": None, "revenue_reported": 24580000000, "revenue_estimate": 24250000000, "revenue_surprise_pct": 1.35},
        {"period_label": "2020", "periodicity": "Annual", "eps_reported": 0.75, "eps_estimate": 0.82, "eps_surprise_pct": -8.4, "revenue_reported": 31540000000, "revenue_estimate": 31100000000, "revenue_surprise_pct": 1.39},
        {"period_label": "2021", "periodicity": "Annual", "eps_reported": 2.26, "eps_estimate": 2.15, "eps_surprise_pct": 5.35, "revenue_reported": 53820000000, "revenue_estimate": 53010000000, "revenue_surprise_pct": 1.53},
        {"period_label": "2022", "periodicity": "Annual", "eps_reported": 4.07, "eps_estimate": 3.96, "eps_surprise_pct": 2.89, "revenue_reported": 81460000000, "revenue_estimate": 82140000000, "revenue_surprise_pct": -0.83},
        {"period_label": "2023", "periodicity": "Annual", "eps_reported": 3.12, "eps_estimate": 3.07, "eps_surprise_pct": 1.75, "revenue_reported": 96770000000, "revenue_estimate": 97460000000, "revenue_surprise_pct": -0.7},
        {"period_label": "2024", "periodicity": "Annual", "eps_reported": 2.42, "eps_estimate": 2.45, "eps_surprise_pct": -1.39, "revenue_reported": 97690000000, "revenue_estimate": 99660000000, "revenue_surprise_pct": -1.98},
        {"period_label": "2025", "periodicity": "Annual", "eps_reported": 1.66, "eps_estimate": 1.66, "eps_surprise_pct": 0.27, "revenue_reported": 94830000000, "revenue_estimate": 94910000000, "revenue_surprise_pct": -0.09},
        {"period_label": "2026", "periodicity": "Annual", "eps_reported": None, "eps_estimate": 1.98, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 104250000000, "revenue_surprise_pct": None},
        {"period_label": "2027", "periodicity": "Annual", "eps_reported": None, "eps_estimate": 2.63, "eps_surprise_pct": None, "revenue_reported": None, "revenue_estimate": 121080000000, "revenue_surprise_pct": None}
    ]
}

TESLA_EARNINGS_RELEASE = """
Total revenues for 2025 were $94.83 billion, down $2.86 billion year-over-year, with net income attributable to common stockholders of $3.79 billion, a decrease of $3.30 billion from 2024.
Produced 1.66 million and delivered 1.64 million consumer vehicles in 2025; launched Robotaxi service in June 2025.
Ended 2025 with $44.06 billion in cash, cash equivalents, and investments, up $7.50 billion from 2024.
Automotive sales revenue fell 9% to $65.82 billion; automotive regulatory credits revenue dropped 28% to $1.99 billion.
Energy generation and storage revenue rose 27% to $12.77 billion.
R&D expenses increased 41% to $6.41 billion, mainly due to AI and product roadmap expansion.
Capital expenditures expected to exceed $20 billion in 2026.
Ongoing challenges include trade policy uncertainty, inflation, rising interest rates, and evolving government incentives.
Exposure to supply chain disruptions, inflation, and tariffs impacting costs and production.
Restructuring actions in 2025 led to $390 million in charges related to AI chip design convergence.
"""

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

{"anomaly_flags": [<strings>], "risk_flags": [<strings>]}"""


def call_ollama_streaming(system_prompt, user_message, label):
    print(f"\n{'='*60}")
    print(f"▶  {label}")
    print(f"{'='*60}")

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "stream": True,
        "options": {
            "temperature": 0,
            "num_predict": 1000
        }
    }

    full_response = ""
    token_count = 0
    start = time.time()
    last_heartbeat = start

    print("\n[Streaming output]\n")

    try:
        with requests.post(OLLAMA_URL, json=payload, stream=True, timeout=300) as response:
            response.raise_for_status()

            for line in response.iter_lines():
                if not line:
                    continue

                chunk = json.loads(line.decode("utf-8"))
                token = chunk.get("message", {}).get("content", "")
                full_response += token
                token_count += 1

                # Print token immediately so user sees live output
                print(token, end="", flush=True)

                # Heartbeat every 10 seconds so user knows it's not stuck
                now = time.time()
                if now - last_heartbeat >= 10:
                    elapsed = now - start
                    print(f"\n  ⏱  [{elapsed:.0f}s elapsed — {token_count} tokens so far, still running...]\n", flush=True)
                    last_heartbeat = now

                if chunk.get("done"):
                    break

        elapsed = time.time() - start
        tps = token_count / elapsed if elapsed > 0 else 0

        print(f"\n\n{'─'*60}")
        print(f"  ✅ Done in {elapsed:.1f}s | {token_count} tokens | {tps:.1f} tok/s")
        print(f"{'─'*60}")

        # Validate JSON
        try:
            json.loads(full_response)
            print(f"  JSON valid: ✅")
        except json.JSONDecodeError:
            print(f"  JSON valid: ❌  (model added extra text)")

        return full_response, elapsed

    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to Ollama at {OLLAMA_URL}")
        print("   Make sure Ollama is running: ollama serve")
        return None, 0
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None, 0


def main():
    print("\n" + "="*60)
    print("  VCP Scoring Benchmark — Tesla (TSLA)")
    print(f"  Model : {MODEL}")
    print(f"  Host  : {OLLAMA_URL}")
    print(f"  Mode  : Streaming")
    print("="*60)

    # --- PROMPT 1: Quantitative Scorer ---
    p1_user = json.dumps(TESLA_EARNINGS, indent=2)
    p1_result, p1_time = call_ollama_streaming(
        PROMPT1_SYSTEM, p1_user, "Prompt 1 — Quantitative Scorer"
    )

    if p1_result is None:
        print("\nAborting — Prompt 1 failed.")
        return

    # --- PROMPT 2: Qualitative Analyser ---
    p2_user = f"VCP Fundamental Score from quantitative analysis:\n{p1_result}\n\nEarnings Release:\n{TESLA_EARNINGS_RELEASE}"
    p2_result, p2_time = call_ollama_streaming(
        PROMPT2_SYSTEM, p2_user, "Prompt 2 — Qualitative Analyser"
    )

    # --- Final Summary ---
    print(f"\n{'='*60}")
    print(f"  BENCHMARK SUMMARY")
    print(f"{'='*60}")
    print(f"  Prompt 1 : {p1_time:.1f}s")
    print(f"  Prompt 2 : {p2_time:.1f}s")
    print(f"  Total    : {p1_time + p2_time:.1f}s")
    print(f"\n  Expected score : 4 (Fundamentally Weak)")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()