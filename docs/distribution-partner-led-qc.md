# Partner-led detailed QC

From automatic QC policy 4, HYMN does not require a separate manual rights
approval solely because a submitted release is licensed, AI generated, or a cover.
Required declarations, conditional proof links, artist verification, payment,
metadata, protected media integrity, and safe delivery state are still checked.
The distribution partner decides substantive copyright and licence acceptance.
Passing HYMN technical QC does not mean copyright approval or store availability.

Submitted responses to rights/licence corrections can proceed to technical QC
and corrected delivery. Older `rights_review` and `missing_baseline` holds are
revisited by the existing bounded automation scheduler after the policy change.
Actual identity changes, critical/manual holds, fraud alerts and uncertain
earlier writes retain their existing handling. No draft or unanswered correction
is submitted automatically.

An undelivered submitted correction whose requested date no longer meets the
partner's two-day lead time moves to the earliest valid date. The old/new dates
are recorded in the audit log and QC fixes. Live releases, drafts, and valid
future dates are not rescheduled. A cached QC result cannot hide an expired date.

Busy submission locks and status-refresh leases return pending with a short
retry delay. An earlier accepted attempt can no longer be reported as acceptance
of an approval that was never processed. Current correction review tasks close
through the normal recorded approval/delivery transition.

Validation uses isolated policy, protected-file automation and mocked-provider
lifecycle tests. No test sends a production release or customer email.
