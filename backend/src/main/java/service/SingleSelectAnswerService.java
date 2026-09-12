package org.eiredrake.tentacles.service;

import java.util.List;
import org.eiredrake.tentacles.model.SingleSelectAnswer;
import org.eiredrake.tentacles.repository.SingleSelectAnswerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SingleSelectAnswerService {
  private final SingleSelectAnswerRepository repository;

  public SingleSelectAnswerService(SingleSelectAnswerRepository repository) {
    this.repository = repository;
  }

  public SingleSelectAnswer save(SingleSelectAnswer answer) {
    return repository.save(answer);
  }

  public List<SingleSelectAnswer> findByQuestionId(Long questionId) {
    return repository.findByQuestionId(questionId);
  }

  public List<SingleSelectAnswer> findByQuestionIdAndUserId(Long questionId, Long userId) {
    return repository.findByQuestionIdAndUserId(questionId, userId);
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
