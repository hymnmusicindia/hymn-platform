import styles from "./workspace-loading.module.css";

export function WorkspaceLoading({ label = "Loading..." }: { label?: string; fullScreen?: boolean; kind?: "workspace" | "earnings" | "releases" }) {
  return (
    <div data-workspace-loading className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
