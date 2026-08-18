package org.eiredrake.tentacles.controller;

import java.util.Map;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

    private final SurveyService surveyService;
    private final UserService userService;

    public SurveyController(
            SurveyService surveyService,
            UserService userService) {
        this.surveyService = surveyService;
        this.userService = userService;
    }

    @PostMapping
    public Map<String, Object> createSurvey(
            @AuthenticationPrincipal OidcUser oidcUser,
            @RequestBody Map<String, String> request) {

        User creator = userService.findOrCreate(oidcUser);

        Survey survey = new Survey();
        survey.setTitle(request.get("title"));
        survey.setCreator(creator);

        survey = surveyService.save(survey);

        return Map.of(
            "id", survey.getId(),
            "title", survey.getTitle(),
            "creatorId", creator.getId()
        );
    }

    @GetMapping
    public Object listSurveys() {
        return surveyService.findAll();
    }    
}