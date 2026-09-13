package org.eiredrake.tentacles.service;

import java.util.*;
import org.eiredrake.tentacles.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.eiredrake.tentacles.model.SurveyAssignment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SurveyAssignmentService {

  private final SurveyAssignmentRepository surveyAssignmentRepository;

  private final SurveyRepository surveys;
  private final UserRepository users;
  private final ParticipantGroupRepository groups;

  public SurveyAssignmentService(SurveyAssignmentRepository surveyAssignmentRepository,
    SurveyRepository surveys,
    UserRepository users,
    ParticipantGroupRepository groups) {
    this.surveyAssignmentRepository = surveyAssignmentRepository;
    this.surveys = surveys; this.users = users; this.groups = groups;
  }

  @Transactional
  public List<SurveyAssignment> addSelection(Long surveyId, Set<Long> userIds, Set<Long> groupIds, boolean required) {
    if (userIds == null || groupIds == null || userIds.stream().anyMatch(Objects::isNull) || groupIds.stream().anyMatch(Objects::isNull))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid participant selection.");
    var survey = surveys.findForAssignment(surveyId).orElseThrow(() ->
      new ResponseStatusException(HttpStatus.NOT_FOUND, "Survey not found."));
    var selectedIds = new LinkedHashSet<>(userIds);
    for (Long groupId : groupIds) {
      var group = groups.findById(groupId).orElseThrow(() ->
        new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found."));
      group.getMembers().forEach(user -> selectedIds.add(user.getId()));
    }
    var selected = users.findAllById(selectedIds);
    if (selected.size() != selectedIds.size()) throw new ResponseStatusException(
      HttpStatus.BAD_REQUEST, "One or more users no longer exist.");
    var existing = new HashMap<Long, SurveyAssignment>();
    findBySurveyId(surveyId).forEach(assignment -> existing.put(assignment.getUser().getId(), assignment));
    var result = new ArrayList<SurveyAssignment>();
    for (var user : selected) {
      SurveyAssignment assignment = existing.get(user.getId());
      if (assignment == null) {
        assignment = new SurveyAssignment();
        assignment.setSurvey(survey); assignment.setUser(user); assignment.setRequired(required);
        assignment = surveyAssignmentRepository.save(assignment);
      }
      result.add(assignment);
    }
    return result;
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

@Transactional
public void deleteBySurveyId(Long surveyId) {
    surveyAssignmentRepository.deleteBySurveyId(
        surveyId
    );
}  
}
