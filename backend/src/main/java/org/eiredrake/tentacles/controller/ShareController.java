package org.eiredrake.tentacles.controller;

import org.eiredrake.tentacles.model.Survey;
import org.eiredrake.tentacles.service.ShareDocumentService;
import org.eiredrake.tentacles.service.SurveyService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.util.HtmlUtils;

@Controller
public class ShareController {
    private final SurveyService surveyService;
    private final ShareDocumentService documents;

    @Value("${tentacles.public-base-url}")
    private String publicBaseUrl;

    public ShareController(SurveyService surveyService, ShareDocumentService documents) {
        this.surveyService = surveyService;
        this.documents = documents;
    }

    @GetMapping(value = "/s/{surveyId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> shareSurvey(@PathVariable Long surveyId) {
        Survey survey = surveyService.findById(surveyId);
        String description = survey.getTagline() == null || survey.getTagline().isBlank()
            ? "Respond to this survey in Tentacles." : survey.getTagline();
        String imageUrl = survey.getImageFilename() == null || survey.getImageFilename().isBlank()
            ? null : publicBaseUrl + "/api/surveys/" + surveyId + "/image";
        String surveyUrl = HtmlUtils.htmlEscape(publicBaseUrl + "/survey.html?id=" + surveyId);
        String head = """
            <link id="survey-destination" href="%s">
            <script>window.location.replace(document.getElementById('survey-destination').href);</script>
            """.formatted(surveyUrl);
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(documents.render(survey.getTitle(), description,
            publicBaseUrl + "/s/" + surveyId, imageUrl, head, "<p>Opening survey...</p>"));
    }
}
