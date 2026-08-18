package org.eiredrake.tentacles.repository;

import org.eiredrake.tentacles.model.Survey;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SurveyRepository extends JpaRepository<Survey, Long> {
}