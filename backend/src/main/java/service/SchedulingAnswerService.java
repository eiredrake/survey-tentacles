package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.eiredrake.tentacles.repository.SchedulingAnswerRepository;
import org.springframework.stereotype.Service;
import org.eiredrake.tentacles.model.SchedulingOption;
import org.eiredrake.tentacles.repository.SchedulingOptionRepository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class SchedulingAnswerService {

    private final SchedulingAnswerRepository schedulingAnswerRepository;
    private final SchedulingOptionRepository schedulingOptionRepository;

    public SchedulingAnswerService(
            SchedulingAnswerRepository schedulingAnswerRepository,
            SchedulingOptionRepository schedulingOptionRepository) {
        this.schedulingAnswerRepository = schedulingAnswerRepository;
        this.schedulingOptionRepository = schedulingOptionRepository;
    }

    public SchedulingAnswer save(SchedulingAnswer answer) {
        return schedulingAnswerRepository.save(answer);
    }

    public SchedulingOption findOptionById(Long id) {
        return schedulingOptionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException(
                "Scheduling option not found: " + id));
    }    

    @Transactional
    public void deleteForUserAndQuestion(Long questionId, Long userId) {
        schedulingAnswerRepository.deleteByQuestionIdAndUserId(questionId, userId);
    }  

    @Transactional
    public void deleteForQuestion(Long questionId) {
        schedulingAnswerRepository.deleteByQuestionId(questionId);
    }    

    public List<SchedulingAnswer> findByQuestionId(Long questionId) {
        return schedulingAnswerRepository.findByQuestionId(questionId);
    }   

    public long countByOptionId(Long optionId) {
        return schedulingAnswerRepository.countByOptionId(optionId);
    }  

    public boolean hasAnswered(Long questionId, Long userId) {
        return schedulingAnswerRepository.existsByQuestionIdAndUserId(
            questionId,
            userId
        );
    }         
}