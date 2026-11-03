import { ReferralEarningsCalculator } from '@/components/referral-earnings-calculator';
import { publicPageMetadata } from '@/lib/seo';
export const metadata = publicPageMetadata('Refer artists. Grow together.', 'Explore HYMN referral earnings with our transparent commission calculator.', '/referrals');
export default function ReferralsPage() {
  return <main className="shell py-12 sm:py-16" style={{ maxWidth: 1100 }}><p style={{ color: 'var(--text-muted)', fontSize: 12, letterSpacing: '.12em' }}>HYMN REFERRALS</p><h1 style={{ fontSize: 'clamp(30px,5vw,50px)', letterSpacing: '-.04em', lineHeight: 1.15, marginTop: 14, color: 'var(--text)' }}>Great music travels through people.</h1><p style={{ color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 620, marginTop: 16 }}>Introduce an artist to HYMN. An eligible connection can earn you commission on their future paid purchases and renewals.</p><ReferralEarningsCalculator showLink/></main>;
}
