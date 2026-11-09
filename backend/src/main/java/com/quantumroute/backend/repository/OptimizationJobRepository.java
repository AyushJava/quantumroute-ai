package com.quantumroute.backend.repository;

import com.quantumroute.backend.entity.OptimizationJob;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OptimizationJobRepository extends JpaRepository<OptimizationJob, UUID> {

    Page<OptimizationJob> findByScenario_Id(UUID scenarioId, Pageable pageable);

    Page<OptimizationJob> findByScenario_Workspace_Owner_Id(UUID ownerId, Pageable pageable);

    Optional<OptimizationJob> findByIdAndScenario_Workspace_Owner_Id(UUID id, UUID ownerId);

    List<OptimizationJob> findByStatus(OptimizationJob.Status status);

    long countByScenario_IdAndStatus(UUID scenarioId, OptimizationJob.Status status);

    boolean existsByScenario_Id(UUID scenarioId);
}
