package org.eiredrake.tentacles.service;

import java.util.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class ParticipantGroupService {
  private final ParticipantGroupRepository groups;
  private final UserRepository users;
  public ParticipantGroupService(ParticipantGroupRepository groups, UserRepository users) {
    this.groups = groups; this.users = users;
  }
  public record GroupRequest(String name, Set<Long> userIds) {}
  public record GroupView(Long id, String name, List<Long> userIds) {}

  private GroupView view(ParticipantGroup group) {
    return new GroupView(group.getId(), group.getName(), group.getMembers().stream().map(User::getId).sorted().toList());
  }
  @Transactional(readOnly = true)
  public List<GroupView> list() {
    return groups.findAll().stream().sorted(Comparator.comparing(ParticipantGroup::getName, String.CASE_INSENSITIVE_ORDER))
      .map(this::view).toList();
  }
  public GroupView save(Long id, GroupRequest request) {
    String name = request.name() == null ? "" : request.name().trim();
    if (name.isEmpty() || name.length() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group name must be 1–100 characters.");
    if (request.userIds() == null || request.userIds().stream().anyMatch(Objects::isNull)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose valid users.");
    ParticipantGroup group = id == null ? new ParticipantGroup() : find(id);
    if (groups.existsByNameKeyAndIdNot(name.toLowerCase(Locale.ROOT), id == null ? -1L : id))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A group with this name already exists.");
    List<User> members = users.findAllById(request.userIds());
    if (members.size() != request.userIds().size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more users no longer exist.");
    group.setName(name);
    group.getMembers().clear();
    group.getMembers().addAll(members);
    return view(groups.saveAndFlush(group));
  }
  private ParticipantGroup find(Long id) {
    return groups.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found."));
  }
  public void delete(Long id) { groups.delete(find(id)); }
}
