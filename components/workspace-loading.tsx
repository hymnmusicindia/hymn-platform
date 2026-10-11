import styles from "./workspace-loading.module.css";
export function WorkspaceLoading({ label = "Opening your workspace", fullScreen = false, kind = "workspace" }: { label?:string; fullScreen?:boolean; kind?:"workspace"|"earnings"|"releases" }) {
  return <div className={`${styles.loading} ${fullScreen ? styles.fullScreen : ""}`} role="status" aria-live="polite" aria-busy="true">
    <div className={styles.header}><div className={styles.mark} aria-hidden="true"><i/><i/><i/><i/><i/></div><div><span className={styles.brand}>HYMN</span><p>{label}</p></div><span className={styles.dot} aria-hidden="true"/></div>
    <div className={styles.skeleton} aria-hidden="true"><span className={styles.title}/><span className={styles.subtitle}/><div className={styles.cards}>{Array.from({length:3},(_,index)=><div key={index}><span/><b/><span/></div>)}</div>{kind==="releases" ? <div className={styles.covers}>{[0,1,2].map(index=><div key={index}/>)}</div> : <div className={styles.rows}>{[0,1,2].map(index=><div key={index}><i/><span/><b/></div>)}</div>}</div>
  </div>;
}
