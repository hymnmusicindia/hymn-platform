import {inflateRawSync} from 'node:zlib';
import {verifyAudioIntegrity} from './media-integrity';
import {canDeliverBeatFile} from './beat-licence-terms';
export async function verifyRequestedBeatFile(bytes:Buffer,mime:string,license:string){
 if(!canDeliverBeatFile(license,mime))throw Error('Upload the exact format requested by the buyer. A different format cannot be substituted.');
 if(mime!=='application/zip'){await verifyAudioIntegrity(bytes,mime);return;}
 // Validate existing archive-based tiers without trusting the extension or ZIP signature alone.
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('Invalid audio archive.');
 const count=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16),audio=0,total=0;
 if(!count||count>500||cursor>=end)throw Error('Invalid or oversized audio archive.');
 for(let index=0;index<count;index++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid archive index.');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),packed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42),name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  total+=size;if(flags&1||total>512*1024*1024||size>128*1024*1024||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||/[\x00-\x1f]/.test(name))throw Error('Unsafe or oversized archive entry.');
  if(!name.endsWith('/')&&!/\.(wav|mp3|txt|pdf)$/i.test(name))throw Error('The archive must contain audio and optional documentation only.');
  if(/\.(wav|mp3)$/i.test(name)){
   if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid archive entry.');
   const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);if(start+packed>cursor)throw Error('Truncated archive entry.');
   const compressed=bytes.subarray(start,start+packed),data=method===0?compressed:method===8?inflateRawSync(compressed,{maxOutputLength:128*1024*1024}):null;
   if(!data||data.length!==size)throw Error('Invalid audio archive compression.');await verifyAudioIntegrity(data,/\.wav$/i.test(name)?'audio/wav':'audio/mpeg');audio++;
  }
  cursor+=46+nameLength+extra+comment;
 }
 if(!audio)throw Error('The archive contains no usable audio files.');
}
