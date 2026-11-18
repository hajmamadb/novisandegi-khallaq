import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NlpVocabularyStats {
  uniqueWords: number;
  totalWords: number;
  uniqueRatio: number;
  knownWords: number;
  knownWordRatio: number;
}

/**
 * Thin HTTP client for the FastAPI NLP service (spec D.13).
 *
 * DECISION: the NLP venv currently has only fastapi+uvicorn (no network access
 * to install hazm/parsivar), so the NLP service is expected to be DOWN during
 * phase-1 dev. Per the golden rule, every call degrades gracefully: on any
 * error (unreachable / non-2xx / timeout) the method returns a neutral
 * fallback and the caller's check is recorded as PASSED with
 * `nlpAvailable: false` in the details. The integrity pipeline never fails
 * the submission because of NLP — a down service must not block writers.
 */
@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    // .env ships NLP_SERVICE_URL=http://localhost:8000 (spec § env block).
    this.baseUrl = (
      config.get<string>('NLP_SERVICE_URL') ?? 'http://localhost:8000'
    ).replace(/\/$/, '');
    this.timeoutMs = 60_000;
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  /**
   * GET /health — used by IntegrityService to decide whether similarity /
   * self-repeat checks (which need NLP) are runnable at all.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl + '/health', {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * POST /vocabulary-stats — unique + known-word ratios for the vocabulary
   * check (spec E.4 rule 5).
   */
  async vocabularyStats(text: string): Promise<NlpVocabularyStats | null> {
    try {
      const res = await fetch(this.baseUrl + '/vocabulary-stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(
          `NLP /vocabulary-stats responded ${res.status}; degrading to PASSED`,
        );
        return null;
      }
      const json = (await res.json()) as Record<string, unknown>;
      return {
        uniqueWords: toInt(json.uniqueWords),
        totalWords: toInt(json.totalWords),
        uniqueRatio: toNum(json.uniqueRatio),
        knownWords: toInt(json.knownWords),
        knownWordRatio: toNum(json.knownWordRatio),
      };
    } catch {
      return null;
    }
  }

  /**
   * POST /similarity — cosine similarity between two texts (spec E.4 rules 6-7).
   */
  async cosineSimilarity(a: string, b: string): Promise<number | null> {
    try {
      const res = await fetch(this.baseUrl + '/similarity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ textA: a, textB: b }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(
          `NLP /similarity responded ${res.status}; degrading to PASSED`,
        );
        return null;
      }
      const json = (await res.json()) as Record<string, unknown>;
      return toNum(json.similarity);
    } catch {
      return null;
    }
  }
}

function toNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function toInt(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? v : 0;
}
