package org.eiredrake.tentacles.service;

import java.util.List;

import org.eiredrake.tentacles.model.RelationshipAnswer;
import org.eiredrake.tentacles.model.RelationshipSubject;
import org.eiredrake.tentacles.repository.RelationshipAnswerRepository;
import org.eiredrake.tentacles.repository.RelationshipSubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RelationshipAnswerService {

    private final RelationshipAnswerRepository relationshipAnswerRepository;
    private final RelationshipSubjectRepository relationshipSubjectRepository;

    public RelationshipAnswerService(
        RelationshipAnswerRepository relationshipAnswerRepository,
        RelationshipSubjectRepository relationshipSubjectRepository
    ) {
        this.relationshipAnswerRepository = relationshipAnswerRepository;
        this.relationshipSubjectRepository = relationshipSubjectRepository;
    }

    public RelationshipAnswer save(RelationshipAnswer answer) {
        return relationshipAnswerRepository.save(answer);
    }

    public RelationshipSubject findSubjectById(Long id) {
        return relationshipSubjectRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException(
                "Relationship subject not found: " + id
            ));
    }

    public List<RelationshipAnswer> findByQuestionId(Long questionId) {
        return relationshipAnswerRepository.findByQuestionId(questionId);
    }

    public List<RelationshipAnswer> findByQuestionIdAndUserId(
        Long questionId,
        Long userId
    ) {
        return relationshipAnswerRepository.findByQuestionIdAndUserId(
            questionId,
            userId
        );
    }

    public boolean hasAnswered(Long questionId, Long userId) {
        return relationshipAnswerRepository.existsByQuestionIdAndUserId(
            questionId,
            userId
        );
    }

    @Transactional
    public void deleteForUserAndQuestion(Long questionId, Long userId) {
        relationshipAnswerRepository.deleteByQuestionIdAndUserId(
            questionId,
            userId
        );
    }

    @Transactional
    public void deleteForQuestion(Long questionId) {
      relationshipAnswerRepository.deleteByQuestionId(questionId);
    }
}