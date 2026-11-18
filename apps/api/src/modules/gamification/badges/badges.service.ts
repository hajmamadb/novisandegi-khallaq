import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, BadgeRule, EventLog } from '@prisma/client';

// Prisma 5.14: JSON types are on the Prisma namespace (no exported `JsonValue`).
type JsonValue = Prisma.JsonValue;
import { PrismaService } from '../../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';

/**
 * Spec E.7 — BadgeRuleEngine DSL node types (stored as JSON in
 * BadgeRule.conditionDslJson).
 */
export type Condition =
  | { type: 'threshold'; field: string; gte?: number; lte?: number; eq?: unknown }
  | { type: 'distinct_count'; field: string; group_by?: string; gte: number }
  | { type: 'sum'; field: string; gte: number }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'custom'; code: string; params?: Record<string, unknown> };

/**
 * The context handed to evaluateCondition. `fields` carries the scalar
 * values the DSL references by name (e.g. `current_streak`, `sessions_count`).
 * `rows` carries the event payload rows needed by `distinct_count` / `sum`.
 */
interface RuleContext {
  userId: string;
  fields: Record<string, number>;
  rows: Array<Record<string, unknown>>;
}

/**
 * BadgeService (spec E.7 BadgeRuleEngine).
 *
 * Entry point: evaluateForEvent(eventId) — called by the `badge-evaluate`
 * pg-boss worker (main.ts). For every active BadgeRule whose triggerEvent
 * matches the event, it builds a context from the user's stats + the event
 * payload, evaluates the DSL condition, runs the optional verification
 * query, and awards the badge (idempotent via the unique
 * (userId, badgeId, tier) constraint on badge_awards).
 */
