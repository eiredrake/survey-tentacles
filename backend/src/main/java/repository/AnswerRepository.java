package org.eiredrake.tentacles.repository;

import org.eiredrake.tentacles.model.Answer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.eiredrake.tentacles.model.User;
import java.util.List;

public interface AnswerRepository extends JpaRepository<Answer, Long> {
    @Query("select distinct a.user from Answer a where a.question.survey.id = :surveyId")
    List<User> findRespondentsBySurveyId(@Param("surveyId") Long surveyId);

    @Query("select count(distinct a.user.id) from Answer a where a.question.survey.id = :surveyId")
    long countRespondentsBySurveyId(@Param("surveyId") Long surveyId);
}