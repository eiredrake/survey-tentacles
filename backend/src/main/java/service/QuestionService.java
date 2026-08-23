package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.repository.QuestionRepository;
import org.springframework.stereotype.Service;

@Service
public class QuestionService {

    private final QuestionRepository questionRepository;

    public QuestionService(QuestionRepository questionRepository) {
        this.questionRepository = questionRepository;
    }

    public Question save(Question question) {
        return questionRepository.save(question);
    }

    public Question findById(Long id) {
        return questionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Question not found: " + id));
    }    

    public void delete(Question question) {
        questionRepository.delete(question);
    }    
}