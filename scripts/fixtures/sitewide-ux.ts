import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {prisma} from '../../lib/prisma';
import {ALL_ADMIN_PERMISSIONS} from '../../lib/access';
import {buildPerformanceReport} from '../../lib/team/performance';
import {indiaDay} from '../../lib/team/performance-model';
import {roleTemplates} from '../../lib/team/policy';
async function main(){
assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55481/customer_fixture');
const admin=await prisma.user.findUnique({where:{email:'ui-admin@audit.fixture.invalid'}})||await prisma.user.create({data:{name:'UI Audit Administrator',email:'ui-admin@audit.fixture.invalid',googleId:'ui-audit-admin',role:'ADMIN'}});
const role=await prisma.adminRole.upsert({where:{key:'super_admin'},create:{key:'super_admin',name:'Super administrator'},update:{}});
for(const key of ALL_ADMIN_PERMISSIONS){const permission=await prisma.adminPermission.upsert({where:{key},create:{key},update:{}});await prisma.adminRolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});}
await prisma.adminMembership.upsert({where:{userId:admin.id},create:{userId:admin.id,roleId:role.id},update:{}});
const staff=await prisma.user.findUnique({where:{email:'ui-team@audit.fixture.invalid'}})||await prisma.user.create({data:{name:'UI Audit Team Member',email:'ui-team@audit.fixture.invalid',googleId:'ui-audit-team',referralCode:'UIAUDITTEAM'}});
const workspace=await prisma.teamWorkspace.findFirst({where:{name:'UI audit workspace'}})||await prisma.teamWorkspace.create({data:{name:'UI audit workspace'}});
const ownerRole=await prisma.teamRole.findFirst({where:{workspaceId:workspace.id,owner:true}})||await prisma.teamRole.create({data:{workspaceId:workspace.id,name:'Owner',owner:true,permissions:roleTemplates.Owner}});
const staffRole=await prisma.teamRole.findFirst({where:{workspaceId:workspace.id,owner:false}})||await prisma.teamRole.create({data:{workspaceId:workspace.id,name:'UI audit staff',permissions:roleTemplates.Owner}});
const owner=await prisma.teamMember.findFirst({where:{workspaceId:workspace.id,userId:admin.id}})||await prisma.teamMember.create({data:{workspaceId:workspace.id,userId:admin.id,roleId:ownerRole.id}});
const member=await prisma.teamMember.findFirst({where:{workspaceId:workspace.id,userId:staff.id}})||await prisma.teamMember.create({data:{workspaceId:workspace.id,userId:staff.id,roleId:staffRole.id}});
for(let i=0;i<8;i++){const client=await prisma.teamClient.findFirst({where:{workspaceId:workspace.id,email:`ui-client${i}@audit.fixture.invalid`}})||await prisma.teamClient.create({data:{workspaceId:workspace.id,ownerId:member.id,name:'UI Contact '+i,email:`ui-client${i}@audit.fixture.invalid`,phone:'+919876543210'}});const prospect=await prisma.teamProspect.findUnique({where:{clientId:client.id}})||await prisma.teamProspect.create({data:{workspaceId:workspace.id,clientId:client.id,ownerId:member.id,name:client.name,email:client.email,phone:client.phone,sourceUrl:'https://example.org',evidence:'Public source to review in this fixture.',identityKey:'ui-contact-'+i,score:{},categories:[],stage:'NEEDS_RESEARCH'}});await prisma.acquisitionLead.upsert({where:{prospectId:prospect.id},update:{},create:{workspaceId:workspace.id,prospectId:prospect.id,researcherEmployeeId:member.id}});}
await prisma.teamTask.create({data:{workspaceId:workspace.id,creatorId:owner.id,ownerId:member.id,title:'Review a customer request and record the next action',description:'Fixture task with a clear next step.',checklist:[{text:'Read the enquiry',done:false}],dueAt:new Date(Date.now()+86400000)}});
const producer=await prisma.user.findFirstOrThrow({where:{producerProfile:{slug:'audit-producer'}}});
const fixture=JSON.parse(readFileSync('.cache/customer-experience/fixture.json','utf8'));
const inviter=await prisma.user.upsert({where:{email:'ui-community@audit.fixture.invalid'},create:{name:'UI Community Inviter',email:'ui-community@audit.fixture.invalid',googleId:'ui-community',referralCode:'UIAUDITCOMMUNITY'},update:{}});
const referral=await prisma.referral.findFirst({where:{referredUserId:fixture.otherId}})||await prisma.referral.create({data:{userId:inviter.id,referredUserId:fixture.otherId,activeRecipientId:fixture.otherId,referralCode:'UIAUDITCOMMUNITY',signupEmail:'other@audit.fixture.invalid',acceptedAt:new Date()}});
const vouch=await prisma.studioVouch.upsert({where:{engineerProfileId_authorId:{engineerProfileId:fixture.engineerId,authorId:fixture.customer.id}},create:{engineerProfileId:fixture.engineerId,authorId:fixture.customer.id,rating:5,comment:'Clear communication and thoughtful work on the mix.',relationship:'Collaborator',workUrl:'https://example.org/music',status:'APPROVED'},update:{}});
const report=await buildPerformanceReport(member.id,'weekly',indiaDay());
const snapshot=await prisma.emailLog.upsert({where:{eventKey:'ui-audit-performance-snapshot'},create:{eventKey:'ui-audit-performance-snapshot',userId:staff.id,toEmail:staff.email,subject:'UI fixture snapshot, no email delivery',template:'team_performance_report',entityType:'team_member',entityId:member.id,status:'fixture',payload:JSON.parse(JSON.stringify({report}))},update:{payload:JSON.parse(JSON.stringify({report}))}});
writeFileSync('.cache/customer-experience/sitewide-roles.json',JSON.stringify({admin:{id:admin.id,name:admin.name,email:admin.email,role:'admin'},staff:{id:staff.id,name:staff.name,email:staff.email,role:'customer'},producer:{id:producer.id,name:producer.name,email:producer.email,role:'producer'},workspaceId:workspace.id,referralId:referral.id,vouchId:vouch.id,snapshotId:snapshot.id}));
console.log('Seeded isolated admin, producer identity and owner/staff workspace for site-wide UI audit.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
