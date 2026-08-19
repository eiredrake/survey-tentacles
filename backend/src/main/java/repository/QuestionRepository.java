package org.eiredrake.tentacles.repository;

import java.util.List;

import org.eiredrake.tentacles.model.Question;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    List<Question> findBySurveyIdOrderByDisplayOrder(Long surveyId);
}