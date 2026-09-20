package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.RankedChoiceAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RankedChoiceAnswerRepository extends JpaRepository<RankedChoiceAnswer, Long> {
  List<RankedChoiceAnswer> findByQuestionIdOrderByUserIdAscPreferenceRankAsc(Long questionId);
  List<RankedChoiceAnswer> findByQuestionIdAndUserIdOrderByPreferenceRankAsc(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionId(Long questionId);
}
