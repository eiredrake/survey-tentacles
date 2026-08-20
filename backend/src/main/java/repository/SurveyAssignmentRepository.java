package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SurveyAssignmentRepository
  extends JpaRepository<SurveyAssignment, Long>
{
  List<SurveyAssignment> findBySurveyId(Long surveyId);

  boolean existsBySurveyIdAndUserId(Long surveyId, Long userId);

  void deleteBySurveyIdAndUserId(Long surveyId, Long userId);
}
