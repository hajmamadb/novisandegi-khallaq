-- CreateTable
CREATE TABLE "staircase_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rung_index" INTEGER NOT NULL DEFAULT 0,
    "day_hits_json" JSONB NOT NULL DEFAULT '[]',
    "status" "SeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staircase_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staircase_runs_user_id_status_idx" ON "staircase_runs"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staircase_runs_user_id_key" ON "staircase_runs"("user_id");

-- AddForeignKey
ALTER TABLE "staircase_runs" ADD CONSTRAINT "staircase_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
