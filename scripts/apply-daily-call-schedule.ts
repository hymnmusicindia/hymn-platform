import {prisma} from '../lib/prisma';
import {teamWrite} from '../lib/team/service';
import {syncDailyCallSchedule} from '../lib/team/daily-call-scheduler';
import {indiaWorkday} from '../lib/team/daily-work';
import {callTaskWhere} from '../lib/team/daily-call-policy';

async function main(){
 const workspaceId=process.argv.find(arg=>arg.startsWith('--workspace='))?.slice(12);
 if(!workspaceId)throw Error('Supply the verified workspace ID. Add --apply to assign duties and call slots.');
 const owner=await prisma.teamMember.findFirst({where:{workspaceId,status:'ACTIVE',role:{owner:true},user:{status:'ACTIVE'}},include:{role:true},orderBy:{id:'asc'}});
 if(!owner)throw Error('Active workspace owner required.');
 const runs=[];
 if(process.argv.includes('--apply'))for(let i=0;i<3;i++){const result=await teamWrite(owner,(tx,a)=>syncDailyCallSchedule(tx,a));runs.push(result);if(!result.scheduled&&!result.duties&&!result.plans)break;}
 const {day,start,end}=indiaWorkday();
 const calls=await prisma.teamTask.groupBy({by:['ownerId'],where:{workspaceId,archivedAt:null,status:{not:'CANCELLED'},dueAt:{gte:start,lt:end},...callTaskWhere},_count:true});
 const reps=await prisma.teamMember.findMany({where:{workspaceId,status:'ACTIVE',role:{owner:false}},select:{id:true,user:{select:{name:true}}}});
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),day,runs,today:reps.map(m=>({name:m.user.name,calls:calls.find(c=>c.ownerId===m.id)?._count||0}))},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Daily planning failed');process.exitCode=1;}).finally(()=>prisma.$disconnect());
