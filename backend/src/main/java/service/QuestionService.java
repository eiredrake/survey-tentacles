package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.Question;
import org.eiredrake.tentacles.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuestionService {

    private final QuestionRepository questionRepository;

    private final ImageAttachmentService attachments;

    public QuestionService(QuestionRepository questionRepository, ImageAttachmentService attachments) {
        this.attachments = attachments;
        this.questionRepository = questionRepository;
    }

    public Question save(Question question) {
        return questionRepository.save(question);
    }

    public Question findById(Long id) {
        return questionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Question not found: " + id));
    }    

    @Transactional
    public void delete(Question question) {
        attachments.removeQuestion(question.getId());
        questionRepository.delete(question);
    }    
}