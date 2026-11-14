import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findPartnership } from "@/lib/partnerships";
import { partnershipClauses, PARTNERSHIP_ACCEPTANCE, agreementDigest, SOUND_SYNC_AGREEMENT_VERSION } from "@/lib/partnership-agreement";
import { PartnershipActivation } from "@/components/partnership-activation";
import styles from "./partnership.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"Sound Sync × HYMN | Partnership invitation",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function PartnershipPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const invitation=await findPartnership(token);
  if(!invitation)return <main className={styles.page}><section className={styles.card}><h1>Let’s find your invitation.</h1><p>This invitation link is invalid. Please reply to your HYMN invitation email for assistance.</p><Link href="/">Back to HYMN</Link></section></main>;
  const session=await getSession();
  const user=session?await prisma.user.findUnique({where:{id:session.sub},select:{email:true,status:true,referralCode:true}}):null;
  const matching=Boolean(user&&user.status==="ACTIVE"&&user.email.toLowerCase()===invitation.email.toLowerCase());
  const expired=!invitation.acceptedAt&&(invitation.status!=="INVITED"||invitation.expiresAt<=new Date());
  const changed=invitation.agreementHash!==agreementDigest()||invitation.agreementVersion!==SOUND_SYNC_AGREEMENT_VERSION;
  const path=`/partnerships/activate/${token}`;
  return <main className={styles.page}><div className={styles.wrap}>
    <header className={styles.hero}><div className={styles.brand}><Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={112} height={42} style={{height:"auto"}} priority /></div><br/><span className={styles.eyebrow}>HYMN MUSIC / STRATEGIC PARTNERSHIPS</span><p className={styles.kicker}>An invitation to Sound Sync</p><h1>A shared ambition.<br/><em>A new beginning.</em></h1><p>A collaboration built on shared growth, meaningful opportunities and mutual value.</p><div className={styles.metrics}><div><strong>Yearly+</strong><span>Your complimentary individual term</span></div><div><strong>105</strong><span>Qualifying clients / four months</span></div><div><strong>No minimum</strong><span>Withdraw any positive cleared balance</span></div></div></header>
    <section className={styles.card} aria-labelledby="next-step"><span className={styles.eyebrow}>YOUR NEXT STEP</span><h2 id="next-step">{matching&&invitation.acceptedAt?"You’re part of HYMN.":"Review. Accept. Begin."}</h2>
      {matching&&invitation.acceptedAt?<><p>Your agreement was accepted on {invitation.acceptedAt.toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"long",year:"numeric"})}. Your original complimentary Yearly+ term runs through {invitation.subscriptionExpiresAt?.toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"long",year:"numeric"})}.</p><p>Referral code: <strong>{user?.referralCode}</strong>. Your referral link and earnings are available in your dashboard.</p><p>{invitation.mailStatus==="SENT"?"Your confirmation email has been sent.":"Your activation is saved. If your confirmation email is delayed, your code and dashboard remain available here. Reply to HYMN for delivery assistance."}</p><Link className={styles.button} href="/dashboard?tab=referral">Open referral dashboard →</Link></>
      :expired?<p>This invitation is no longer available. Reply to your HYMN email for a fresh activation link.</p>
      :changed?<p>An updated agreement is required. Please reply to HYMN before activating.</p>
      :!matching?<><p>Read the complete agreement below, then sign up or sign in with the email address that received your invitation. After sign-in, you’ll return here to accept and activate.</p>{user&&<p role="alert">You’re signed in with a different account. Switch to the invited account to continue.</p>}<Link className={styles.button} href={`/login?next=${encodeURIComponent(path)}`}>Sign in or create your account →</Link><p className={styles.small}>Signing in does not accept the agreement or activate your plan.</p></>
      :<PartnershipActivation token={token} acceptance={PARTNERSHIP_ACCEPTANCE}/>}
      <a className={styles.pdf} href={`/api/partnerships/${token}/agreement`}>Download the agreement PDF ↗</a>
    </section>
    <section className={styles.agreement}><span className={styles.eyebrow}>THE COMPLETE AGREEMENT</span><h2>Strategic Partnership Agreement</h2><p className={styles.small}>HYMN Music & Sound Sync · {invitation.agreementVersion}</p>{partnershipClauses.map(clause=><article key={clause.title}><h3>{clause.title}</h3><p>{clause.body}</p></article>)}<aside>{PARTNERSHIP_ACCEPTANCE}</aside></section>
  </div></main>;
}
