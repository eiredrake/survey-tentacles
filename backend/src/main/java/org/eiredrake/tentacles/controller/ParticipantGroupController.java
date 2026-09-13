package org.eiredrake.tentacles.controller;

import java.util.List;
import java.util.Map;
import java.util.Set;
import org.eiredrake.tentacles.service.ParticipantGroupService;
import org.eiredrake.tentacles.service.ParticipantGroupService.*;
import org.eiredrake.tentacles.service.SurveyAssignmentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class ParticipantGroupController {
  private final ParticipantGroupService groups;
  private final SurveyAssignmentService assignments;
  public ParticipantGroupController(ParticipantGroupService groups, SurveyAssignmentService assignments) {
    this.groups = groups; this.assignments = assignments;
  }
  @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
  public ResponseEntity<Map<String, String>> conflict() {
    return ResponseEntity.status(409).body(Map.of("message", "Group name or membership conflicts with another change. Reload and try again."));
  }
  @GetMapping("/api/participant-groups")
  public List<GroupView> list() { return groups.list(); }
  @PostMapping("/api/participant-groups")
  public GroupView create(@RequestBody GroupRequest request) { return groups.save(null, request); }
  @PutMapping("/api/participant-groups/{id}")
  public GroupView update(@PathVariable Long id, @RequestBody GroupRequest request) { return groups.save(id, request); }
  @DeleteMapping("/api/participant-groups/{id}")
  public ResponseEntity<Void> delete(@PathVariable Long id) { groups.delete(id); return ResponseEntity.noContent().build(); }
  public record Selection(Set<Long> userIds, Set<Long> groupIds, boolean required) {}
  @PostMapping("/api/surveys/{surveyId}/assignments/batch")
  public Map<String, Object> add(@PathVariable Long surveyId, @RequestBody Selection selection) {
    var result = assignments.addSelection(surveyId, selection.userIds(), selection.groupIds(), selection.required());
    return Map.of("userIds", result.stream().map(assignment -> assignment.getUser().getId()).toList());
  }
}
