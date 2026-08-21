"use client";

import { CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

type QueueStage = 
  | "draft_submitted"
  | "quality_check"
  | "awaiting_approval"
  | "approved"
  | "sent_to_direnote"
  | "processing"
  | "delivered"
  | "completed"
  | "rejected";

interface QueueEntry {
  id: string;
  releaseId: string;
  releaseName: string;
  currentStage: QueueStage;
  submittedAt: string;
  trackCount: number;
}

const STAGE_CONFIG: Record<QueueStage, { label: string; description: string; icon: string }> = {
  draft_submitted: { label: "Submitted", description: "Your release has been submitted", icon: "submit" },
  quality_check: { label: "Quality Check", description: "We're reviewing your files and metadata", icon: "check" },
  awaiting_approval: { label: "Awaiting Approval", description: "Pending editorial review", icon: "clock" },
  approved: { label: "Approved", description: "Your release has been approved", icon: "approved" },
  sent_to_direnote: { label: "Sent to distribution", description: "Uploading to HYMN's distribution network", icon: "upload" },
  processing: { label: "Processing", description: "Being processed for store delivery", icon: "process" },
  delivered: { label: "Delivered", description: "Successfully delivered to stores", icon: "delivered" },
  completed: { label: "Completed", description: "Your release is now live", icon: "complete" },
  rejected: { label: "Rejected", description: "Your release needs revision", icon: "rejected" }
};

const STAGE_ORDER: QueueStage[] = [
  "draft_submitted",
  "quality_check",
  "awaiting_approval",
  "approved",
  "sent_to_direnote",
  "processing",
  "delivered",
  "completed"
];

export function DistributionQueueDashboard({ userId }: { userId: number }) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQueue() {
      try {
        const response = await fetch(`/api/distribution-queue?userId=${userId}`);
        if (!response.ok) throw new Error("Failed to fetch queue");
        const data = await response.json();
        setEntries(data.entries || []);
        setError(null);
      } catch (err) {
        console.error("Queue fetch error:", err);
        setError("Failed to load distribution queue");
      } finally {
        setLoading(false);
      }
    }

    fetchQueue();
  }, [userId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-300" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Loading distribution queue...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-900 dark:text-red-100">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-gray-950">
        <TrendingUp className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          No releases in the distribution queue yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <QueueEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function QueueEntryCard({ entry }: { entry: QueueEntry }) {
  const currentStageIndex = STAGE_ORDER.indexOf(entry.currentStage);
  const progress = ((currentStageIndex + 1) / STAGE_ORDER.length) * 100;

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {entry.releaseName}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {entry.trackCount} track{entry.trackCount !== 1 ? "s" : ""} • 
            Submitted {formatDate(entry.submittedAt)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {Math.round(progress)}%
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {STAGE_CONFIG[entry.currentStage].label}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage timeline */}
      <div className="mt-4 flex items-center justify-between gap-1 px-1 text-xs">
        {STAGE_ORDER.map((stage, index) => {
          const isCompleted = index <= currentStageIndex;
          const isCurrent = stage === entry.currentStage;

          return (
            <div key={stage} className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isCompleted
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {isCompleted && index < currentStageIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Clock className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </div>
              <span
                className={`mt-1 text-xs font-medium ${
                  isCompleted
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-400 dark:text-gray-600"
                }`}
              >
                {stage === "quality_check" ? "QC" : stage === "sent_to_direnote" ? "Delivery" : stage.charAt(0).toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current stage description */}
      <div className="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          {STAGE_CONFIG[entry.currentStage].label}
        </p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
          {STAGE_CONFIG[entry.currentStage].description}
        </p>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${date.toLocaleDateString()}`;
  } catch {
    return "unknown";
  }
}

// trigger vercel deploy
