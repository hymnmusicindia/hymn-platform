import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reportReturnPath} from '../lib/routes';
import {prisma} from '../lib/prisma';
import {producerFollowStates,setProducerFollow} from '../lib/producer-follows';

async function main(){
  assert.match(process.env.DATABASE_URL||'',/^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55473\//);
  assert.equal(reportReturnPath('/beat-store#producer-suggestions'),'/beat-store#producer-suggestions');
  for(const path of ['https://other.example','//other.example','/beat-store?next=https://other.example','/beat-store#other'])assert.equal(reportReturnPath(path),undefined);
  const user=await prisma.user.create({data:{googleId:randomUUID(),name:'Listener',email:'follow-listener@example.test',status:'ACTIVE'}});
  const other=await prisma.user.create({data:{googleId:randomUUID(),name:'Other listener',email:'follow-other@example.test',status:'ACTIVE'}});
  const owner=await prisma.user.create({data:{googleId:randomUUID(),name:'Producer',email:'follow-producer@example.test',role:'PRODUCER',status:'ACTIVE'}});
  const profile=await prisma.producerProfile.create({data:{userId:owner.id,slug:'follow-test-producer',displayName:'Test producer',bio:'A real profile',specialty:'Hip Hop',status:'active',active:true}});
  assert.deepEqual(await producerFollowStates([profile.id]),[{id:profile.id,count:0,following:false,own:false}]);
  await Promise.all(Array.from({length:5},()=>setProducerFollow(user.id,profile.id,true)));
  assert.equal(await prisma.producerFollow.count(),1,'Concurrent replay cannot inflate follower counts');
  assert.equal((await producerFollowStates([profile.id],user.id))[0].following,true);
  assert.equal((await producerFollowStates([profile.id],other.id))[0].following,false,'Follow state is private to each account');
  await setProducerFollow(other.id,profile.id,true);
  assert.equal((await producerFollowStates([profile.id]))[0].count,2);
  await assert.rejects(setProducerFollow(owner.id,profile.id,true),/your producer profile/);
  await assert.rejects(setProducerFollow(user.id,999999,true),/no longer available/);
  await prisma.user.update({where:{id:other.id},data:{status:'SUSPENDED'}});
  await assert.rejects(setProducerFollow(other.id,profile.id,true),/account is not available/);
  await prisma.producerProfile.update({where:{id:profile.id},data:{status:'suspended'}});
  assert.deepEqual(await producerFollowStates([profile.id],user.id),[]);
  await assert.rejects(setProducerFollow(user.id,profile.id,true),/no longer available/);
  await prisma.producerProfile.update({where:{id:profile.id},data:{status:'active'}});
  await setProducerFollow(user.id,profile.id,false);await setProducerFollow(user.id,profile.id,false);
  assert.equal((await producerFollowStates([profile.id],user.id))[0].count,1,'Repeated unfollows do not alter other accounts');
  await prisma.user.delete({where:{id:other.id}});
  assert.equal(await prisma.producerFollow.count(),0,'Deleting a follower cleans up the relation');
  await setProducerFollow(user.id,profile.id,true);await prisma.producerProfile.delete({where:{id:profile.id}});
  assert.equal(await prisma.producerFollow.count(),0,'Deleting a producer cleans up the relation');
  console.log('PASS producer follows: migration, durable follows, concurrent replay, count accuracy, viewer isolation, self-follow, inactive accounts/profiles, unavailable producers, repeated unfollow and deletion cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
