import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
export function apiRequestId(request: Request) { return request.headers.get("x-request-id")?.trim().slice(0, 128) || randomUUID(); }
export function apiSuccess<T>(requestId: string, data: T, init?: ResponseInit) { return NextResponse.json({ success: true, data, requestId }, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), "X-Request-ID": requestId } }); }
export function apiFailure(requestId: string, code: string, message: string, status = 400, fieldErrors?: Record<string, string[]>) { return NextResponse.json({ success: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) }, requestId }, { status, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } }); }
// vercel trigger 9
