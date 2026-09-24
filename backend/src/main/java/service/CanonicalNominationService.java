package org.eiredrake.tentacles.service;

import java.util.List;
import java.util.Locale;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.eiredrake.tentacles.model.CanonicalNomination;
import org.eiredrake.tentacles.model.NominationAnswer;
import org.eiredrake.tentacles.model.NominationQuestion;
import org.eiredrake.tentacles.repository.CanonicalNominationRepository;
import org.springframework.stereotype.Service;

@Service
public class CanonicalNominationService {
  private final CanonicalNominationRepository repository;
  private final NominationAnswerService answers;
  @PersistenceContext private EntityManager entityManager;

  public CanonicalNominationService(CanonicalNominationRepository repository, NominationAnswerService answers) {
    this.repository = repository; this.answers = answers;
  }

  public CanonicalNomination save(CanonicalNomination nomination) { return repository.save(nomination); }
  public CanonicalNomination findById(Long id) {
    return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Canonical nomination not found."));
  }
  public List<CanonicalNomination> findByQuestionId(Long questionId) {
    return repository.findByQuestionIdOrderByIdAsc(questionId);
  }

  public String normalize(String value) {
    return value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
  }

  public CanonicalNomination resolve(NominationQuestion question, String submitted) {
    entityManager.find(NominationQuestion.class, question.getId(), LockModeType.PESSIMISTIC_WRITE);
    String normalized = normalize(submitted);
    for (CanonicalNomination value : findByQuestionId(question.getId())) {
      if (normalize(value.getDisplayName()).equals(normalized)) return value;
    }
    List<NominationAnswer> raw = answers.findByQuestionId(question.getId());
    NominationAnswer match = raw.stream().filter(answer -> normalize(answer.getNomination()).equals(normalized))
      .findFirst().orElse(null);
    if (match != null && match.getCanonicalNomination() != null) return match.getCanonicalNomination();
    CanonicalNomination value = new CanonicalNomination();
    value.setQuestion(question);
    value.setDisplayName(match == null ? submitted : match.getNomination());
    value = save(value);
    for (NominationAnswer answer : raw) {
      if (answer.getCanonicalNomination() == null && normalize(answer.getNomination()).equals(normalized)) {
        answer.setCanonicalNomination(value); answers.save(answer);
      }
    }
    return value;
  }
}
