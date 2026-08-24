package org.eiredrake.tentacles.service;

import java.util.List;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.eiredrake.tentacles.repository.SurveyAssignmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SurveyAssignmentService {

  private final SurveyAssignmentRepository surveyAssignmentRepository;

  public SurveyAssignmentService(
    SurveyAssignmentRepository surveyAssignmentRepository
  ) {
    this.surveyAssignmentRepository = surveyAssignmentRepository;
  }

  public List<SurveyAssignment> findBySurveyId(Long surveyId) {
    return surveyAssignmentRepository.findBySurveyId(surveyId);
  }

  public boolean isAssigned(Long surveyId, Long userId) {
    return surveyAssignmentRepository.existsBySurveyIdAndUserId(
      surveyId,
      userId
    );
  }

  public boolean isRequired(Long surveyId, Long userId) {
    return surveyAssignmentRepository
        .findBySurveyId(surveyId)
        .stream()
        .anyMatch(assignment ->
            assignment.getUser().getId().equals(userId) &&
            assignment.isRequired()
        );
    }   

  public SurveyAssignment save(SurveyAssignment assignment) {
    return surveyAssignmentRepository.save(assignment);
  }

  @Transactional
  public void delete(Long surveyId, Long userId) {
    surveyAssignmentRepository.deleteBySurveyIdAndUserId(surveyId, userId);
  }

 
}
