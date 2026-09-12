package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.SingleSelectAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SingleSelectAnswerRepository extends JpaRepository<SingleSelectAnswer, Long> {
  List<SingleSelectAnswer> findByQuestionId(Long questionId);
  List<SingleSelectAnswer> findByQuestionIdAndUserId(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionId(Long questionId);
}
