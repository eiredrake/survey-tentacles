package org.eiredrake.tentacles.service;

import java.util.List;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.repository.SurveyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SurveyService {

    private final SurveyRepository surveyRepository;

    private final ImageAttachmentService attachments;

    public SurveyService(SurveyRepository surveyRepository, ImageAttachmentService attachments) {
        this.attachments = attachments;
        this.surveyRepository = surveyRepository;
    }

    public Survey save(Survey survey) {
        return surveyRepository.save(survey);
    }

    @Transactional
    public void delete(Survey survey) {
        attachments.removeSurvey(survey.getId());
        surveyRepository.delete(survey);
    }

    public List<Survey> findAll() {
        return surveyRepository.findAll();
    }

    public Survey findById(Long id) {
        return surveyRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Survey not found: " + id));
    }    
}