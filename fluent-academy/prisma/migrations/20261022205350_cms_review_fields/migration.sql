-- AlterTable
ALTER TABLE "AudioAsset" ADD COLUMN     "humanNote" TEXT,
ADD COLUMN     "humanVerdict" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LessonRevision" ADD COLUMN     "sourceHash" TEXT;
