import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { getIncomeHistory } from '@/lib/income-history';
import { INCOME_SOURCE_KEYS, type IncomeSourceKey } from '@/lib/income-explorer';

export async function GET(request: Request) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? '';
  const rawCursor = params.get('before');
  const before = rawCursor === null ? undefined : Number(rawCursor);
  if (!(INCOME_SOURCE_KEYS as readonly string[]).includes(source) || before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) {
    return NextResponse.json({ error: 'Choose a valid income source and history cursor.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getIncomeHistory(auth.user.id, source as IncomeSourceKey, before), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Income history is unavailable. Your balance has not changed.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
