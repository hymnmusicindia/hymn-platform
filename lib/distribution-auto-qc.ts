import "server-only";

// Preserve the established payment/recovery entry point.
export { runIntelligentDistributionQc as runPendingDistributionQc } from "./distribution-intelligent-qc";
