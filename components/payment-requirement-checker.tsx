"use client";

import { AlertCircle, CheckCircle2, CreditCard, Zap } from "lucide-react";
import { useEffect, useState } from "react";

type PaymentRequirementStatus = "loading" | "ready" | "error";

interface PaymentRequirement {
  requiresPayment: boolean;
  canSubmitWithoutPayment: boolean;
  reason: string;
  plan?: string;
  daysRemaining?: number;
  artistLimit?: number;
}

export function PaymentRequirementChecker({
  userId,
  selectedPlan,
  onRequirementChange
}: {
  userId: number;
  selectedPlan: string;
  onRequirementChange: (requires: boolean) => void;
}) {
  const [status, setStatus] = useState<PaymentRequirementStatus>("loading");
  const [requirement, setRequirement] = useState<PaymentRequirement | null>(null);

  useEffect(() => {
    async function checkRequirement() {
      try {
        setStatus("loading");
        const response = await fetch(
          `/api/releases/check-payment-requirement?userId=${userId}&plan=${selectedPlan}`
        );

        if (!response.ok) throw new Error("Failed to check payment requirement");

        const data = await response.json();
        setRequirement(data);
        onRequirementChange(data.requiresPayment);
        setStatus("ready");
      } catch (error) {
        console.error("Error checking payment requirement:", error);
        setStatus("error");
      }
    }

    checkRequirement();
  }, [userId, selectedPlan, onRequirementChange]);

  if (status === "loading") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-300" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Checking your subscription status...</span>
        </div>
      </div>
    );
  }

  if (status === "error" || !requirement) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-medium text-red-900 dark:text-red-100">
              Unable to verify payment requirement
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              Please try again or contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (requirement.canSubmitWithoutPayment) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">
              ✨ No payment required
            </p>
            <p className="mt-1 text-sm text-green-700 dark:text-green-300">
              {requirement.reason}
            </p>
            {requirement.daysRemaining !== undefined && (
              <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Zap className="h-3 w-3" />
                {requirement.daysRemaining} days remaining • Limit: {requirement.artistLimit} artists
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-950/20">
      <div className="flex items-start gap-3">
        <CreditCard className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div>
          <p className="font-semibold text-yellow-900 dark:text-yellow-100">
            Payment required
          </p>
          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
            {requirement.reason}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SubmissionStatusBanner({
  requiresPayment,
  selectedPlan
}: {
  requiresPayment: boolean;
  selectedPlan: string;
}) {
  const isOneTime = selectedPlan === "one_time" || selectedPlan === "one_time";

  if (!requiresPayment && !isOneTime) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm dark:bg-green-950/30">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-green-700 dark:text-green-300">
          You'll proceed directly to submission—no payment needed.
        </span>
      </div>
    );
  }

  if (requiresPayment) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm dark:bg-blue-950/30">
        <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-blue-700 dark:text-blue-300">
          {isOneTime 
            ? "You'll proceed to payment after review." 
            : "Payment will be collected to activate your subscription."}
        </span>
      </div>
    );
  }

  return null;
}

// trigger vercel deploy
