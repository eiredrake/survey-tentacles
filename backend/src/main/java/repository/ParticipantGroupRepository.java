package org.eiredrake.tentacles.repository;

import org.eiredrake.tentacles.model.ParticipantGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParticipantGroupRepository extends JpaRepository<ParticipantGroup, Long> {
  boolean existsByNameKeyAndIdNot(String nameKey, Long id);
}
