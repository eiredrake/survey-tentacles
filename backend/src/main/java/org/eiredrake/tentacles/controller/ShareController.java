package org.eiredrake.tentacles.controller;

import org.eiredrake.tentacles.model.Survey;
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

    @Value("${tentacles.public-base-url}")
    private String publicBaseUrl;

    public ShareController(
        SurveyService surveyService
    ) {
        this.surveyService = surveyService;
    }

    @GetMapping(
        value = "/s/{surveyId}",
        produces = MediaType.TEXT_HTML_VALUE
    )
    public ResponseEntity<String> shareSurvey(
        @PathVariable Long surveyId
    ) {
        Survey survey =
            surveyService.findById(surveyId);

        String title =
            HtmlUtils.htmlEscape(
                survey.getTitle()
            );

        String description =
            "Respond to this survey in Tentacles.";

        String shareUrl =
            publicBaseUrl +
            "/s/" +
            surveyId;

        String imageMeta = "";

        System.out.println(
            "SHARE survey " +
            surveyId +
            " image = " +
            survey.getImageFilename()
        );

        if (
            survey.getImageFilename() != null &&
            !survey.getImageFilename().isBlank()
        ) {
            String imageUrl =
                publicBaseUrl +
                "/api/surveys/" +
                surveyId +
                "/image";

            imageMeta = """
                <meta property="og:image"
                      content="%s">
                <meta name="twitter:image"
                      content="%s">
                """.formatted(
                    imageUrl,
                    imageUrl
                );
        }

        String surveyUrl =
            publicBaseUrl +
            "/survey.html?id=" +
            surveyId;

        String html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport"
                      content="width=device-width, initial-scale=1.0">

                <title>%s - Tentacles</title>

                <meta property="og:type" content="website">
                <meta property="og:title" content="%s">
                <meta property="og:description" content="%s">
                <meta property="og:url" content="%s">

                %s

                <meta name="twitter:card"
                      content="summary_large_image">
                <meta name="twitter:title"
                      content="%s">
                <meta name="twitter:description"
                      content="%s">

                <script>
                    window.location.replace("%s");
                </script>
            </head>

            <body>
                <p>
                    Opening survey...
                </p>
            </body>
            </html>
            """.formatted(
                title,
                title,
                description,
                shareUrl,
                imageMeta,
                title,
                description,
                surveyUrl
            );

        return ResponseEntity
            .ok()
            .contentType(MediaType.TEXT_HTML)
            .body(html);
    }
}