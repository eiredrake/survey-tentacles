package org.eiredrake.tentacles.service;

import java.util.List;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.repository.SurveyRepository;
import org.springframework.stereotype.Service;

@Service
public class SurveyService {

    private final SurveyRepository surveyRepository;

    public SurveyService(SurveyRepository surveyRepository) {
        this.surveyRepository = surveyRepository;
    }

    public Survey save(Survey survey) {
        return surveyRepository.save(survey);
    }

    public List<Survey> findAll() {
        return surveyRepository.findAll();
    }

    public Survey findById(Long id) {
        return surveyRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Survey not found: " + id));
    }    
}