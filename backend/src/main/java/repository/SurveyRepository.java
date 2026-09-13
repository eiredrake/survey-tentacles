package org.eiredrake.tentacles.repository;

import org.eiredrake.tentacles.model.Survey;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SurveyRepository extends JpaRepository<Survey, Long> {
  @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @org.springframework.data.jpa.repository.Query("select s from Survey s where s.id = :id")
  java.util.Optional<Survey> findForAssignment(@org.springframework.data.repository.query.Param("id") Long id);
}