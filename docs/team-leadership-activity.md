# Leadership updates

Workspace owners open **Team OS → Leadership → Leadership updates** or use the
shortcut on the Team OS home page. The bottom Assistance button includes a
“Review team updates” guide.

## Access and attribution

The authenticated Team API requires an active workspace membership. The
`leadership-activity` reader additionally requires `role.owner`; a display name,
platform-admin role or `audit.view` alone does not grant access. Every lookup and
record link stays within the selected workspace.

The timeline reads existing immutable TeamAudit events. It resolves the acting
member separately from the current contact/task owner. Automated routing is
labelled as automated; its initiating account is not presented as the assigned
caller. Private chat/channel events and routine coordinator sync ticks are
excluded. Raw audit JSON, credentials and private contact notes are not returned.

New contact creation through lead syncing and registered-account selection now
records the actual initiating member. Task comments also produce an audit event.
Contact edits record the changed field names, without copying private note values.
Call reports retain a contact-name snapshot, and legacy callback updates now save
their discussion and contact reference in their audit event.

Historical events appear when an audit record exists. A current assignee is never
invented as the creator of an older unaudited contact.

## Reading the view

- Filter by member, activity type and period (IST), including all recorded history.
- Expand a call report to read its actual call time, discussion, needs, agreements
  and next action. Timeline ordering and metrics use the report's save time.
- Open the corresponding contact or task. Merged contacts resolve to the retained
  card, preserving access to reports on the original card.
- Metrics count recorded activities, not unique calls or employee performance.
- Pages use a fixed snapshot and `(createdAt, id)` cursor, fetching 30 visible
  events at a time. New records do not move an already loaded timeline.
- A lightweight newest-event check runs every 30 seconds while the page is
  visible. New activity prompts a refresh; failed checks preserve loaded data.

The view performs no business mutations and adds no email notifications.

## Design references

- [Atlassian: Manage activity on your dashboard](https://support.atlassian.com/analytics/docs/manage-activity-on-your-dashboard/)
  describes a permission-controlled record showing who changed what and when.
- [Plane: Project overview](https://docs.plane.so/core-concepts/projects/project-overview)
  places work-item and state changes in a project activity feed.

## Verification

`npm run test:team-leadership` uses disposable PostgreSQL to exercise both owners,
non-owner denial, attribution, contact identity, merged-record links, filtering,
stable pagination, private-data exclusion and existing call-report behavior.

`npm run test:team-leadership:browser` checks report expansion, source links,
filters, pagination and refresh recovery at 1440px, 390px and 320px.
The Team activity and call reports GitHub workflow runs these regressions.
