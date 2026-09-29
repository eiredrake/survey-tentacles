package org.eiredrake.tentacles.service;

import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

@Service
public class ShareDocumentService {
  // Callers supply trusted application markup; all metadata is escaped here.
  public String render(String title, String description, String url, String imageUrl, String head, String body) {
    String image = imageUrl == null || imageUrl.isBlank() ? "" : """
      <meta property="og:image" content="%s">
      <meta name="twitter:image" content="%s">
      """.formatted(escape(imageUrl), escape(imageUrl));
    return """
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>%s - Tentacles</title>
        <meta property="og:type" content="website">
        <meta property="og:title" content="%s">
        <meta property="og:description" content="%s">
        <meta property="og:url" content="%s">
        %s
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="%s">
        <meta name="twitter:description" content="%s">
        %s
      </head>
      <body>%s</body>
      </html>
      """.formatted(escape(title), escape(title), escape(description), escape(url), image,
        escape(title), escape(description), head, body);
  }

  private String escape(String value) { return HtmlUtils.htmlEscape(value == null ? "" : value); }
}
