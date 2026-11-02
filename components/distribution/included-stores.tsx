import { storePlatforms } from '@/lib/release-config';
import { StoreChoice } from './store-choice';
import styles from './store-choice.module.css';

const topNames = ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music', 'JioSaavn'];
const remaining = storePlatforms.filter(store => !topNames.includes(store.name));

export function IncludedStores() {
  return <div>
    <div className={styles.grid}>{topNames.map(name => <StoreChoice key={name} name={name} included />)}</div>
    <details className={styles.remaining}>
      <summary><span>{remaining.length} remaining stores</span><span className={styles.included}>Included</span></summary>
      <div className={styles.grid}>{remaining.map(store => <StoreChoice key={store.name} name={store.name} included />)}</div>
    </details>
    <p className={styles.note}>Music distribution includes these destinations. Availability is subject to store acceptance; individual stores cannot be excluded.</p>
  </div>;
}
