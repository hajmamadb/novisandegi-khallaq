import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ClusterService — the candidate-web behind the force-directed word canvas
 * (spec G.10 / Phase B "خوشه‌ای + Force-Directed").
 *
 * DECISION: the endpoint is slug-only and stateless. The *hub* word is read
 * client-side from the session's promptSnapshot (bank-driven clustering
 * exercises carry it in `sourceItemTitle`; the bank-less `clustering`
 * exercise builds the hub from the writer's own first word), so the server
 * never needs the user's snapshot. It only answers: "what words surround a
 * hub for this clustering exercise, and how many distinct words does the
 * cluster need to pass?"
 *
 * Candidate scoring (spec 1.1): from `prisma.word.findMany` (active, capped
 * at 15) we rank by
 *   +2  when the candidate's `pos` matches the optional `?pos=` filter
 *   +1  when the candidate shares a `semanticTags` entry with the `?tags=`
 *       filter (comma-separated; the client passes the hub's tags)
 * The remaining candidates are left in their (frequency-ordered) position,
 * so a stable, frequency-weighted set is returned — no new randomness.
 */
export interface ClusterWord {
  text: string;
  pos?: string | null;
}

export interface ClusterPayload {
  slug: string;
  /**
   * DECISION: hub is `null` here. It is resolved client-side (see header).
   * We expose it as a field so the payload shape is explicit and future
   * bank-driven hub hints can slot in without a shape change.
   */
  hub: ClusterWord | null;
  minHubWords: number;
  candidates: ClusterWord[];
  isClustering: boolean;
}

@Injectable()
export class ClusterService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /exercises/:slug/cluster?pos=&tags= — clustering candidate web. */
  async forSlug(
    slug: string,
    opts: { pos?: string; tags?: string } = {},
  ): Promise<ClusterPayload> {
    const ex = await this.prisma.exerciseType.findUnique({ where: { slug } });
    if (!ex || !ex.isActive) {
      // Same 404 vocabulary as ExercisesService.getBySlug.
      throw new BadRequestException('EXERCISE_NOT_FOUND');
    }

    const rubric = (ex.rubricJson ?? {}) as Record<string, unknown>;
    if (rubric.check !== 'clustering') {
      throw new BadRequestException('NOT_CLUSTERING_EXERCISE');
    }
    const minHubWords = Number(rubric.minHubWords ?? 8);

    // Cap at 15 active words, most frequent first (stable base order).
    const words = await this.prisma.word.findMany({
      where: { isActive: true },
      orderBy: { frequency: 'desc' },
      take: 15,
    });

    const wantPos = opts.pos?.trim() || undefined;
    const wantTags = (opts.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tagSet = new Set(wantTags);

    const scored = words.map((w) => {
        let score = 0;
        if (wantPos && w.pos && w.pos === wantPos) score += 2;
        if (w.semanticTags?.some((t) => tagSet.has(t))) score += 1;
        return { word: w, score };
      });

    // Stable sort: score desc, then keep frequency order for ties.
    scored.sort((a, b) => b.score - a.score);

    const candidates: ClusterWord[] = scored.map((s) => ({
      text: s.word.text,
      pos: s.word.pos,
    }));

    return {
      slug,
      hub: null, // DECISION: resolved client-side from the prompt snapshot.
      minHubWords,
      candidates,
      isClustering: true,
    };
  }
}
