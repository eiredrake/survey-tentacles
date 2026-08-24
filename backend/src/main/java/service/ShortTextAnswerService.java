package org.eiredrake.tentacles.service;

import java.util.List;
import org.eiredrake.tentacles.model.ShortTextAnswer;
import org.eiredrake.tentacles.repository.ShortTextAnswerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShortTextAnswerService {

  private final ShortTextAnswerRepository shortTextAnswerRepository;

  public ShortTextAnswerService(
    ShortTextAnswerRepository shortTextAnswerRepository
  ) {
    this.shortTextAnswerRepository = shortTextAnswerRepository;
  }

  public ShortTextAnswer save(ShortTextAnswer answer) {
    return shortTextAnswerRepository.save(answer);
  }

  public List<ShortTextAnswer> findByQuestionId(Long questionId) {
    return shortTextAnswerRepository.findByQuestionId(questionId);
  }

  public boolean hasAnswered(Long questionId, Long userId) {
    return shortTextAnswerRepository.existsByQuestionIdAndUserId(
      questionId,
      userId
    );
  }

  @Transactional
  public void deleteForUserAndQuestion(Long questionId, Long userId) {
    shortTextAnswerRepository.deleteByQuestionIdAndUserId(questionId, userId);
  }
}
