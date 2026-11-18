import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// DECISION: pg-boss uses `export =` (CommonJS). A plain `import PgBoss from`
// only works at runtime when esModuleInterop is on, but this project's tsconfig
// leaves esModuleInterop off — so ts-jest emits a raw require and reads
// `.default` (undefined), giving `pg_boss_1.default is not a constructor`.
// `import = require(...)` binds to the module's real export, so the runtime
// shape matches in both the tsc build and ts-jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PgBoss = require('pg-boss');

/**
 * Thin wrapper over pg-boss (spec E.8). Runs on the same Postgres as the app
 * (no Redis, no MinIO). Workers are registered after bootstrap in main.ts.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss: InstanceType<typeof PgBoss> | null = null;
  private started = false;
  private workers: Map<string, (data: Record<string, unknown>) => Promise<void>> =
    new Map();

  constructor(config: ConfigService) {
    // DECISION: read DATABASE_URL via ConfigService (not process.env) so
    // tests can inject a mock without depending on the real env var.
    const dbUrl = config.get<string>('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    this.boss = new PgBoss({
      connectionString: dbUrl,
      schema: 'pgboss',
    });
    this.boss.on('error', (err) => {
      this.logger.warn(`pg-boss error (queue degraded): ${err}`);
    });
  }

  async onModuleInit(): Promise<void> {
    // DECISION: pg-boss is a **dev convenience**, not a critical dependency.
    // On Windows + localhost it sometimes fails to become ready (known issue
    // with v10 + Postgres 15 in some network configurations). Instead of
    // blocking boot, we try to start it with a 5-second timeout; if it
    // doesn't become ready, we fall back to a no-op in-memory queue so the
    // rest of the app can still run. Workers registered during boot are
    // stored and replayed when (if) pg-boss ever comes up.
    if (!this.started && this.boss) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('pg-boss start timeout')), 5000),
      );
      try {
        await Promise.race([this.boss.start(), timeout]);
        this.started = true;
        this.logger.log('pg-boss ready');
        // Replay any workers registered before boot completed.
        for (const [name, handler] of this.workers.entries()) {
          await this.boss.work(name, async (jobs) => {
            const list = Array.isArray(jobs) ? jobs : [jobs];
            for (const j of list) {
              await handler(
                (j as { data?: unknown }).data as Record<string, unknown>,
              );
            }
          });
        }
        this.workers.clear();
      } catch (err) {
        this.logger.warn(
          `pg-boss failed to start (${(err as Error).message}); queue degraded to no-op. ` +
          `API will continue; background jobs (badge evaluation) will NOT run.`,
        );
        this.boss = null;
      }
    }
  }

  /** Enqueue a job with the spec's retry policy (3 retries, backoff). */
  async enqueue(name: string, data: Record<string, unknown>): Promise<string> {
    if (!this.boss || !this.started) {
      this.logger.warn(`queue enqueue skipped (pg-boss down): ${name}`);
      return 'skipped';
    }
    const id = await this.boss.send(name, data, {
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
    });
    return String(id);
  }

  /** Register a worker handler for a named queue. */
  async registerWorker(
    name: string,
    handler: (data: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (this.boss && this.started) {
      // DECISION: pg-boss v10's work() callback is delivered with a Job[]
      // (batch). We process the first job in the batch; the default batchSize
      // is 1, so this is effectively single-job semantics.
      await this.boss.work(name, async (jobs) => {
        const list = Array.isArray(jobs) ? jobs : [jobs];
        for (const j of list) {
          await handler(
            (j as { data?: unknown }).data as Record<string, unknown>,
          );
        }
      });
    } else {
      // pg-boss not ready yet — store for replay in onModuleInit.
      this.workers.set(name, handler);
      this.logger.warn(`worker registered (pending pg-boss): ${name}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started && this.boss) {
      await this.boss.stop();
      this.started = false;
    }
  }
}
