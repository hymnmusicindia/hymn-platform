import { z } from 'zod';
import { requireRecentAdminPermission } from '@/lib/access';
import { isAdminAuthority } from '@/lib/admin-role-policy';
import { isSameAppOrigin } from '@/lib/request-origin';
import { changeStaffTeamAccess } from '@/lib/staff-team-access';
const schema = z.object({ memberId: z.string().min(1).max(80), roleId: z.string().min(1).max(80), status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']), expectedRoleId: z.string().min(1).max(80), expectedStatus: z.string().min(1).max(30), reason: z.string().trim().min(5).max(1000) });
export async function PUT(request: Request) {
  if (!isSameAppOrigin(request)) return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
  const admin = await requireRecentAdminPermission('system.manage'); if ('error' in admin) return admin.error;
  if (!isAdminAuthority(admin.adminRole) || !('sub' in admin)) return Response.json({ error: 'Founder or super-administrator identity required.' }, { status: 403 });
  try { return Response.json(await changeStaffTeamAccess(Number(admin.sub), schema.parse(await request.json()))); } catch (error) { return Response.json({ error: error instanceof z.ZodError ? 'Supply a valid member, role, status and reason.' : error instanceof Error ? error.message : 'Team access update failed.' }, { status: 409 }); }
}
