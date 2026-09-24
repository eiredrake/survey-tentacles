package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.CanonicalNomination;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CanonicalNominationRepository extends JpaRepository<CanonicalNomination, Long> {
  List<CanonicalNomination> findByQuestionIdOrderByIdAsc(Long questionId);
}