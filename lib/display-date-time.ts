/** Stable HYMN timestamps: identical during server rendering and browser hydration. */
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function displayDateTime(value:string|number|Date|null|undefined){
  if(value===null||value===undefined||value==='')return 'Not recorded';
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Not recorded';
  const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} IST`;
}
