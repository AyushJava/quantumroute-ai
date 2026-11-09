package com.quantumroute.backend.repository;

import com.quantumroute.backend.entity.Scenario;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ScenarioRepository extends JpaRepository<Scenario, UUID> {

    Page<Scenario> findByWorkspace_Id(UUID workspaceId, Pageable pageable);

    Page<Scenario> findByWorkspace_Owner_Id(UUID ownerId, Pageable pageable);

    Optional<Scenario> findByIdAndWorkspace_Owner_Id(UUID id, UUID ownerId);

    boolean existsByWorkspace_IdAndName(UUID workspaceId, String name);

    boolean existsByWorkspace_Id(UUID workspaceId);
}
