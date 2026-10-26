export const REFERRAL_MINIMUM_CONNECTION_DAYS=45;
export const referralRemovalAt=(connectedAt:Date)=>new Date(connectedAt.getTime()+REFERRAL_MINIMUM_CONNECTION_DAYS*86400000);
export function referralEffectiveAt(at:Date){return {createdAt:{lte:at},OR:[{endedAt:null},{endedAt:{gt:at}}]};}
export type ReferralConnection={id:string;kind:'CUSTOMER'|'EMPLOYEE';name:string;connectedAt:string;removableAt:string;canRemove:boolean;legacy:boolean};
export type ReferralOffer={name:string;avatar:string|null;kind:'CUSTOMER'|'EMPLOYEE';proof:string;alreadyConnected:boolean;conflict:boolean;minimumDays:number};

/** Canonical aliases prevent an account from claiming its own alternate Gmail address. */
export function referralMailbox(value:string){
  const [local,host]=value.trim().toLowerCase().split('@');
  return ['gmail.com','googlemail.com'].includes(host)?`${local.split('+')[0].replace(/\./g,'')}@gmail.com`:`${local}@${host}`;
}
