package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.MultiSelectAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MultiSelectAnswerRepository extends JpaRepository<MultiSelectAnswer, Long> {
  List<MultiSelectAnswer> findByQuestionId(Long questionId);
  List<MultiSelectAnswer> findByQuestionIdAndUserId(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionId(Long questionId);
}
