package com.quantumroute.backend.service;

import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Startup recovery: marks jobs left QUEUED/RUNNING by a previous run as FAILED
 * and flips the readiness flag so job submissions are only accepted afterwards.
 */
@Service
public class JobRecoveryService implements ApplicationRunner {

    static final String RECOVERY_ERROR =
            "job interrupted by application restart";

    private final OptimizationJobRepository jobRepository;
    private volatile boolean ready = false;

    public JobRecoveryService(OptimizationJobRepository jobRepository) {
        this.jobRepository = jobRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        recoverStaleJobs();
        ready = true;
    }

    @Transactional
    public int recoverStaleJobs() {
        List<OptimizationJob> stale = new java.util.ArrayList<>();
        stale.addAll(jobRepository.findByStatus(OptimizationJob.Status.QUEUED));
        stale.addAll(jobRepository.findByStatus(OptimizationJob.Status.RUNNING));
        Instant now = Instant.now();
        for (OptimizationJob job : stale) {
            job.setStatus(OptimizationJob.Status.FAILED);
            job.setErrorMessage(RECOVERY_ERROR);
            job.setFinishedAt(now);
        }
        jobRepository.saveAll(stale);
        return stale.size();
    }

    public boolean isReady() {
        return ready;
    }

    void markReady() {
        ready = true;
    }

    void markNotReady() {
        ready = false;
    }
}
