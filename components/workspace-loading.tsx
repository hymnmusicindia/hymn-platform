import styles from "./workspace-loading.module.css";

export function WorkspaceLoading({ label = "Loading...", fullScreen = false }: { label?: string; fullScreen?: boolean; kind?: "workspace" | "earnings" | "releases" }) {
  return (
    <div className={`${styles.loading} ${fullScreen ? styles.fullScreen : ""}`} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
