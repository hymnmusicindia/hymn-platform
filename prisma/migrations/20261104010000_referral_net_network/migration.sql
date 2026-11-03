-- Additive, initially disabled. Activate prospectively after the application is deployed.
ALTER TABLE "referral_program" ADD COLUMN "net_network_effective_at" TIMESTAMP(3);
