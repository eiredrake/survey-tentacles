package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.NominationAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NominationAnswerRepository extends JpaRepository<NominationAnswer, Long> {
  List<NominationAnswer> findByQuestionIdOrderByIdAsc(Long questionId);
  List<NominationAnswer> findByQuestionIdAndUserIdOrderByIdAsc(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionId(Long questionId);
}
