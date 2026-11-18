-- AlterTable
ALTER TABLE "exercise_sessions" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "deletion_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pauses_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "writing_folders" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "writings" ADD COLUMN     "deleted_at" TIMESTAMP(3);
