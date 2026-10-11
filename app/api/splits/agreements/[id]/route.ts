import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { amendSplitAgreement, cancelSplitAgreement } from "@/lib/splits";
export async function POST(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const body = await request.json().catch(() => ({}));
    const id = Number((await params).id);
    try {
        if (body.action === "cancel")
            return NextResponse.json(await cancelSplitAgreement(auth.user.id, id));
        if (body.action === "amend")
            return NextResponse.json({ split: await amendSplitAgreement(auth.user.id, id, String(body.effectivePeriod || "")) });
        return NextResponse.json({ error: "Unknown agreement action." }, { status: 400 });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update agreement." }, { status: 400 });
    }
}
