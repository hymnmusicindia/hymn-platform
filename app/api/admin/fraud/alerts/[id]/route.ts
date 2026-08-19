import { NextResponse } from "next/server"; import { requireAdminPermission } from "@/lib/access"; import { prisma } from "@/lib/prisma";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const admin=await requireAdminPermission("fraud.read");if("error"in admin)return admin.error;const id=Number((await context.params).id);if(!Number.isInteger(id))return NextResponse.json({error:"Invalid alert."},{status:400});const alert=await (prisma as any).fraudAlert.findUnique({where:{id},include:{signals:true,primaryCase:{include:{notes:{orderBy:{createdAt:"desc"}},evidence:true,links:true}}}});return alert?NextResponse.json({alert}):NextResponse.json({error:"Alert not found."},{status:404});}

// vercel trigger 14
