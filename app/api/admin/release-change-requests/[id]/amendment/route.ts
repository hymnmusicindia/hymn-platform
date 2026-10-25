import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminPermission, requireRecentAdminPermission } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { previewSupportCorrection, submitSupportCorrection, syncSupportCorrection } from '@/lib/release-support-corrections';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('updates.review'); if ('error' in admin) return admin.error;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = z.object({ action: z.enum(['preview', 'submit', 'sync']), previewRevision: z.string().length(64).optional() }).safeParse(await request.json().catch(() => null));
  const id = Number((await context.params).id);
  if (!body.success || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Choose a correction and action.' }, { status: 400 });
  try {
    if (body.data.action === 'sync') return NextResponse.json({ request: await syncSupportCorrection(id) });
    if (body.data.action === 'submit') {
      const delivery = await requireRecentAdminPermission('distribution.submit'); if ('error' in delivery) return delivery.error;
      const result = await submitSupportCorrection(id, body.data.previewRevision || '', 'sub' in admin ? Number(admin.sub) || null : null);
      return NextResponse.json({ ...result, ...(!result.submitted ? { error: result.request.adminNote } : {}) }, { status: result.submitted ? 200 : 409 });
    }
    const data = await previewSupportCorrection(id);
    return NextResponse.json({ revision: data.revision, action: data.correction.action, payload: data.payload, file: data.file ? { filename: data.file.fileName, byteSize: data.file.bytes.length, mimeType: data.file.mimeType } : null, issues: [], locked: data.locked });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Correction could not be processed.' }, { status: 409 }); }
}
