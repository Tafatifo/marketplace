import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsForms } from "@/components/settings/settings-forms";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { requireLearner } from "@/server/learner";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireLearner("/settings");
  const [recordings, conversations] = await Promise.all([
    db.speakingAttempt.count({ where: { userId: ctx.user.id, audioKey: { not: null } } }),
    db.conversation.count({ where: { userId: ctx.user.id } }),
  ]);
  const p = ctx.prefs;
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" />
      <div className="max-w-3xl">
        <SettingsForms
          data={{
            name: ctx.user.name,
            email: ctx.user.email,
            nativeLanguage: p.nativeLanguage,
            explainInNative: p.explainInNative,
            correctionMode: p.correctionMode,
            dailyGoalMinutes: p.dailyGoalMinutes,
            focusAreas: p.focusAreas,
            timezone: p.timezone,
            retainRecordings: p.retainRecordings,
            recordingRetentionDays: p.recordingRetentionDays,
            maxRetentionDays: env().RECORDING_RETENTION_DAYS || 365,
            recordingsStored: recordings,
            conversations,
          }}
        />
      </div>
    </>
  );
}
