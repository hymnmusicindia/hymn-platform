import { NextResponse } from "next/server"; import { requireAdminPermission } from "@/lib/access"; import { prisma } from "@/lib/prisma";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const admin=await requireAdminPermission("fraud.read");if("error"in admin)return admin.error;const id=Number((await context.params).id);if(!Number.isInteger(id))return NextResponse.json({error:"Invalid case."},{status:400});const item=await (prisma as any).fraudCase.findUnique({where:{id},include:{primaryAlert:{include:{signals:true}},notes:{orderBy:{createdAt:"desc"}},evidence:true,links:true}});return item?NextResponse.json({case:item}):NextResponse.json({error:"Case not found."},{status:404});}

// vercel trigger 14
