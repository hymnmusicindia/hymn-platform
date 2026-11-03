import type { ReleasePrefillSuggestion } from './release-prefill';
import { DIRENOTE_GENRES, DIRENOTE_LANGUAGES, DIRENOTE_SUBGENRES_BY_GENRE } from './direnote-config';

export const releasePrefillLabels:Record<ReleasePrefillSuggestion['field'],string>={language:'Release language',primaryGenre:'Genre',secondaryGenre:'Subgenre',recordLabelName:'Label',copyrightOwner:'C-Line owner',publishingRights:'P-Line owner'};
export const sensitivePrefillFields=new Set<ReleasePrefillSuggestion['field']>(['copyrightOwner','publishingRights']);
export type PrefillValues=Record<ReleasePrefillSuggestion['field'],string>;
export function usablePrefill(item:ReleasePrefillSuggestion,current:PrefillValues,customLabelAllowed:boolean) {
  if(!item.value.trim())return false;
  if(item.field==='recordLabelName')return customLabelAllowed;
  if(item.field==='language')return (DIRENOTE_LANGUAGES as readonly string[]).includes(item.value);
  if(item.field==='primaryGenre')return (DIRENOTE_GENRES as readonly string[]).includes(item.value);
  if(item.field==='secondaryGenre')return (DIRENOTE_SUBGENRES_BY_GENRE[current.primaryGenre]??[]).includes(item.value);
  return true;
}
export function matchingSafePrefills(items:ReleasePrefillSuggestion[],pending:ReadonlySet<string>,current:PrefillValues,customLabelAllowed:boolean) {
  return items.filter(item=>pending.has(item.field)&&!sensitivePrefillFields.has(item.field)&&current[item.field]===item.value&&usablePrefill(item,current,customLabelAllowed));
}
