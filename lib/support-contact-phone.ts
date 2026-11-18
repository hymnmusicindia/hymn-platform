/** Preserve explicit international prefixes. HYMN's bare ten-digit local
 * numbers are Indian, as stated beside the contact input. */
export function supportContactPhone(input:string):string|null {
  const value=input.trim();
  if(!/^(?:\+|00)?[\d\s().-]+$/.test(value))return null;
  const explicit=value.startsWith('+')||value.startsWith('00');
  const digits=value.replace(/^00/,'').replace(/\D/g,'');
  const phone=`+${!explicit&&digits.length===10?'91':''}${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}
