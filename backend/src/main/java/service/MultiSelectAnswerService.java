package org.eiredrake.tentacles.service;

import java.util.List;
import org.eiredrake.tentacles.model.MultiSelectAnswer;
import org.eiredrake.tentacles.repository.MultiSelectAnswerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MultiSelectAnswerService {
  private final MultiSelectAnswerRepository repository;

  public MultiSelectAnswerService(MultiSelectAnswerRepository repository) {
    this.repository = repository;
  }

  public MultiSelectAnswer save(MultiSelectAnswer answer) {
    return repository.save(answer);
  }

  public List<MultiSelectAnswer> findByQuestionId(Long questionId) {
    return repository.findByQuestionId(questionId);
  }

  public List<MultiSelectAnswer> findByQuestionIdAndUserId(Long questionId, Long userId) {
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
