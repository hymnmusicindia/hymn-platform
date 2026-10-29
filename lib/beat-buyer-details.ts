import { z } from 'zod';
export const beatBuyerDetailsSchema = z.object({
  legalName:z.string().trim().min(2,'Enter your full legal name.').max(120),
  artistName:z.string().trim().min(2,'Enter the artist name for this licence.').max(80),
  phone:z.string().trim().max(30).regex(/^\+?[0-9 ()-]+$/,'Enter a valid phone number, including country code.').refine(value=>{const digits=value.replace(/\D/g,'');return digits.length>=8&&digits.length<=15;},'Enter a valid phone number, including country code.'),
  acceptedTerms:z.literal(true,{errorMap:()=>({message:'Confirm your details and accept the licence terms.'})})
});
export type BeatBuyerDetails = z.infer<typeof beatBuyerDetailsSchema>;
