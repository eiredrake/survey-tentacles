package org.eiredrake.tentacles.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.eiredrake.tentacles.model.PromotionalPage;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.PromotionalPageService;
import org.eiredrake.tentacles.service.ShareDocumentService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.util.HtmlUtils;

@Controller
public class PromotionalPageController {
  private final PromotionalPageService pages;
  private final UserService users;
  private final ShareDocumentService documents;
  @Value("${tentacles.public-base-url}") private String publicBaseUrl;

  public PromotionalPageController(PromotionalPageService pages, UserService users, ShareDocumentService documents) {
    this.pages = pages; this.users = users; this.documents = documents;
  }

  @GetMapping(value = "/p/{slug}", produces = MediaType.TEXT_HTML_VALUE)
  public ResponseEntity<String> page(@PathVariable String slug, @AuthenticationPrincipal OidcUser oidcUser, HttpServletRequest request) {
    User user = oidcUser == null ? null : users.findOrCreate(oidcUser);
    // Spring's configured forwarded-header support owns proxy address handling.
    PromotionalPage page = pages.visit(slug, user, request.getRemoteAddr());
    if (page == null) {
      String destination = pages.findBySlug(slug).getExpiredDestination();
      return destination == null ? ResponseEntity.notFound().build()
        : ResponseEntity.status(HttpStatus.FOUND).header("Location", destination).build();
    }
    String title = HtmlUtils.htmlEscape(page.getTitle());
    String tagline = HtmlUtils.htmlEscape(page.getTagline() == null ? "" : page.getTagline());
    String content = HtmlUtils.htmlEscape(page.getContent()).replace("\n", "<br>");
    String imageUrl = page.getImageFilename() == null ? null : publicBaseUrl + "/api/promotional-pages/" + page.getId() + "/image";
    String image = imageUrl == null ? "" : "<img style=\"max-width:100%\" alt=\"\" src=\"" + HtmlUtils.htmlEscape(imageUrl) + "\">";
    String body = "<main><h1>" + title + "</h1><p>" + tagline + "</p>" + image + "<p>" + content
      + "</p></main><script src=\"/js/app-footer.js\"></script>";
    return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(documents.render(page.getTitle(), page.getTagline(),
      pages.publicUrl(page), imageUrl, "<link rel=\"stylesheet\" href=\"/css/tentacles.css\">", body));
  }
}