@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // -----------------------------------------------------------------------
  // Queue entry point
  // -----------------------------------------------------------------------

  /**
   * Evaluate every badge rule triggered by the given event.
   * Called by the `badge-evaluate` pg-boss worker.
   */
  async evaluateForEvent(eventId: string): Promise<void> {
    const event = await this.prisma.eventLog.findUnique({ where: { id: eventId } });
    if (!event) return; // event already processed or pruned — nothing to do

    const rules = await this.prisma.badgeRule.findMany({
      where: { triggerEvent: event.eventName, isActive: true },
      include: { badge: { select: { isActive: true, isHidden: true } } },
    });

    for (const rule of rules) {
      if (!rule.badge.isActive) continue;
      try {
        await this.evaluate(rule, event);
      } catch (err) {
        // One bad rule must not stop the others.
        this.logger.error(`badge rule ${rule.id} failed for event ${eventId}`, err as Error);
      }
    }
  }

  // -----------------------------------------------------------------------
  // E.7 evaluate()
  // -----------------------------------------------------------------------

  /**
   * Evaluate a single rule against an event (spec E.7 pseudocode).
   * Returns true if the badge was awarded.
   */
  private async evaluate(rule: BadgeRule & { badge: { isActive: boolean; isHidden: boolean } }, event: EventLog): Promise<boolean> {
    const ctx = await this.buildContext(rule, event);
    const passed = await this.evaluateCondition(rule.conditionDslJson as JsonValue, ctx);

    if (!passed) {
      await this.updateProgress(rule, ctx);
      return false;
    }

    if (rule.verificationLevel === 'A_AUTOMATIC' && rule.verificationQueryJson) {
      const verified = await this.runVerificationQuery(rule, event.userId);
      if (!verified) {
        await this.events.logRaw(event.userId, 'badge_verification_failed', {
          ruleId: rule.id,
          badgeId: rule.badgeId,
        });
        return false;
      }
    }

    await this.awardBadge(rule, event);
    return true;
  }

  // -----------------------------------------------------------------------
  // buildContext
  // -----------------------------------------------------------------------

  /**
   * Build the evaluation context for a rule.
   *
   * Fields are sourced from UserStats (current_streak, sessions_count,
   * words_total) and the event payload (current_streak is overridden by
   * the payload value for streak events so the rule sees the *new* streak).
   * Rows are the event payload's `rows` array (used by distinct_count/sum).
   */
  private async buildContext(
    rule: BadgeRule,
    event: EventLog,
  ): Promise<RuleContext> {
    const stats = await this.prisma.userStats.findUnique({ where: { userId: event.userId } });
    const payload = (event.eventPayloadJson ?? {}) as Record<string, unknown>;

    const fields: Record<string, number> = {
      current_streak: (payload.currentStreak as number) ?? stats?.currentStreak ?? 0,
      best_streak: (payload.bestStreak as number) ?? stats?.bestStreak ?? 0,
      sessions_count: stats?.sessionsCount ?? 0,
      words_total: stats?.wordsTotal ?? 0,
      xp_total: stats?.xpTotal ?? 0,
      level: stats?.level ?? 1,
    };

    // For exercise_submitted events, sessions_count is the count *after*
    // this submission. The XP service has already incremented it, so the
    // stats value is correct. For streak.updated events the payload
    // carries the new currentStreak.

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Array<Record<string, unknown>>)
      : [];

    return { userId: event.userId, fields, rows };
  }

  // -----------------------------------------------------------------------
  // evaluateCondition — recursive DSL evaluator
  // -----------------------------------------------------------------------

  /**
   * Recursively evaluate a Condition DSL node against the context.
   * DECISION: `distinct_count` and `sum` operate over ctx.rows (the event
   * payload's rows array). For phase-1 rules this is sufficient because
   * the trigger event payload carries the relevant row data. If a rule
   * needs a DB-wide distinct count (e.g. eight-exercises), the context
   * builder loads that data into rows.
   */
  private async evaluateCondition(
    node: JsonValue,
    ctx: RuleContext,
  ): Promise<boolean> {
    const cond = node as unknown as Condition;

    switch (cond.type) {
      case 'threshold': {
        const value = ctx.fields[cond.field];
        if (value === undefined) return false;
        if (cond.gte !== undefined && value < cond.gte) return false;
        if (cond.lte !== undefined && value > cond.lte) return false;
        if (cond.eq !== undefined && value !== cond.eq) return false;
        return true;
      }

      case 'distinct_count': {
        // Count distinct values of `field` across ctx.rows.
        const seen = new Set<unknown>();
        for (const row of ctx.rows) {
          const v = row[cond.field];
          if (v !== undefined) seen.add(v);
        }
        // Also include the current event's row if it has the field.
        return seen.size >= cond.gte;
      }

      case 'sum': {
        let total = 0;
        for (const row of ctx.rows) {
          const v = row[cond.field];
          if (typeof v === 'number') total += v;
        }
        return total >= cond.gte;
      }

      case 'and':
        for (const child of cond.conditions) {
          if (!await this.evaluateCondition(child as JsonValue, ctx)) return false;
        }
        return true;

      case 'or':
        for (const child of cond.conditions) {
          if (await this.evaluateCondition(child as JsonValue, ctx)) return true;
        }
        return false;

      case 'custom':
        // DECISION: phase 1 has no custom code rules. Return false so the
        // rule simply never fires. A future phase can add a safe sandbox.
        this.logger.warn(`custom condition '${cond.code}' not supported in phase 1`);
        return false;

      default:
        this.logger.warn(`unknown condition type '${(cond as { type?: string }).type}'`);
        return false;
    }
  }

  // -----------------------------------------------------------------------
  // updateProgress — persist partial progress when condition not yet met
  // -----------------------------------------------------------------------

  /**
   * Update BadgeProgress for the user/badge pair so the frontend can show
   * a progress bar. Only for rules where the context has a meaningful
   * current value vs. the target.
   */
  private async updateProgress(rule: BadgeRule, ctx: RuleContext): Promise<void> {
    const cond = rule.conditionDslJson as unknown as Condition;
    let current = 0;
    let target = 0;

    if (cond.type === 'threshold') {
      current = ctx.fields[cond.field] ?? 0;
      target = cond.gte ?? 0;
    } else if (cond.type === 'distinct_count') {
      const seen = new Set<unknown>();
      for (const row of ctx.rows) {
        const v = row[cond.field];
        if (v !== undefined) seen.add(v);
      }
      current = seen.size;
      target = cond.gte;
    } else if (cond.type === 'sum') {
      for (const row of ctx.rows) {
        const v = row[cond.field];
        if (typeof v === 'number') current += v;
      }
      target = cond.gte;
    } else {
      // and/or/custom — no simple progress bar.
      return;
    }

    if (target <= 0) return;
    current = Math.min(current, target);

    await this.prisma.badgeProgress.upsert({
      where: { userId_badgeId: { userId: ctx.userId, badgeId: rule.badgeId } },
      create: { userId: ctx.userId, badgeId: rule.badgeId, current, target },
      update: { current, target },
    });
  }

  // -----------------------------------------------------------------------
  // runVerificationQuery
  // -----------------------------------------------------------------------

  /**
   * Run the rule's verification SQL query. The query uses $1 for userId
   * (parameterized — never string-concatenated). Returns true if the
   * query returns a row with count >= 1 (or any non-zero result).
   */
  private async runVerificationQuery(rule: BadgeRule, userId: string): Promise<boolean> {
    const vq = rule.verificationQueryJson as { sql?: string } | null;
    if (!vq?.sql) return true; // no SQL → treat as verified

    try {
      // DECISION: the seeded verification queries use a single $1 for
      // userId (e.g. streak-30: "SELECT COUNT(DISTINCT date) FROM
      // streak_days WHERE user_id = $1 AND ..."). We split on $1 and
      // build a Prisma.sql query with userId interpolated at that
      // position so it is bound as a Postgres parameter (never string-
      // concatenated). Phase 1 only uses $1 (userId); date params are
      // handled via CURRENT_DATE / INTERVAL in the SQL itself.
      const idx = vq.sql.indexOf('$1');

      let result: unknown;
      if (idx === -1) {
        // No $1 in the query — run as-is.
        result = await this.prisma.$queryRawUnsafe(vq.sql);
      } else {
        const before = vq.sql.slice(0, idx);
        const after = vq.sql.slice(idx + 2); // skip past "$1"
        // Prisma.sql`...${userId}...` binds userId as $1 in the final query.
        result = await this.prisma.$queryRaw(
          Prisma.sql`${Prisma.raw(before)}${userId}${Prisma.raw(after)}`,
        );
      }
      return this.interpretVerificationResult(result);
    } catch (err) {
      this.logger.error(`verification query failed for rule ${rule.id}`, err as Error);
      return false;
    }
  }

  /**
   * Interpret the raw verification query result. The seeded queries return
   * a COUNT (single row, single column). We treat any value > 0 as verified.
   */
  private interpretVerificationResult(result: unknown): boolean {
    if (!Array.isArray(result) || result.length === 0) return false;
    const row = result[0] as Record<string, unknown>;
    if (!row) return false;
    const val = Object.values(row)[0];
    const num = typeof val === 'string' ? parseInt(val, 10) : Number(val);
    return num > 0;
  }

  // -----------------------------------------------------------------------
  // awardBadge
  // -----------------------------------------------------------------------

  /**
   * Create the BadgeAward (idempotent via the unique constraint) and log
   * a badge_earned event. The narrative is auto-generated from the badge
   * title + description.
   */
  private async awardBadge(
    rule: BadgeRule & { badge: { isActive: boolean; isHidden: boolean } },
    event: EventLog,
  ): Promise<void> {
    const badge = await this.prisma.badge.findUniqueOrThrow({
      where: { id: rule.badgeId },
    });

    // Check if already awarded (idempotency).
    const existing = await this.prisma.badgeAward.findUnique({
      where: {
        userId_badgeId_tier: {
          userId: event.userId,
          badgeId: badge.id,
          tier: badge.tier,
        },
      },
    });
    if (existing) return; // already has this badge

    const narrativeFa = `تبریک! نشان «${badge.titleFa}» را دریافت کردی: ${badge.descriptionFa}`;

    await this.prisma.badgeAward.create({
      data: {
        userId: event.userId,
        badgeId: badge.id,
        tier: badge.tier,
        triggerEventId: event.id,
        contextJson: (event.eventPayloadJson ?? {}) as Prisma.InputJsonValue,
        narrativeFa,
        verifiedAt: rule.verificationLevel === 'A_AUTOMATIC' ? new Date() : null,
        verifiedBy: rule.verificationLevel === 'A_AUTOMATIC' ? 'system' : null,
      },
    });

    // Reset progress (the badge is now earned).
    await this.prisma.badgeProgress.updateMany({
      where: { userId: event.userId, badgeId: badge.id },
      data: { current: 0, target: 0 },
    });

    // Log the award event (this will enqueue another badge-evaluate job,
    // but no rules trigger on badge_earned so it's a no-op).
    await this.events.logRaw(event.userId, 'badge_earned', {
      badgeId: badge.id,
      badgeSlug: badge.slug,
      tier: badge.tier,
    });
  }

  // -----------------------------------------------------------------------
  // Public query methods (for the controller)
  // -----------------------------------------------------------------------

  /**
   * GET /gamification/badges — list all active badges for the user,
   * with the user's award status and progress.
   * Hidden badges are included but their title/description are masked
   * until earned (spec: isHidden badges show "???").
   */
  async listForUser(userId: string) {
    const [badges, awards, progress] = await Promise.all([
      this.prisma.badge.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      }),
      this.prisma.badgeAward.findMany({
        where: { userId },
        select: { badgeId: true, tier: true, awardedAt: true, narrativeFa: true, verifiedAt: true },
      }),
      this.prisma.badgeProgress.findMany({
        where: { userId },
        select: { badgeId: true, current: true, target: true },
      }),
    ]);

    const awardMap = new Map(awards.map((a) => [a.badgeId, a]));
    const progressMap = new Map(progress.map((p) => [p.badgeId, p]));

    return badges.map((b) => {
      const award = awardMap.get(b.id);
      const prog = progressMap.get(b.id);
      const earned = !!award;
      return {
        slug: b.slug,
        family: b.family,
        tier: b.tier,
        // Hidden badges show "???" until earned.
        titleFa: b.isHidden && !earned ? '???' : b.titleFa,
        descriptionFa: b.isHidden && !earned ? '...' : b.descriptionFa,
        iconAsset: b.iconAsset,
        isHidden: b.isHidden,
        earned,
        awardedAt: award?.awardedAt ?? null,
        narrativeFa: award?.narrativeFa ?? null,
        verifiedAt: award?.verifiedAt ?? null,
        progress: prog && prog.target > 0 ? { current: prog.current, target: prog.target } : null,
      };
    });
  }

  /**
   * GET /gamification/badges/:slug — single badge detail.
   */
  async getBySlug(slug: string, userId: string) {
    const badge = await this.prisma.badge.findUnique({ where: { slug } });
    if (!badge) throw new NotFoundException('BADGE_NOT_FOUND');

    const [award, prog] = await Promise.all([
      this.prisma.badgeAward.findUnique({
        where: { userId_badgeId_tier: { userId, badgeId: badge.id, tier: badge.tier } },
      }),
      this.prisma.badgeProgress.findUnique({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
      }),
    ]);

    const earned = !!award;
    return {
      id: badge.id,
      slug: badge.slug,
      family: badge.family,
      tier: badge.tier,
      titleFa: badge.isHidden && !earned ? '???' : badge.titleFa,
      descriptionFa: badge.isHidden && !earned ? '...' : badge.descriptionFa,
      iconAsset: badge.iconAsset,
      isHidden: badge.isHidden,
      earned,
      awardedAt: award?.awardedAt ?? null,
      narrativeFa: award?.narrativeFa ?? null,
      verifiedAt: award?.verifiedAt ?? null,
      progress: prog && prog.target > 0 ? { current: prog.current, target: prog.target } : null,
    };
  }

  /**
   * POST /gamification/badges/:awardId/verify — MENTOR/EDITOR manual
   * verification of a badge award. Sets verifiedAt + verifiedBy.
   */
  async verifyAward(awardId: string, verifierId: string) {
    const award = await this.prisma.badgeAward.findUnique({ where: { id: awardId } });
    if (!award) throw new NotFoundException('BADGE_AWARD_NOT_FOUND');

    const updated = await this.prisma.badgeAward.update({
      where: { id: awardId },
      data: { verifiedAt: new Date(), verifiedBy: verifierId },
    });

    await this.events.logRaw(award.userId, 'badge_verified', {
      awardId,
      verifiedBy: verifierId,
    });

    return updated;
  }
}
