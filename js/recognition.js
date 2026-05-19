'use strict';

/**
 * SpeechChecker — wraps the Web Speech API for French number recognition.
 *
 * Permission strategy:
 *   Call primePermission() once (on first mic click). This opens a
 *   getUserMedia stream and keeps it alive for the session, so the
 *   browser only shows the permission dialog once. releaseStream()
 *   closes it when the user switches away from speech mode.
 *
 * Replay:
 *   listen() simultaneously runs MediaRecorder on the live stream.
 *   The recording is stored as a blob URL in _lastRecordingUrl and
 *   accessible via getLastRecordingUrl().
 *
 * Matching:
 *   check(transcripts, expected) uses Levenshtein on normalised strings.
 *   Threshold: similarity ≥ 0.80 → correct.
 */
class SpeechChecker {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = typeof SR !== 'undefined';
    if (this.supported) this._SR = SR;
    this._lastRecordingUrl = null;
    this._active           = null;
  }

  /**
   * Start a single-shot recognition session.
   * Simultaneously records via MediaRecorder for replay (desktop only;
   * skipped on Android where getUserMedia conflicts with SpeechRecognition).
   * @returns {Promise<string[]>} Transcript alternatives (lowercase).
   */
  listen() {
    return new Promise((resolve, reject) => {
      if (!this.supported) { reject(new Error('not_supported')); return; }

      // MediaRecorder (replay) — skipped on Android: concurrent getUserMedia
      // stream causes SpeechRecognition to receive no audio on Android Chrome.
      const isAndroid = /Android/i.test(navigator.userAgent);
      const chunks    = [];
      let recorder    = null;
      let recStream   = null;

      const stopRecStream = () => {
        if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
      };

      const finalizeRecording = (callback) => {
        if (recorder && recorder.state === 'recording') {
          recorder.onstop = () => {
            if (this._lastRecordingUrl) URL.revokeObjectURL(this._lastRecordingUrl);
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            this._lastRecordingUrl = URL.createObjectURL(blob);
            stopRecStream();
            callback();
          };
          recorder.stop();
        } else {
          stopRecStream();
          callback();
        }
      };

      const rec = new this._SR();
      rec.lang            = 'fr-FR';
      rec.continuous      = false;
      rec.interimResults  = true;   // capture interim results for short words
      rec.maxAlternatives = 5;

      let settled     = false;
      let interimAlts = [];         // last seen interim alternatives
      let retried     = false;      // allow one silent retry for very short words

      const settle = (fn, val) => {
        if (!settled) { settled = true; finalizeRecording(() => fn(val)); }
      };

      // Shared handlers — reused on the retry instance.
      const onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const alts = Array.from(result)
          .map(r => r.transcript.toLowerCase().trim())
          .filter(s => s.length > 0);   // ignore empty strings
        if (result.isFinal) {
          settle(resolve, alts);
        } else if (alts.length > 0) {
          interimAlts = alts;
        }
      };

      const onerror = (event) => {
        // no-speech with cached interims → use them.
        // no-speech without interims → let onend decide (may retry).
        if (event.error === 'no-speech' && interimAlts.length > 0) {
          settle(resolve, interimAlts);
        } else if (event.error !== 'no-speech') {
          settle(reject, new Error(event.error));
        }
      };

      rec.onresult = onresult;
      rec.onerror  = onerror;
      rec.onend = () => {
        if (settled) return;
        if (interimAlts.length > 0) { settle(resolve, interimAlts); return; }
        if (!retried) {
          // First attempt produced nothing (common for very short words like "deux").
          // Restart recognition once, silently — the mic indicator stays on screen.
          retried = true;
          interimAlts = [];
          const rec2 = new this._SR();
          rec2.lang            = 'fr-FR';
          rec2.continuous      = false;
          rec2.interimResults  = true;
          rec2.maxAlternatives = 5;
          rec2.onresult = onresult;
          rec2.onerror  = onerror;
          rec2.onend = () => {
            if (settled) return;
            if (interimAlts.length > 0) { settle(resolve, interimAlts); }
            else                        { settle(reject,  new Error('no_speech')); }
          };
          try { rec2.start(); this._active = rec2; } catch (e) { settle(reject, new Error('no_speech')); }
        } else {
          settle(reject, new Error('no_speech'));
        }
      };

      const startRecognition = () => {
        try { rec.start(); this._active = rec; } catch (e) { settle(reject, e); }
      };

      // Desktop: open a fresh per-call stream for MediaRecorder, then start recognition.
      // Android: recognition only (no concurrent getUserMedia).
      if (!isAndroid && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            recStream = stream;
            try {
              recorder = new MediaRecorder(stream);
              recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
              recorder.start();
            } catch (_) { recorder = null; }
            startRecognition();
          })
          .catch(() => startRecognition());
      } else {
        startRecognition();
      }
    });
  }

  /** URL of the last recording blob (set after listen() settles), or null. */
  getLastRecordingUrl() { return this._lastRecordingUrl; }

  /** Abort an ongoing listen(). */
  abort() {
    if (this._active) {
      try { this._active.abort(); } catch (_) {}
      this._active = null;
    }
  }

  // ── matching ──────────────────────────────────────────────────────────────

  /**
   * Normalise a French phrase for comparison:
   * lowercase, hyphens → spaces, "une" → "un", collapse whitespace.
   */
  _normalize(s) {
    return s
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/\bune\b/g, 'un')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Memory-efficient Levenshtein distance. */
  _levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    const curr = new Array(n + 1);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
      for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return prev[n];
  }

  /**
   * Check whether any of the recognition alternatives match the expected word.
   *
   * The Web Speech API often returns digits instead of words for numbers
   * (e.g. "1-7" for 17, "108" for 108). We handle this by:
   *   1. Stripping non-digit chars from the transcript and parsing as integer.
   *   2. Converting that integer to toFrenchBelgian(n).
   *   3. If it matches expected → correct (similarity 1.0).
   *   4. Fallback: standard Levenshtein on the raw transcript.
   *
   * @param {string[]} transcripts  Alternatives returned by listen().
   * @param {string}   expected     Output of toFrenchBelgian(n).
   * @returns {{ ok: boolean, similarity: number, best: string }}
   */
  check(transcripts, expected) {
    const normExpected = this._normalize(expected);
    let bestSimilarity = 0;
    let bestTranscript = '';

    for (const t of transcripts) {
      // ── Strategy 1: digit → toFrenchBelgian ──────────────────────────
      // Handles "1-7"→17, "7-8"→78, "108"→108, "1 7"→17, etc.
      const digits = t.replace(/\D/g, '');
      if (digits.length >= 1 && digits.length <= 4) {
        const n = parseInt(digits, 10);
        if (n >= 1 && n <= 1000 && typeof toFrenchBelgian === 'function') {
          const asWords = this._normalize(toFrenchBelgian(n));
          if (asWords === normExpected) {
            return { ok: true, similarity: 1.0, best: `${t} (=${toFrenchBelgian(n)})` };
          }
        }
      }

      // ── Strategy 2: Levenshtein on normalised string ──────────────────
      const normT  = this._normalize(t);
      const maxLen = Math.max(normT.length, normExpected.length);
      if (maxLen === 0) continue;
      const similarity = 1 - this._levenshtein(normT, normExpected) / maxLen;
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestTranscript = t;
      }
    }

    return { ok: bestSimilarity >= 0.80, similarity: bestSimilarity, best: bestTranscript };
  }

  // ── TTS ───────────────────────────────────────────────────────────────────

  /**
   * Speak text aloud using the browser's SpeechSynthesis API (fr-FR voice).
   * @param {string} text
   */
  speak(text, rate = 0.75) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'fr-FR';
    utt.rate = rate;
    window.speechSynthesis.speak(utt);
  }
}
