package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.ShortTextAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShortTextAnswerRepository
  extends JpaRepository<ShortTextAnswer, Long>
{
  List<ShortTextAnswer> findByQuestionId(Long questionId);

  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);

  void deleteByQuestionIdAndUserId(Long questionId, Long userId);

  List<ShortTextAnswer> findByQuestionIdAndUserId(Long questionId, Long userId);
}
