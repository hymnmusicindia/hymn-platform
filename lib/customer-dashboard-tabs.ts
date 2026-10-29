export const customerTabs = ['overview','releases','upload','analytics','earnings','promotions','collaborators','distribution','content-id','messages','support','settings','purchases','subscription','referral','account'] as const;
export type CustomerTab = typeof customerTabs[number];
export function customerTab(params:{get:(key:string)=>string|null}):CustomerTab{
  if(params.get('module')==='splits')return 'collaborators';
  const tab=params.get('tab'),moduleKey=params.get('module');
  const selected=customerTabs.includes(tab as CustomerTab)?tab:moduleKey;
  return customerTabs.includes(selected as CustomerTab)&&selected!=='earnings'?selected as CustomerTab:'overview';
}
