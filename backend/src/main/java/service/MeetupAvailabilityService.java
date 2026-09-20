package org.eiredrake.tentacles.service;

import java.time.Instant;
import java.util.*;
import org.eiredrake.tentacles.model.MeetupAnswer;
import org.eiredrake.tentacles.repository.MeetupAnswerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MeetupAvailabilityService {
  private final MeetupAnswerRepository answers;
  public MeetupAvailabilityService(MeetupAnswerRepository answers) { this.answers = answers; }

  public record Result(Instant dateTime, Instant endDateTime, long votes) {}

  // Windows include their start and exclude their end. Merely touching windows do not overlap.
  private Set<Long> availableUsers(List<MeetupAnswer> entries, Instant time, boolean includePoints) {
    Set<Long> users = new HashSet<>();
    for (MeetupAnswer entry : entries) {
      boolean available = entry.getEndDateTime() == null
        ? includePoints && entry.getDateTime().equals(time)
        : !entry.getDateTime().isAfter(time) && entry.getEndDateTime().isAfter(time);
      if (available) users.add(entry.getUser().getId());
    }
    return users;
  }

  @Transactional(readOnly = true)
  public List<Result> results(Long questionId) {
    List<MeetupAnswer> entries = answers.findAvailability(questionId);
    TreeSet<Instant> boundaries = new TreeSet<>(), points = new TreeSet<>();
    for (MeetupAnswer entry : entries) {
      if (entry.getEndDateTime() == null) points.add(entry.getDateTime());
      else { boundaries.add(entry.getDateTime()); boundaries.add(entry.getEndDateTime()); }
    }
    List<Result> results = new ArrayList<>();
    List<Instant> times = new ArrayList<>(boundaries);
    Set<Long> previousUsers = Set.of();
    for (int i = 0; i + 1 < times.size(); i++) {
      Instant start = times.get(i), end = times.get(i + 1);
      Set<Long> users = availableUsers(entries, start, false);
      if (!users.isEmpty()) {
        if (users.equals(previousUsers) && !results.isEmpty() && results.getLast().endDateTime().equals(start)) {
          Result previous = results.removeLast();
          results.add(new Result(previous.dateTime(), end, users.size()));
        } else results.add(new Result(start, end, users.size()));
      }
      previousUsers = users;
    }
    for (Instant point : points) results.add(new Result(point, null, availableUsers(entries, point, true).size()));
    results.sort(Comparator.comparingLong(Result::votes).reversed().thenComparing(Result::dateTime)
      .thenComparing(Result::endDateTime, Comparator.nullsFirst(Comparator.naturalOrder())));
    return results;
  }
}
