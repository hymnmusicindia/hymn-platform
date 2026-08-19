"use client";

import { Calendar, Crown, Users, AlertCircle } from "lucide-react";
import type { Subscription } from "@/lib/types";
import { useRouter } from "next/navigation";

export function SubscriptionDashboard({ subscription }: { subscription: Subscription | null }) {
  const router = useRouter();

  if (!subscription || subscription.plan === "one_time") {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-500" />
          <div>
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">No Active Subscription</h3>
            <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
              Choose a subscription plan to unlock unlimited releases and features.
            </p>
            <button
              onClick={() => router.push("/distribution")}
              className="mt-3 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-600"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  const planNameDisplay = subscription.planName || subscription.plan.replace(/_/g, " ").toUpperCase();
  const isExpiring = subscription.daysRemaining <= 30 && subscription.daysRemaining > 0;
  const isExpired = subscription.daysRemaining === 0;

  return (
    <div className="space-y-4">
      {/* Active Subscription Card */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-900/40 dark:bg-green-950/20">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">{planNameDisplay}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isExpired ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" :
                isExpiring ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200" :
                "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
              }`}>
                {isExpired ? "EXPIRED" : isExpiring ? "EXPIRING SOON" : "ACTIVE"}
              </span>
            </div>
            <p className="mt-1 text-sm text-green-700 dark:text-green-300">
              {subscription.status === "active" ? "Your subscription is active" : "Subscription status: " + subscription.status}
            </p>
          </div>
        </div>

        {/* Subscription Details Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-white/60 p-3 dark:bg-black/20">
            <div className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">Purchased On</div>
            <div className="mt-1 font-semibold text-green-900 dark:text-green-100">
              {subscription.purchasedAt ? new Date(subscription.purchasedAt).toLocaleDateString() : "N/A"}
            </div>
          </div>

          <div className="rounded-lg bg-white/60 p-3 dark:bg-black/20">
            <div className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">Expires On</div>
            <div className="mt-1 font-semibold text-green-900 dark:text-green-100">
              {new Date(subscription.expiryDate).toLocaleDateString()}
            </div>
          </div>

          <div className="rounded-lg bg-white/60 p-3 dark:bg-black/20">
            <div className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">Days Remaining</div>
            <div className={`mt-1 font-semibold ${
              isExpired ? "text-red-600 dark:text-red-400" :
              isExpiring ? "text-yellow-600 dark:text-yellow-400" :
              "text-green-900 dark:text-green-100"
            }`}>
              {subscription.daysRemaining} days
            </div>
          </div>

          <div className="rounded-lg bg-white/60 p-3 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-700 dark:text-green-300" />
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">Artist Limit</div>
                <div className="mt-1 font-semibold text-green-900 dark:text-green-100">
                  {subscription.artistLimit} artists
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/distribution")}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
          >
            Create Release
          </button>
          {subscription.plan !== "yearly_plus" && (
            <button
              onClick={() => router.push("/distribution")}
              className="rounded-lg border border-green-600 px-4 py-2 text-sm font-medium text-green-600 transition-all hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20"
            >
              Upgrade Plan
            </button>
          )}
          <button
            onClick={() => router.push("/distribution")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900/20"
          >
            Manage Subscription
          </button>
        </div>
      </div>

      {/* Subscription Features */}
      {subscription.availableFeatures && subscription.availableFeatures.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Available Features</h3>
          <ul className="mt-3 space-y-2">
            {subscription.availableFeatures.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Renewal Info */}
      {subscription.autoRenewal && subscription.nextRenewalDate && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-start gap-2">
            <Calendar className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Auto-Renewal Enabled</p>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Your subscription will renew on {new Date(subscription.nextRenewalDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubscriptionBadge({ subscription }: { subscription: Subscription | null }) {
  if (!subscription || subscription.plan === "one_time") {
    return null;
  }

  const planNameDisplay = subscription.planName || subscription.plan.replace(/_/g, " ").toUpperCase();

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 dark:border-green-900/40 dark:bg-green-950/30">
      <Crown className="h-4 w-4 text-green-600 dark:text-green-400" />
      <span className="text-xs font-semibold text-green-700 dark:text-green-300">{planNameDisplay}</span>
    </div>
  );
}

// trigger vercel deploy
