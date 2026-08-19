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
import java.time.LocalDate;
import java.util.List;

import org.eiredrake.tentacles.model.SchedulingOption;
import org.eiredrake.tentacles.model.SchedulingQuestion;
import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.service.QuestionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.eiredrake.tentacles.model.SchedulingAnswer;
import org.eiredrake.tentacles.service.SchedulingAnswerService;
import org.eiredrake.tentacles.service.SurveyParticipantService;

@RestController
@RequestMapping("/api/surveys")
public class SurveyController {

    private final SurveyService surveyService;
    private final UserService userService;
    private final QuestionService questionService;
    private final SchedulingAnswerService schedulingAnswerService;
    private final SurveyParticipantService surveyParticipantService;

    public SurveyController(
            SurveyService surveyService,
            UserService userService,
            QuestionService questionService,
            SchedulingAnswerService schedulingAnswerService,
            SurveyParticipantService surveyParticipantService) {
        this.surveyService = surveyService;
        this.userService = userService;
        this.questionService = questionService;
        this.schedulingAnswerService = schedulingAnswerService;
        this.surveyParticipantService = surveyParticipantService;
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
        return surveyService.findAll().stream()
            .map(survey -> Map.of(
                "id", survey.getId(),
                "title", survey.getTitle(),
                "creatorId", survey.getCreator().getId(),
                "creatorName", survey.getCreator().getDisplayName(),
                "questionCount", survey.getQuestions().size()
            ))
            .toList();
    }  

    @PostMapping("/{surveyId}/questions/scheduling")
    public Map<String, Object> createSchedulingQuestion(
            @PathVariable Long surveyId,
            @RequestBody Map<String, Object> request) {

        Survey survey = surveyService.findById(surveyId);

        SchedulingQuestion question = new SchedulingQuestion();
        question.setSurvey(survey);
        question.setPrompt((String) request.get("prompt"));
        question.setDisplayOrder((Integer) request.get("displayOrder"));

        @SuppressWarnings("unchecked")
        List<String> dates = (List<String>) request.get("dates");

        for (String date : dates) {
            SchedulingOption option = new SchedulingOption();
            option.setQuestion(question);
            option.setDate(LocalDate.parse(date));
            question.getOptions().add(option);
        }

        question = (SchedulingQuestion) questionService.save(question);

        return Map.of(
            "id", question.getId(),
            "prompt", question.getPrompt(),
            "optionCount", question.getOptions().size()
        );
    }

    @GetMapping("/{surveyId}/questions/{questionId}")
    public Map<String, Object> getQuestion(
            @PathVariable Long surveyId,
            @PathVariable Long questionId) {

        SchedulingQuestion question =
            (SchedulingQuestion) questionService.findById(questionId);

        List<Map<String, Object>> options = question.getOptions().stream()
            .map(option -> Map.<String, Object>of(
                "id", option.getId(),
                "date", option.getDate()
            ))
            .toList();

        return Map.of(
            "id", question.getId(),
            "prompt", question.getPrompt(),
            "displayOrder", question.getDisplayOrder(),
            "options", options
        );
    }    

    @PostMapping("/{surveyId}/questions/{questionId}/answers/scheduling")
    public Map<String, Object> answerSchedulingQuestion(
            @PathVariable Long surveyId,
            @PathVariable Long questionId,
            @AuthenticationPrincipal OidcUser oidcUser,
            @RequestBody Map<String, Object> request) {

        SchedulingQuestion question =
            (SchedulingQuestion) questionService.findById(questionId);

        User user = userService.findOrCreate(oidcUser);
        Survey survey = surveyService.findById(surveyId);
        surveyParticipantService.add(survey, user);        

        schedulingAnswerService.deleteForUserAndQuestion(
            question.getId(),
            user.getId()
        );        

        @SuppressWarnings("unchecked")
        List<Integer> optionIds = (List<Integer>) request.get("optionIds");

        int saved = 0;

        for (Integer optionId : optionIds) {
            SchedulingOption option =
                schedulingAnswerService.findOptionById(optionId.longValue());

            if (!option.getQuestion().getId().equals(question.getId())) {
                throw new IllegalArgumentException(
                    "Option does not belong to question: " + questionId);
            }

            SchedulingAnswer answer = new SchedulingAnswer();
            answer.setQuestion(question);
            answer.setUser(user);
            answer.setOption(option);

            schedulingAnswerService.save(answer);
            saved++;
        }

        return Map.of(
            "questionId", question.getId(),
            "userId", user.getId(),
            "selectedCount", saved
        );
    }    

    @GetMapping("/{surveyId}/questions/{questionId}/answers/scheduling")
    public List<Map<String, Object>> getSchedulingAnswers(
            @PathVariable Long surveyId,
            @PathVariable Long questionId) {

        return schedulingAnswerService.findByQuestionId(questionId).stream()
            .map(answer -> Map.<String, Object>of(
                "answerId", answer.getId(),
                "userId", answer.getUser().getId(),
                "username", answer.getUser().getUsername(),
                "optionId", answer.getOption().getId(),
                "date", answer.getOption().getDate()
            ))
            .toList();
    }    

    @GetMapping("/{surveyId}/questions/{questionId}/results")
    public List<Map<String, Object>> getSchedulingResults(
            @PathVariable Long surveyId,
            @PathVariable Long questionId) {

        SchedulingQuestion question =
            (SchedulingQuestion) questionService.findById(questionId);

        return question.getOptions().stream()
            .map(option -> Map.<String, Object>of(
                "optionId", option.getId(),
                "date", option.getDate(),
                "votes", schedulingAnswerService.countByOptionId(option.getId())
            ))
            .sorted((a, b) ->
                Long.compare(
                    (Long) b.get("votes"),
                    (Long) a.get("votes")
                ))
            .toList();
    }    

    @GetMapping("/{surveyId}/participants")
    public List<Map<String, Object>> getParticipants(
            @PathVariable Long surveyId) {

        return surveyParticipantService.findBySurveyId(surveyId).stream()
            .map(participant -> Map.<String, Object>of(
                "userId", participant.getUser().getId(),
                "username", participant.getUser().getUsername(),
                "name", participant.getUser().getDisplayName()
            ))
            .toList();
    }    

    @GetMapping("/{surveyId}/questions/{questionId}/participation")
    public List<Map<String, Object>> getSchedulingParticipation(
            @PathVariable Long surveyId,
            @PathVariable Long questionId) {

        return surveyParticipantService.findBySurveyId(surveyId).stream()
            .map(participant -> {
                User user = participant.getUser();

                return Map.<String, Object>of(
                    "userId", user.getId(),
                    "username", user.getUsername(),
                    "name", user.getDisplayName(),
                    "answered", schedulingAnswerService.hasAnswered(
                        questionId,
                        user.getId()
                    )
                );
            })
            .toList();
    }  

    @PostMapping("/{surveyId}/participants")
    public Map<String, Object> addParticipant(
            @PathVariable Long surveyId,
            @RequestBody Map<String, String> request) {

        Survey survey = surveyService.findById(surveyId);
        User user = userService.findByUsername(request.get("username"));

        surveyParticipantService.add(survey, user);

        return Map.of(
            "userId", user.getId(),
            "username", user.getUsername(),
            "name", user.getDisplayName()
        );
    }      
}