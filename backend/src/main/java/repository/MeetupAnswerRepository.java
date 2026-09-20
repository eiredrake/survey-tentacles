package org.eiredrake.tentacles.repository;

import java.util.List;
import org.eiredrake.tentacles.model.MeetupAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MeetupAnswerRepository extends JpaRepository<MeetupAnswer, Long> {
  List<MeetupAnswer> findByQuestionIdAndUserIdOrderByDateTimeAsc(Long questionId, Long userId);
  boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
  void deleteByQuestionIdAndUserId(Long questionId, Long userId);

  @Query("select a from MeetupAnswer a join fetch a.user where a.question.id = :questionId")
  List<MeetupAnswer> findAvailability(@Param("questionId") Long questionId);
}
