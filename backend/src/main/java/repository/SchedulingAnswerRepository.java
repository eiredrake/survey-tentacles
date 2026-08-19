package org.eiredrake.tentacles.repository;

import java.util.List;

import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchedulingAnswerRepository extends JpaRepository<SchedulingAnswer, Long> {

    void deleteByQuestionIdAndUserId(Long questionId, Long userId);

    List<SchedulingAnswer> findByQuestionId(Long questionId);

    long countByOptionId(Long optionId);

    boolean existsByQuestionIdAndUserId(Long questionId, Long userId);
}