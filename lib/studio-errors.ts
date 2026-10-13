import { Prisma } from "@prisma/client";
import { z } from "zod";
export function studioError(error:unknown,fallback="Could not complete this Studio request.") {
 if(error instanceof z.ZodError)return error.issues[0]?.message||"Check the details and try again.";
 if(error instanceof Prisma.PrismaClientKnownRequestError){if(error.code==="P2002")return "This request is already on file. Refresh to see its status.";if(error.code==="P2034")return "Another update happened at the same time. Refresh and try again.";return fallback;}
 if(error instanceof Prisma.PrismaClientValidationError||error instanceof Prisma.PrismaClientUnknownRequestError||error instanceof Prisma.PrismaClientInitializationError)return fallback;
 return error instanceof Error?error.message:fallback;
}
