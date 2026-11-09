-- Phase 4e: persist safe failure/interruption explanations for optimization jobs.
ALTER TABLE optimization_job
    ADD COLUMN error_message TEXT;
