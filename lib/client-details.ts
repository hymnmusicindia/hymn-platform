import { z } from 'zod';

export const AGE_BANDS = { '': 'Not shared', UNDER_18: 'Under 18', AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_PLUS: '45 or older' } as const;
export const LIFE_STAGES = { '': 'Not shared', SCHOOL: 'School student', COLLEGE: 'College / university student', EMPLOYED: 'Employed', SELF_EMPLOYED: 'Self-employed', OTHER: 'Other', PREFER_NOT_TO_SAY: 'Prefer not to say' } as const;
export const PROJECT_BUDGETS = { '': 'Not shared', UNDECIDED: 'Still deciding', FREE_ONLY: 'Free options only', UNDER_500: 'Under ₹500', INR_500_2000: '₹500–₹2,000', INR_2000_5000: '₹2,000–₹5,000', INR_5000_10000: '₹5,000–₹10,000', INR_10000_PLUS: '₹10,000 or more' } as const;
const choice = <T extends Record<string,string>>(values:T) => z.enum(Object.keys(values) as [keyof T & string,...(keyof T & string)[]]);
export const clientDetailsSchema = z.object({
 country: z.string().trim().max(100).default(''), state:z.string().trim().max(100).default(''), city:z.string().trim().max(100).default(''),
 ageBand:choice(AGE_BANDS).default(''), lifeStage:choice(LIFE_STAGES).default(''), projectBudget:choice(PROJECT_BUDGETS).default(''),
}).strict();
export type ClientDetails = z.infer<typeof clientDetailsSchema>;
export const emptyClientDetails = clientDetailsSchema.parse({});
export function readClientDetails(value:unknown):ClientDetails{
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return Object.fromEntries(Object.keys(emptyClientDetails).map(key=>{const result=clientDetailsSchema.shape[key as keyof ClientDetails].safeParse(raw[key]);return [key,result.success?result.data:''];})) as ClientDetails;
}
export function clientDetailsSummary(value:unknown){const d=readClientDetails(value);return [
 [d.city,d.state,d.country].filter(Boolean).join(', '),AGE_BANDS[d.ageBand],LIFE_STAGES[d.lifeStage],d.projectBudget?`Project budget (INR): ${PROJECT_BUDGETS[d.projectBudget]}`:'',
].filter(text=>text&&text!=='Not shared');}
export function clientDetailsFromForm(form:FormData):ClientDetails{return clientDetailsSchema.parse(Object.fromEntries(Object.keys(emptyClientDetails).map(key=>[key,String(form.get(key)||'')])));}
export function customerClientFields(preferences:unknown){const p=preferences&&typeof preferences==='object'&&!Array.isArray(preferences)?preferences as Record<string,unknown>:{};if(!p.clientDetails)return {};const details=readClientDetails(p.clientDetails);return {clientDetails:{...details,source:'CUSTOMER'},city:details.city,state:details.state};}
export function isKnownMinor(dateOfBirth:Date|null|undefined,now=new Date()){if(!dateOfBirth||!Number.isFinite(dateOfBirth.getTime())||dateOfBirth>now)return false;let age=now.getUTCFullYear()-dateOfBirth.getUTCFullYear();if(now.getUTCMonth()<dateOfBirth.getUTCMonth()||now.getUTCMonth()===dateOfBirth.getUTCMonth()&&now.getUTCDate()<dateOfBirth.getUTCDate())age--;return age<18;}
