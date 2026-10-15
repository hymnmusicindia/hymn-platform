const ExcelJS = require('exceljs');
async function main() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Beat upload details');
  const headers = ['Beat ID','Beat title','Account holder','User ID','Storefront name','BPM','Key','Genre','Mood','MP3 licence INR','WAV licence INR (when supplied)','WAV availability','MP3 file','Artwork file','Sample rights','Current status','Required before publishing'];
  sheet.addRow(headers);
  sheet.addRow([6,'heart in love','Manha Dakora',19,'gxrry.flac',98,'G Minor','Hip-Hop (provisional)','Romantic',120,180,'Unavailable','C:\\Users\\adity\\Downloads\\preview (1).mp3','C:\\Users\\adity\\Downloads\\59f574f70b18295d06c6fd5ffef825bc.jpg','100% copyright control confirmed by owner','Unpublished draft','Upload MP3 and artwork to live storage; keep WAV, stems and exclusive unavailable.']);
  sheet.addRow([7,'4V','Manha Dakora',19,'gxrry.flac',93,'D Minor','Hip-Hop (provisional)','Energetic / Bold',120,180,'Unavailable','C:\\Users\\adity\\Downloads\\preview (2).mp3','Superman artwork attached in chat; local file path not supplied','Confirmation required for this beat','Unpublished draft','Upload MP3 and artwork to live storage; confirm sample rights; keep WAV, stems and exclusive unavailable.']);
  sheet.views = [{state:'frozen',ySplit:1}];
  sheet.autoFilter = {from:'A1',to:'Q3'};
  sheet.getRow(1).eachCell(cell => { cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF182433'}}; });
  sheet.columns.forEach((column,index) => { column.width=[12,22,22,12,20,10,15,24,23,20,29,22,55,65,50,23,85][index];column.alignment={vertical:'top',wrapText:true}; });
  sheet.getRow(2).height=70;sheet.getRow(3).height=85;
  const notes=book.addWorksheet('Instructions');
  notes.columns=[{width:32},{width:100}];
  notes.addRow(['Field','What to enter']);
  notes.addRow(['Storefront','Use Manha Dakora (user ID 19), storefront gxrry.flac. Existing beat IDs 6 and 7 should be updated rather than duplicated.']);
  notes.addRow(['MP3','Upload the corresponding supplied MP3. Confirm it is the intended customer deliverable as well as the public personal-use preview.']);
  notes.addRow(['WAV','Do not upload a converted MP3 as a WAV master. Keep the WAV tier unavailable until the real WAV is supplied; intended price is INR 180.']);
  notes.addRow(['Other tiers','No stems or exclusive deliverables/prices were supplied. Keep these tiers unavailable.']);
  notes.addRow(['Free download','Personal, non-commercial MP3 use only after accepting the agreement. Commercial use requires a purchased licence.']);
  notes.addRow(['Rights','Owner confirmed full copyright control for heart in love. Obtain the same confirmation specifically for 4V before publishing.']);
  notes.addRow(['Genre','Hip-Hop is provisional and was not explicitly confirmed by the owner.']);
  notes.addRow(['Publishing','Neither draft currently has live media attached. Publish only after checking playback, artwork and paid-file delivery.']);
  notes.eachRow(row=>{row.alignment={wrapText:true,vertical:'top'};row.height=45;});
  await book.xlsx.writeFile('HYMN_gxrry_Beat_Upload_Details.xlsx');
  console.log('Created HYMN_gxrry_Beat_Upload_Details.xlsx');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
