package com.quantumroute.backend.repository;

import com.quantumroute.backend.entity.OptimizationResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OptimizationResultRepository extends JpaRepository<OptimizationResult, UUID> {

    Optional<OptimizationResult> findByJob_Id(UUID jobId);

    Optional<OptimizationResult> findByJob_IdAndJob_Scenario_Workspace_Owner_Id(UUID jobId, UUID ownerId);

    boolean existsByJob_Id(UUID jobId);
}
