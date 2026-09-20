package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.PointAllocationAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PointAllocationAnswerRepository extends JpaRepository<PointAllocationAnswer, Long> {
  List<PointAllocationAnswer> findByQuestionIdOrderByUserIdAscOptionIdAsc(Long questionId);
  List<PointAllocationAnswer> findByQuestionIdAndUserIdOrderByOptionIdAsc(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionId(Long questionId);
}
