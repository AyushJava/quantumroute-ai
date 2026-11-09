package com.quantumroute.backend.repository;

import com.quantumroute.backend.entity.Workspace;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {

    Page<Workspace> findByOwner_Id(UUID ownerId, Pageable pageable);

    boolean existsByOwner_IdAndName(UUID ownerId, String name);
}
