import {AGE_BANDS,LIFE_STAGES,PROJECT_BUDGETS,readClientDetails} from '@/lib/client-details';
import styles from './client-details-fields.module.css';
export function ClientDetailsFields({value,location=true,staff=false}:{value?:unknown;location?:boolean;staff?:boolean}){
 const d=readClientDetails(value);
 return <fieldset className={styles.root}><legend>{staff?'Client profile & project budget (optional)':'About you & your project (optional)'}</legend><p>{staff?'Ask the client before recording these details. Save what they share, and leave anything unknown blank.':'Share only what you’re comfortable with. HYMN’s team can use these details to tailor support and discuss options that fit your stated budget.'}</p>
 <div className={styles.grid}>
 <label>Country<input name="country" autoComplete="country-name" maxLength={100} defaultValue={d.country}/></label>
 {location&&<><label>State / region<input name="state" autoComplete="address-level1" maxLength={100} defaultValue={d.state}/></label><label>City<input name="city" autoComplete="address-level2" maxLength={100} defaultValue={d.city}/></label></>}
 <label>Age range<select name="ageBand" defaultValue={d.ageBand}>{Object.entries(AGE_BANDS).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
 <label>Work / study situation<select name="lifeStage" defaultValue={d.lifeStage}>{Object.entries(LIFE_STAGES).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
 <label>Budget for your current music project (INR)<select name="projectBudget" defaultValue={d.projectBudget}>{Object.entries(PROJECT_BUDGETS).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
 </div>
 <small>Budget means what the client chooses to spend on this project. Age, work and location do not determine spending power. Leave unknown details blank.</small>
 </fieldset>;
}
