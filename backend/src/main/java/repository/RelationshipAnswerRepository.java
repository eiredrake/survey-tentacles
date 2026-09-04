package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.RelationshipAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RelationshipAnswerRepository
  extends JpaRepository<RelationshipAnswer, Long>
{
  List<RelationshipAnswer> findByQuestionId(Long questionId);

  List<RelationshipAnswer> findByQuestionIdAndUserId(
    Long questionId,
    Long userId
  );

  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);

  void deleteByQuestionIdAndUserId(Long questionId, Long userId);

  void deleteByQuestionId(Long questionId);
}
