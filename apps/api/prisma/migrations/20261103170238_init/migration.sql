-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('NOVICE', 'CRAFTSPERSON', 'CREATIVE', 'PROFESSIONAL', 'MENTOR', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('BASIC', 'STRUCTURE', 'STYLE', 'ADVANCED', 'IDEA', 'CONSTRAINT', 'HABIT', 'SCENE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DraftSaveTrigger" AS ENUM ('AUTO', 'MANUAL', 'SUBMIT');

-- CreateEnum
CREATE TYPE "BankType" AS ENUM ('CHARACTER', 'PLACE', 'OPENING_LINE', 'STYLE_PARAGRAPH', 'REFERENCE_STORY', 'NEWS', 'IMAGE', 'OBJECT', 'EMOTION', 'WHAT_IF', 'STRUCTURE_PHRASE', 'WORD', 'CUTUP_TEXT', 'AMBIENT_AUDIO', 'STRUCTURE_TEMPLATE', 'DICTIONARY');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BadgeFamily" AS ENUM ('STREAK', 'MILESTONE', 'SKILL', 'EXPLORATION', 'QUALITY', 'COMMUNITY', 'HIDDEN');

-- CreateEnum
CREATE TYPE "BadgeTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'SPECIAL');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('A_AUTOMATIC', 'B_SAMPLED', 'C_MENTOR', 'D_PEER', 'E_EDITOR', 'F_MANUAL');

-- CreateEnum
CREATE TYPE "StreakDayStatus" AS ENUM ('ACTIVE', 'FREEZE', 'REST', 'MISSED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('PASTE_ABUSE', 'TYPING_SPEED', 'VOCABULARY_LOW', 'LANGUAGE_MISMATCH', 'SIMILARITY_BANK', 'SELF_REPEAT', 'SUSPICIOUS_TIME', 'VOTE_MANIPULATION', 'VOLUME_SPIKE');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IntegrityCheckType" AS ENUM ('PASTE', 'TYPING_SPEED', 'VOCABULARY', 'LANGUAGE', 'SIMILARITY_BANK', 'SELF_REPEAT', 'ACTIVE_TIME');

-- CreateEnum
CREATE TYPE "IntegrityResult" AS ENUM ('PASSED', 'WARNING', 'FLAGGED');

-- CreateEnum
CREATE TYPE "SeriesType" AS ENUM ('SENSES', 'PERSPECTIVE', 'MORNING_PAGES', 'WORD_GOAL');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SelectionAlgorithm" AS ENUM ('SHUFFLE_BAG', 'WEIGHTED_RANDOM', 'CONDITIONAL', 'PURE_RANDOM', 'STRATIFIED', 'RECOMMENDATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'NOVICE',
    "level" INTEGER NOT NULL DEFAULT 1,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_types" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" "ExerciseCategory" NOT NULL,
    "access_level" "UserRole" NOT NULL DEFAULT 'NOVICE',
    "description" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "word_target_min" INTEGER NOT NULL,
    "word_target_max" INTEGER NOT NULL,
    "bank_source_type" "BankType",
    "rubric_json" JSONB NOT NULL DEFAULT '{}',
    "skill_weights_json" JSONB NOT NULL DEFAULT '{}',
    "base_xp" INTEGER NOT NULL DEFAULT 30,
    "difficulty_base" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "icon_asset" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "exercise_type_id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "source_item_id" UUID,
    "source_item_type" "BankType",
    "prompt_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "reroll_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_text" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "version_number" INTEGER NOT NULL,
    "save_trigger" "DraftSaveTrigger" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "final_draft_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "word_count" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "constraint_check_json" JSONB NOT NULL DEFAULT '{}',
    "integrity_result" "IntegrityResult" NOT NULL DEFAULT 'PASSED',
    "xp_awarded" INTEGER NOT NULL DEFAULT 0,
    "xp_pending" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_type" VARCHAR(50),
    "session_id" UUID,
    "event_name" VARCHAR(100) NOT NULL,
    "event_payload_json" JSONB NOT NULL DEFAULT '{}',
    "client_timestamp" TIMESTAMP(3),
    "server_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" VARCHAR(64),
    "user_agent_hash" VARCHAR(64),

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "gender" VARCHAR(20),
    "age_range" VARCHAR(20),
    "temperament" VARCHAR(50),
    "tone" VARCHAR(50),
    "background" TEXT,
    "occupation" VARCHAR(100),
    "social_class" VARCHAR(50),
    "historical_era" VARCHAR(50),
    "region" VARCHAR(100),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'system',
    "created_by_user_id" UUID,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "global_uses" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_usages" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "cycle_id" UUID,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "suggested_senses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_lines" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "genre" VARCHAR(50),
    "mood" VARCHAR(50),
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "opening_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_paragraphs" (
    "id" UUID NOT NULL,
    "original_text" TEXT NOT NULL,
    "translation" TEXT,
    "author" VARCHAR(100),
    "work" VARCHAR(200),
    "translator" VARCHAR(100),
    "year" INTEGER,
    "language" VARCHAR(10) NOT NULL DEFAULT 'fa',
    "style_feature" TEXT,
    "copyright_status" TEXT NOT NULL DEFAULT 'public_domain',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "style_paragraphs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_stories" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "text" TEXT NOT NULL,
    "author" VARCHAR(100),
    "translator" VARCHAR(100),
    "year" INTEGER,
    "length" INTEGER NOT NULL,
    "genre" VARCHAR(50),
    "copyright_status" TEXT NOT NULL DEFAULT 'public_domain',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reference_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "summary" TEXT NOT NULL,
    "source_name" VARCHAR(100) NOT NULL,
    "source_url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" VARCHAR(50) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_assets" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "description" TEXT,
    "photographer" VARCHAR(200),
    "license" VARCHAR(50) NOT NULL,
    "license_url" TEXT,
    "source" VARCHAR(100) NOT NULL,
    "topic" VARCHAR(100),
    "mood" VARCHAR(50),
    "category" VARCHAR(50),
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "object_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emotion_lexicon" (
    "id" UUID NOT NULL,
    "word" VARCHAR(100) NOT NULL,
    "emotion" VARCHAR(50) NOT NULL,
    "intensity" INTEGER NOT NULL DEFAULT 3,
    "show_sample" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "emotion_lexicon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "what_if_questions" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "target" VARCHAR(50) NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "what_if_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_phrases" (
    "id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "stage" VARCHAR(50) NOT NULL,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "structure_phrases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" UUID NOT NULL,
    "text" VARCHAR(100) NOT NULL,
    "pos" VARCHAR(20),
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "semantic_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_concrete" BOOLEAN NOT NULL DEFAULT false,
    "embedding" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutup_texts" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "source" VARCHAR(100),
    "length" INTEGER NOT NULL,
    "text_type" VARCHAR(50) NOT NULL,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cutup_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambient_audios" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_url" TEXT NOT NULL,
    "license" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ambient_audios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "steps" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "example" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "structure_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cycles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_type" "BankType" NOT NULL,
    "cycle_no" INTEGER NOT NULL,
    "item_ids_json" JSONB NOT NULL,
    "used_item_ids_json" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "bank_type" "BankType" NOT NULL,
    "item_id" UUID NOT NULL,
    "algorithm" "SelectionAlgorithm" NOT NULL,
    "cycle_id" UUID,
    "cycle_position" VARCHAR(20),
    "weights_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "filters_json" JSONB NOT NULL DEFAULT '[]',
    "alternatives_count" INTEGER NOT NULL,
    "seed" VARCHAR(100),
    "reroll_no" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_series" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "series_type" "SeriesType" NOT NULL,
    "context_id" UUID,
    "remaining_json" JSONB NOT NULL DEFAULT '[]',
    "done_json" JSONB NOT NULL DEFAULT '[]',
    "status" "SeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID,
    "base" INTEGER NOT NULL,
    "multipliers_json" JSONB NOT NULL DEFAULT '{}',
    "final_xp" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" UUID NOT NULL,
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "role_rank" "UserRole" NOT NULL DEFAULT 'NOVICE',
    "words_total" INTEGER NOT NULL DEFAULT 0,
    "active_days" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "freezes_remaining" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE,
    "sessions_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_key" VARCHAR(50) NOT NULL,
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sessions_count" INTEGER NOT NULL DEFAULT 0,
    "mentor_positive_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "StreakDayStatus" NOT NULL,
    "reason" VARCHAR(100),

    CONSTRAINT "streak_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "family" "BadgeFamily" NOT NULL,
    "tier" "BadgeTier" NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "description_fa" TEXT NOT NULL,
    "icon_asset" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_rules" (
    "id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "trigger_event" VARCHAR(100) NOT NULL,
    "condition_dsl_json" JSONB NOT NULL,
    "verification_query_json" JSONB,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "verification_level" "VerificationLevel" NOT NULL DEFAULT 'A_AUTOMATIC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "badge_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_awards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "tier" "BadgeTier" NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger_event_id" UUID,
    "context_json" JSONB NOT NULL DEFAULT '{}',
    "narrative_fa" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by" VARCHAR(50),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "badge_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "condition_json" JSONB NOT NULL,
    "reward_xp" INTEGER NOT NULL DEFAULT 0,
    "reward_ink" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_quests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quest_id" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3),
    "date_key" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "description_fa" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "bonus_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "special_badge_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_participations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "sessions_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "awarded_badge_id" UUID,

    CONSTRAINT "challenge_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ink_wallets" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ink_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ink_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ink_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "price_ink" INTEGER NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_checks" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "check_type" "IntegrityCheckType" NOT NULL,
    "result" "IntegrityResult" NOT NULL,
    "details_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_flags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "anomaly_type" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_queue" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "exercise_type_id" UUID NOT NULL,
    "reason_json" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "served_at" TIMESTAMP(3),

    CONSTRAINT "recommendation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "body_fa" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_types_slug_key" ON "exercise_types"("slug");

-- CreateIndex
CREATE INDEX "exercise_types_category_is_active_idx" ON "exercise_types"("category", "is_active");

-- CreateIndex
CREATE INDEX "exercise_types_access_level_idx" ON "exercise_types"("access_level");

-- CreateIndex
CREATE INDEX "exercise_sessions_user_id_status_idx" ON "exercise_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "exercise_sessions_exercise_type_id_idx" ON "exercise_sessions"("exercise_type_id");

-- CreateIndex
CREATE INDEX "exercise_sessions_started_at_idx" ON "exercise_sessions"("started_at");

-- CreateIndex
CREATE INDEX "drafts_user_id_created_at_idx" ON "drafts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "drafts_session_id_version_number_key" ON "drafts"("session_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_session_id_key" ON "submissions"("session_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_submitted_at_idx" ON "submissions"("user_id", "submitted_at");

-- CreateIndex
CREATE INDEX "submissions_integrity_result_idx" ON "submissions"("integrity_result");

-- CreateIndex
CREATE INDEX "event_logs_user_id_server_timestamp_idx" ON "event_logs"("user_id", "server_timestamp");

-- CreateIndex
CREATE INDEX "event_logs_event_name_server_timestamp_idx" ON "event_logs"("event_name", "server_timestamp");

-- CreateIndex
CREATE INDEX "event_logs_session_id_idx" ON "event_logs"("session_id");

-- CreateIndex
CREATE INDEX "characters_approval_status_is_active_idx" ON "characters"("approval_status", "is_active");

-- CreateIndex
CREATE INDEX "characters_gender_age_range_idx" ON "characters"("gender", "age_range");

-- CreateIndex
CREATE INDEX "character_usages_user_id_used_at_idx" ON "character_usages"("user_id", "used_at");

-- CreateIndex
CREATE INDEX "character_usages_character_id_idx" ON "character_usages"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_items_hash_key" ON "news_items"("hash");

-- CreateIndex
CREATE INDEX "news_items_status_published_at_idx" ON "news_items"("status", "published_at");

-- CreateIndex
CREATE INDEX "news_items_category_idx" ON "news_items"("category");

-- CreateIndex
CREATE INDEX "emotion_lexicon_emotion_idx" ON "emotion_lexicon"("emotion");

-- CreateIndex
CREATE UNIQUE INDEX "words_text_key" ON "words"("text");

-- CreateIndex
CREATE INDEX "words_pos_idx" ON "words"("pos");

-- CreateIndex
CREATE UNIQUE INDEX "structure_templates_slug_key" ON "structure_templates"("slug");

-- CreateIndex
CREATE INDEX "user_cycles_user_id_bank_type_is_active_idx" ON "user_cycles"("user_id", "bank_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_cycles_user_id_bank_type_cycle_no_key" ON "user_cycles"("user_id", "bank_type", "cycle_no");

-- CreateIndex
CREATE INDEX "selection_logs_user_id_bank_type_created_at_idx" ON "selection_logs"("user_id", "bank_type", "created_at");

-- CreateIndex
CREATE INDEX "exercise_series_user_id_series_type_status_idx" ON "exercise_series"("user_id", "series_type", "status");

-- CreateIndex
CREATE INDEX "xp_ledger_user_id_created_at_idx" ON "xp_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "xp_ledger_source_type_idx" ON "xp_ledger"("source_type");

-- CreateIndex
CREATE INDEX "user_skills_skill_key_idx" ON "user_skills"("skill_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_user_id_skill_key_key" ON "user_skills"("user_id", "skill_key");

-- CreateIndex
CREATE INDEX "streak_days_user_id_date_idx" ON "streak_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "streak_days_user_id_date_key" ON "streak_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- CreateIndex
CREATE INDEX "badges_family_tier_idx" ON "badges"("family", "tier");

-- CreateIndex
CREATE INDEX "badge_rules_trigger_event_is_active_idx" ON "badge_rules"("trigger_event", "is_active");

-- CreateIndex
CREATE INDEX "badge_awards_user_id_awarded_at_idx" ON "badge_awards"("user_id", "awarded_at");

-- CreateIndex
CREATE UNIQUE INDEX "badge_awards_user_id_badge_id_tier_key" ON "badge_awards"("user_id", "badge_id", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "badge_progress_user_id_badge_id_key" ON "badge_progress"("user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "quests_slug_key" ON "quests"("slug");

-- CreateIndex
CREATE INDEX "user_quests_user_id_date_key_idx" ON "user_quests"("user_id", "date_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_quests_user_id_quest_id_date_key_key" ON "user_quests"("user_id", "quest_id", "date_key");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_slug_key" ON "challenges"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participations_user_id_challenge_id_key" ON "challenge_participations"("user_id", "challenge_id");

-- CreateIndex
CREATE INDEX "ink_transactions_user_id_created_at_idx" ON "ink_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_items_slug_key" ON "shop_items"("slug");

-- CreateIndex
CREATE INDEX "integrity_checks_submission_id_idx" ON "integrity_checks"("submission_id");

-- CreateIndex
CREATE INDEX "anomaly_flags_user_id_resolved_at_idx" ON "anomaly_flags"("user_id", "resolved_at");

-- CreateIndex
CREATE INDEX "anomaly_flags_severity_resolved_at_idx" ON "anomaly_flags"("severity", "resolved_at");

-- CreateIndex
CREATE INDEX "recommendation_queue_user_id_served_at_priority_idx" ON "recommendation_queue"("user_id", "served_at", "priority");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_exercise_type_id_fkey" FOREIGN KEY ("exercise_type_id") REFERENCES "exercise_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exercise_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exercise_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exercise_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_usages" ADD CONSTRAINT "character_usages_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cycles" ADD CONSTRAINT "user_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_logs" ADD CONSTRAINT "selection_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_series" ADD CONSTRAINT "exercise_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_days" ADD CONSTRAINT "streak_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_rules" ADD CONSTRAINT "badge_rules_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participations" ADD CONSTRAINT "challenge_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participations" ADD CONSTRAINT "challenge_participations_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ink_transactions" ADD CONSTRAINT "ink_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_checks" ADD CONSTRAINT "integrity_checks_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_queue" ADD CONSTRAINT "recommendation_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_queue" ADD CONSTRAINT "recommendation_queue_exercise_type_id_fkey" FOREIGN KEY ("exercise_type_id") REFERENCES "exercise_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
