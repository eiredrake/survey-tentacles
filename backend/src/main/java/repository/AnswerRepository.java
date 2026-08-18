package org.eiredrake.tentacles.repository;

import org.eiredrake.tentacles.model.Answer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnswerRepository extends JpaRepository<Answer, Long> {
}