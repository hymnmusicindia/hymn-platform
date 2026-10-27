"use client";
import { useOperationProgress } from "./use-operation-progress";
export function OperationProgressLabel({active, measured, complete, label = "Uploading"}: {active: boolean; measured?: number; complete?: boolean; label?: string}) {
  const feedback = useOperationProgress(active, measured, complete);
  return <span role="status">{feedback.indeterminate ? "Initialising... Still waiting for confirmation." : `${label} ${feedback.value}%`}</span>;
}
