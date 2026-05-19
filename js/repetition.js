'use strict';

/**
 * Spaced-repetition tracker for French number practice.
 * Persists state in localStorage under the key 'franscijfers_data'.
 *
 * Weight rules per number:
 *   - Start      : 1.0
 *   - After wrong : weight = min(weight × 2, 8)
 *   - After right : weight = max(weight × 0.7, 0.5)
 *   - 3 consecutive right → weight reset to 1.0
 *
 * nextNumber() uses weighted-random selection within the active range.
 * getSimilar() returns nearby numbers (same decade / same hundred) to
 * reinforce patterns after an error.
 */
class RepetitionTracker {
  constructor() {
    this._storageKey = 'franscijfers_data';
    this.data = this._load();
  }

  // ── persistence ───────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this.data));
    } catch { /* quota exceeded — silently ignore */ }
  }

  // ── per-number record ──────────────────────────────────────────────────────

  _get(n) {
    if (!this.data[n]) {
      this.data[n] = { attempts: 0, correct: 0, consecutive: 0, weight: 1.0 };
    }
    return this.data[n];
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Record the outcome of a question.
   * @param {number} n          The number that was shown.
   * @param {boolean} isCorrect Whether the student answered correctly.
   */
  recordResult(n, isCorrect) {
    const d = this._get(n);
    d.attempts++;
    if (isCorrect) {
      d.correct++;
      d.consecutive++;
      if (d.consecutive >= 3) {
        d.weight = 1.0;
        d.consecutive = 0;      // streak fulfilled — reset counter
      } else {
        d.weight = Math.max(d.weight * 0.7, 0.5);
      }
    } else {
      d.consecutive = 0;
      d.weight = Math.min(d.weight * 2, 8.0);
    }
    this._save();
  }

  /**
   * Weighted-random selection from [min, max].
   * Numbers with higher weight are more likely to be chosen.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextNumber(min, max) {
    let total = 0;
    for (let i = min; i <= max; i++) total += this._get(i).weight;

    let rand = Math.random() * total;
    for (let i = min; i <= max; i++) {
      rand -= this._get(i).weight;
      if (rand <= 0) return i;
    }
    return max;
  }

  /**
   * Return up to `count` numbers "similar" to n within [min, max].
   * Similarity: same decade (score 3) > same hundred (score 1).
   * @param {number} n
   * @param {number} min
   * @param {number} max
   * @param {number} [count=5]
   * @returns {number[]}
   */
  getSimilar(n, min, max, count = 5) {
    const decade = Math.floor(n / 10) * 10;
    const hundred = Math.floor(n / 100) * 100;

    const candidates = [];
    for (let i = min; i <= max; i++) {
      if (i === n) continue;
      const iDecade = Math.floor(i / 10) * 10;
      const iHundred = Math.floor(i / 100) * 100;
      let score = 0;
      if (iDecade === decade) score = 3;
      else if (iHundred === hundred) score = 1;
      if (score > 0) candidates.push({ n: i, score });
    }

    // Sort by score desc, shuffle ties
    candidates.sort((a, b) => b.score - a.score || Math.random() - 0.5);
    return candidates.slice(0, count).map(c => c.n);
  }

  /**
   * Slightly boost the weight of similar numbers after an error,
   * so the student practises the same pattern right away.
   * @param {number} n
   * @param {number} min
   * @param {number} max
   */
  boostSimilar(n, min, max) {
    this.getSimilar(n, min, max, 4).forEach(sim => {
      const d = this._get(sim);
      d.weight = Math.min(d.weight * 1.4, 8.0);
    });
    this._save();
  }

  /**
   * Get session-independent stats for the active range.
   * @param {number} min
   * @param {number} max
   * @returns {{ attempts: number, correct: number, hardest: Array }}
   */
  getStats(min, max) {
    let attempts = 0, correct = 0;
    const hardest = [];

    for (let i = min; i <= max; i++) {
      const d = this._get(i);
      attempts += d.attempts;
      correct  += d.correct;
      if (d.attempts > 0 && d.weight > 1.5) {
        hardest.push({ n: i, weight: d.weight, attempts: d.attempts, correct: d.correct });
      }
    }

    hardest.sort((a, b) => b.weight - a.weight);
    return { attempts, correct, hardest: hardest.slice(0, 10) };
  }

  /**
   * Wipe all data for numbers in [min, max].
   */
  reset(min, max) {
    for (let i = min; i <= max; i++) delete this.data[i];
    this._save();
  }
}
