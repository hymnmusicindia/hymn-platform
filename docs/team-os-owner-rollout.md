# Authorised Team OS owners

The user explicitly requested full Team OS Owner title and permissions for both verified existing accounts:

- `hymnmusicindia@gmail.com` (account 27)
- `adityaujjain01@gmail.com` (account 18)

Both accounts were verified ACTIVE using a read-only production lookup. The malformed earlier email was clarified in the conversation. This request does not grant application-wide ADMIN privileges, banking access, or permission to execute payments.

The unique owner-role index limits each workspace to one role definition, not one membership. Multiple memberships may safely share that protected role. Ordinary member-management and invitation endpoints cannot grant or revoke this role.

After the Team OS migrations and founder bootstrap, run the explicit operator grant with the production database supplied securely through the environment:

```powershell
node --import tsx scripts/grant-team-owners.ts --emails hymnmusicindia@gmail.com,adityaujjain01@gmail.com
node --import tsx scripts/grant-team-owners.ts --emails hymnmusicindia@gmail.com,adityaujjain01@gmail.com --apply
```

The first command previews existing identities. The second locks the workspace, rechecks active account identities, grants both memberships the protected owner role, and appends immutable audit records. It is idempotent and does not create accounts or modify User roles. It refuses ambiguous workspaces or account matches. Do not substitute name matching for verified email identity.

On 16 October 2026, both additive Team OS migrations were applied successfully to the canonical production database. Both verified accounts now have ACTIVE Owner memberships, confirmed through the application's runtime database connection. Application account roles were not changed. The frontend/API release must still be deployed before claiming the workspace is reachable on the website.
