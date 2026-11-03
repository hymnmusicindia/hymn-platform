import {SubscriptionPlanConfigurationError,validateSubscriptionProviderPlan} from './subscription-plan-validation';

export const ANNUAL_RECURRENCE_PROFILE='annual-upi-as-presented-v1';
export function annualCompatibilityRequired(plan:{period?:string;interval?:number}){return plan.period==='yearly'&&Number(plan.interval)===1;}
export function validateCompatibleAnnualPlan(plan:{id?:string;period?:string;interval?:number;item?:{amount?:number|string;currency?:string};notes?:Record<string,unknown>},sourceId:string,expected:{amount:number;currency:string;months:number;planEnv:string}){
 validateSubscriptionProviderPlan(plan,expected);
 if(plan.period!=='monthly'||Number(plan.interval)!==12||plan.notes?.hymn_recurrence_profile!==ANNUAL_RECURRENCE_PROFILE||plan.notes?.hymn_source_plan_id!==sourceId)throw new SubscriptionPlanConfigurationError('Annual checkout compatibility mapping is invalid.');
}
export function validSubscriptionCycleCount(value:number,months=12){
 if(!Number.isSafeInteger(value)||value<1||value*months>1200)throw new SubscriptionPlanConfigurationError('Subscription billing cycles must be positive integers within the provider duration limit.');
 return value;
}
export function isUnstartedSubscription(s:{status?:string;paid_count?:number;auth_attempts?:number;current_start?:number|null}){
 return s.status==='created'&&s.paid_count===0&&s.auth_attempts===0&&!s.current_start;
}
export function subscriptionPaymentFailureMessage(description?:string){
 if(description&&/validateRecurrencePatternRuleValue|recurrence[ _-]?value|recurrence[ _-]?pattern/i.test(description))return 'UPI AutoPay could not be authorised. Close checkout and retry to refresh the billing setup, or choose another supported payment method. If your bank shows a debit, check your payment status before paying again.';
 return description||'Payment could not be completed. Please check its status before retrying.';
}
