package org.eiredrake.tentacles.service;

import java.util.List;
import org.eiredrake.tentacles.model.NominationAnswer;
import org.eiredrake.tentacles.repository.NominationAnswerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NominationAnswerService {
  private final NominationAnswerRepository repository;

  public NominationAnswerService(NominationAnswerRepository repository) {
    this.repository = repository;
  }

  public NominationAnswer save(NominationAnswer answer) {
    return repository.save(answer);
  }

  public List<NominationAnswer> findByQuestionId(Long questionId) {
    return repository.findByQuestionIdOrderByIdAsc(questionId);
  }

  public List<NominationAnswer> findByQuestionIdAndUserId(Long questionId, Long userId) {
    return repository.findByQuestionIdAndUserIdOrderByIdAsc(questionId, userId);
  }

  public boolean hasAnswered(Long questionId, Long userId) {
    return repository.existsByQuestionIdAndUserId(questionId, userId);
  }

  @Transactional
  public void deleteForUserAndQuestion(Long questionId, Long userId) {
    repository.deleteByQuestionIdAndUserId(questionId, userId);
    repository.flush();
  }

  @Transactional
  public void deleteForQuestion(Long questionId) {
    repository.deleteByQuestionId(questionId);
    repository.flush();
  }
}
