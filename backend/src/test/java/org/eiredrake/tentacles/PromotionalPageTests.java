package org.eiredrake.tentacles;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PromotionalPageTests {
  @Autowired MockMvc mvc;
  @Autowired EntityManager em;
  @Autowired PromotionalPageService pages;
  @Autowired UserService users;
  @Autowired SurveyImageService images;
  PromotionalPage page;

  @BeforeEach void setup() {
    page = new PromotionalPage();
    page.setSlug("promo-" + UUID.randomUUID()); page.setTitle("Welcome");
    page.setTagline("Join us"); page.setContent("Plain text");
    page = pages.save(page);
  }

  OidcUser principal(String subject) {
    return new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")),
      new OidcIdToken("test", Instant.now(), Instant.now().plusSeconds(3600),
        Map.of("sub", subject, "preferred_username", "promo-user", "name", "Promo User")));
  }

  @Test void publicDocumentEscapesContentAndIncludesSharedMetadataAndFooter() throws Exception {
    page.setTitle("<script>Title</script>"); page.setTagline("Quoted \"tag\" & more");
    page.setContent("<b>Plain</b>\nNext"); page.setImageFilename("card.png"); pages.save(page);
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isOk())
      .andExpect(content().string(containsString("&lt;script&gt;Title&lt;/script&gt;")))
      .andExpect(content().string(containsString("Quoted &quot;tag&quot; &amp; more")))
      .andExpect(content().string(containsString("&lt;b&gt;Plain&lt;/b&gt;<br>Next")))
      .andExpect(content().string(containsString("property=\"og:url\"")))
      .andExpect(content().string(containsString("name=\"twitter:image\"")))
      .andExpect(content().string(containsString("/api/promotional-pages/" + page.getId() + "/image")))
      .andExpect(content().string(containsString("/js/app-footer.js")));
    assertEquals(1, pages.uniqueVisitors(page.getId()));
    for (String resource : List.of("/css/tentacles.css", "/js/app-footer.js", "/app-version.json"))
      mvc.perform(get(resource)).andExpect(status().isOk());
  }

  @Test void repeatedAnonymousAddressesAndOidcIdentitiesCountSeparately() throws Exception {
    mvc.perform(get("/p/" + page.getSlug()).with(r -> { r.setRemoteAddr("192.0.2.1"); return r; })).andExpect(status().isOk());
    mvc.perform(get("/p/" + page.getSlug()).with(r -> { r.setRemoteAddr("192.0.2.1"); return r; })).andExpect(status().isOk());
    mvc.perform(get("/p/" + page.getSlug()).with(r -> { r.setRemoteAddr("192.0.2.2"); return r; })).andExpect(status().isOk());
    OidcUser first = principal(UUID.randomUUID().toString());
    for (String ip : List.of("192.0.2.1", "192.0.2.3"))
      mvc.perform(get("/p/" + page.getSlug()).with(oidcLogin().oidcUser(first))
        .with(r -> { r.setRemoteAddr(ip); return r; })).andExpect(status().isOk());
    mvc.perform(get("/p/" + page.getSlug()).with(oidcLogin().oidcUser(principal(UUID.randomUUID().toString())))
      .with(r -> { r.setRemoteAddr("192.0.2.1"); return r; })).andExpect(status().isOk());
    assertEquals(6, pages.findById(page.getId()).getTotalViews());
    var visitors = pages.visitors(page.getId());
    assertEquals(4, visitors.size());
    assertEquals(2, visitors.stream().filter(v -> v.getUser() != null && v.getAnonymousIp() == null).count());
    assertEquals(2, visitors.stream().filter(v -> v.getViewCount() == 2).count());
    assertTrue(visitors.stream().allMatch(v -> !v.getLastVisitedAt().isBefore(v.getFirstVisitedAt())));
  }

  @Test void dateExpiryIsInclusiveAndDoesNotCountAndFallbackIsInternal() throws Exception {
    Instant boundary = Instant.now().minusSeconds(1);
    page.setExpiresAt(boundary);
    assertFalse(pages.isExpired(page, boundary.minusNanos(1)));
    assertTrue(pages.isExpired(page, boundary));
    page.setExpiredDestination("/admin/index.html"); pages.save(page);
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isFound()).andExpect(header().string("Location", "/admin/index.html"));
    assertEquals(0, pages.uniqueVisitors(page.getId())); assertEquals(0, page.getTotalViews());
    page.setExpiredDestination(null); pages.save(page);
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isNotFound());
  }

  @Test void visitorAtLimitIsAcceptedButLaterVisitsAreNotCounted() throws Exception {
    page.setUniqueVisitorLimit(2); pages.save(page);
    pages.visit(page.getSlug(), null, "192.0.2.1");
    pages.visit(page.getSlug(), null, "192.0.2.1");
    assertNotNull(pages.visit(page.getSlug(), null, "192.0.2.2"));
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isNotFound());
    assertNull(pages.visit(page.getSlug(), null, "192.0.2.1"));
    assertEquals(2, pages.uniqueVisitors(page.getId())); assertEquals(3, page.getTotalViews());
  }

  @Test void unpublishedAndMissingPagesReturn404WithoutCounting() throws Exception {
    page.setEnabled(false); page.setExpiredDestination("/somewhere"); pages.save(page);
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isNotFound());
    mvc.perform(get("/p/missing-" + UUID.randomUUID())).andExpect(status().isNotFound());
    assertFalse(pages.isExpired(page, Instant.now())); assertEquals(0, pages.uniqueVisitors(page.getId()));
    mvc.perform(get("/api/promotional-pages/9223372036854775807/image")).andExpect(status().isNotFound());
  }

  @Test void adminReadAndMutationRoutesRequireRoleAndCsrf() throws Exception {
    for (String route : List.of("/admin/promotional-pages.html", "/api/promotional-pages",
        "/api/promotional-pages/" + page.getId(), "/api/promotional-pages/" + page.getId() + "/visitors")) {
      mvc.perform(get(route)).andExpect(status().is3xxRedirection());
      mvc.perform(get(route).with(oidcLogin())).andExpect(status().isForbidden());
      mvc.perform(get(route).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andExpect(status().isOk());
    }
    for (String route : List.of("/api/promotional-pages", "/api/promotional-pages/" + page.getId(), "/api/promotional-pages/" + page.getId() + "/image")) {
      mvc.perform(post(route).with(oidcLogin()).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
      mvc.perform(post(route).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
        .contentType("application/json").content("{}")).andExpect(status().isForbidden());
    }
    for (String suffix : List.of("", "/image")) {
      mvc.perform(delete("/api/promotional-pages/" + page.getId() + suffix).with(oidcLogin()).with(csrf())).andExpect(status().isForbidden());
      mvc.perform(delete("/api/promotional-pages/" + page.getId() + suffix)
        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andExpect(status().isForbidden());
    }
  }

  @Test void adminCanCreateEditPublishAndReadCounts() throws Exception {
    String slug = "new-" + UUID.randomUUID();
    mvc.perform(post("/api/promotional-pages").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType("application/json").content("{\"slug\":\"" + slug + "\",\"title\":\"New\",\"enabled\":false,\"uniqueVisitorLimit\":5}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("")).andExpect(jsonPath("$.enabled").value(false))
      .andExpect(jsonPath("$.expired").value(false));
    PromotionalPage created = pages.findBySlug(slug);
    mvc.perform(post("/api/promotional-pages/" + created.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType("application/json").content("{\"slug\":\"" + slug + "\",\"title\":\"Updated\",\"enabled\":true,\"expiresAt\":\"2035-01-01T12:30:00Z\"}"))
      .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Updated")).andExpect(jsonPath("$.enabled").value(true));
    pages.visit(slug, null, "192.0.2.1"); pages.visit(slug, null, "192.0.2.1");
    mvc.perform(get("/api/promotional-pages/" + created.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.totalViews").value(2)).andExpect(jsonPath("$.uniqueVisitors").value(1))
      .andExpect(jsonPath("$.publicUrl").value("http://localhost:8081/p/" + slug));
  }

  @Test void unsafeDestinationsInvalidSlugsDatesAndLimitsAreRejected() throws Exception {
    for (String value : List.of("https://example.com", "http://example.com", "//example.com", "/\\example.com", "/%2fexample.com", "/%5cexample.com", "/%0d%0aLocation:evil")) {
      mvc.perform(post("/api/promotional-pages").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
        .contentType("application/json").content("{\"slug\":\"valid\",\"title\":\"Title\",\"expiredDestination\":\"" + value.replace("\\", "\\\\") + "\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Expiration destination must be an internal path."));
    }
    for (String invalid : List.of("\"slug\":\"../bad\"", "\"expiresAt\":\"tomorrow\"", "\"uniqueVisitorLimit\":1.5", "\"uniqueVisitorLimit\":0", "\"enabled\":\"yes\"")) {
      mvc.perform(post("/api/promotional-pages").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
        .contentType("application/json").content("{\"title\":\"Title\",\"slug\":\"valid\"," + invalid + "}"))
        .andExpect(status().isBadRequest());
    }
  }

  @Test void optionalDestinationsAcceptNullEmptyBlankAndInternalPathsOnCreateAndEdit() throws Exception {
    for (String value : List.of("null", "\"\"", "\"   \"", "\"/admin/\"", "\"/survey.html?id=123\"")) {
      String slug = "optional-" + UUID.randomUUID();
      String input = "{\"slug\":\"" + slug + "\",\"title\":\"Optional destination\",\"expiredDestination\":" + value + "}";
      mvc.perform(post("/api/promotional-pages").with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
        .contentType("application/json").content(input)).andExpect(status().isOk());
      PromotionalPage created = pages.findBySlug(slug);
      String expected = value.contains("/") ? value.substring(1, value.length() - 1) : null;
      assertEquals(expected, created.getExpiredDestination());
      // Editing must also allow clearing an existing fallback.
      created.setExpiredDestination("/previous"); pages.save(created);
      mvc.perform(post("/api/promotional-pages/" + created.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
        .contentType("application/json").content(input)).andExpect(status().isOk());
      assertEquals(expected, pages.findById(created.getId()).getExpiredDestination());
      created.setExpiresAt(Instant.now().minusSeconds(1)); pages.save(created);
      if (expected == null) mvc.perform(get("/p/" + slug)).andExpect(status().isNotFound());
      else mvc.perform(get("/p/" + slug)).andExpect(status().isFound()).andExpect(header().string("Location", expected));
    }
  }

  @Test void directApiRichHtmlIsSanitizedBeforeStorageAndPublicRendering() throws Exception {
    String input = """
      {"slug":"%s","title":"<Title>","tagline":"<em>Plain tagline</em>","contentFormat":"html",
       "content":"<h2>News</h2><p onclick='alert(1)' style='color:red'>Hello <strong>friends</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src='https://example.com'></iframe><a href='javascript:alert(1)'>bad</a><table><tbody><tr><th>Day</th><td>Monday</td></tr></tbody></table>"}
      """.formatted(page.getSlug());
    mvc.perform(post("/api/promotional-pages/" + page.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())
      .contentType("application/json").content(input)).andExpect(status().isOk()).andExpect(jsonPath("$.contentFormat").value("html"))
      .andExpect(jsonPath("$.content").value(containsString("<strong>friends</strong>")));
    em.flush(); em.clear();
    PromotionalPage saved = pages.findById(page.getId());
    assertEquals("html", saved.getContentFormat());
    for (String forbidden : List.of("<script", "<img", "<iframe", "onclick", "style=", "javascript:")) assertFalse(saved.getContent().contains(forbidden));
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isOk())
      .andExpect(content().string(containsString("<div class=\"promotional-content\"><h2>News</h2>")))
      .andExpect(content().string(containsString("<strong>friends</strong>")))
      .andExpect(content().string(containsString("<table>")))
      .andExpect(content().string(containsString("<h1>&lt;Title&gt;</h1>")))
      .andExpect(content().string(containsString("content=\"&lt;em&gt;Plain tagline&lt;/em&gt;\"")))
      .andExpect(content().string(not(containsString("alert(1)"))));
    mvc.perform(get("/css/promotional-content.css")).andExpect(status().isOk());
    String canonical = saved.getContent(); pages.save(saved);
    assertEquals(canonical, pages.findById(page.getId()).getContent());
  }

  @Test void legacyPlainTextAndSanitizedReadbackPreserveLiteralMarkupWhenUpgraded() throws Exception {
    page.setContent("<strong>literal</strong> & \"quoted\"\nNext > line");
    page.setContentFormat(null); pages.save(page); em.flush(); em.clear();
    PromotionalPage legacy = pages.findById(page.getId());
    assertNull(legacy.getContentFormat());
    String escaped = pages.contentHtml(legacy);
    assertTrue(escaped.contains("&lt;strong&gt;literal&lt;/strong&gt;"));
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isOk())
      .andExpect(content().string(containsString("&lt;strong&gt;literal&lt;/strong&gt; &amp; &quot;quoted&quot;<br>Next &gt; line")));
    mvc.perform(get("/api/promotional-pages/" + page.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.content").value(escaped)).andExpect(jsonPath("$.contentFormat").value("html"));
    // The API's editor representation can be saved without interpreting the old literal tags.
    legacy.setContent(escaped); legacy.setContentFormat("html"); pages.save(legacy);
    assertFalse(pages.contentHtml(legacy).contains("<strong>literal</strong>"));
    assertTrue(pages.contentHtml(legacy).contains("&lt;strong&gt;literal&lt;/strong&gt;"));
  }

  @Test void rendererAndAdminReadbackResanitizeRichRecordsWrittenOutsideApi() throws Exception {
    page.setContentFormat("html");
    page.setContent("<h3>Safe</h3><script>malicious()</script><p onfocus='malicious()'>Text</p>");
    em.flush(); em.clear();
    mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isOk())
      .andExpect(content().string(containsString("<h3>Safe</h3>")))
      .andExpect(content().string(not(containsString("malicious()"))));
    mvc.perform(get("/api/promotional-pages/" + page.getId()).with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("<h3>Safe</h3><p>Text</p>"));
  }

  @Test void imageUploadPublicReadReplacementRemovalAndDeleteCascade() throws Exception {
    byte[] gif = "GIF89a-test-image".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    try {
      mvc.perform(get("/api/promotional-pages/" + page.getId() + "/image")).andExpect(status().isNotFound());
      mvc.perform(multipart("/api/promotional-pages/" + page.getId() + "/image")
        .file(new MockMultipartFile("file", "bad.png", "image/png", "wrong".getBytes()))
        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isBadRequest());
      for (int i = 0; i < 2; i++) {
        String old = page.getImageFilename();
        mvc.perform(multipart("/api/promotional-pages/" + page.getId() + "/image")
          .file(new MockMultipartFile("file", "card.gif", "image/gif", gif))
          .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isOk());
        if (old != null) assertFalse(java.nio.file.Files.exists(images.getPath(old)));
      }
      mvc.perform(get("/api/promotional-pages/" + page.getId() + "/image")).andExpect(status().isOk()).andExpect(content().bytes(gif));
      String filename = page.getImageFilename();
      mvc.perform(delete("/api/promotional-pages/" + page.getId() + "/image")
        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isNoContent());
      assertFalse(java.nio.file.Files.exists(images.getPath(filename)));
      mvc.perform(get("/api/promotional-pages/" + page.getId() + "/image")).andExpect(status().isNotFound());
      pages.visit(page.getSlug(), null, "192.0.2.1");
      mvc.perform(delete("/api/promotional-pages/" + page.getId())
        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf())).andExpect(status().isNoContent());
      em.flush(); assertEquals(0, pages.uniqueVisitors(page.getId()));
      mvc.perform(get("/p/" + page.getSlug())).andExpect(status().isNotFound());
    } finally { images.delete(page.getImageFilename()); }
  }

  @Test void surveySharePreservesRedirectFallbackAndImageMetadata() throws Exception {
    User creator = users.findOrCreate(principal(UUID.randomUUID().toString()));
    Survey survey = new Survey(); survey.setTitle("<Survey>"); survey.setCreator(creator); survey.setStatus(SurveyStatus.OPEN); em.persist(survey);
    mvc.perform(get("/s/" + survey.getId())).andExpect(status().isOk())
      .andExpect(content().string(containsString("&lt;Survey&gt;")))
      .andExpect(content().string(containsString("Respond to this survey in Tentacles.")))
      .andExpect(content().string(containsString("window.location.replace")))
      .andExpect(content().string(containsString("/survey.html?id=" + survey.getId())))
      .andExpect(content().string(not(containsString("property=\"og:image\""))));
    survey.setTagline("Custom & description"); survey.setImageFilename("share.png");
    mvc.perform(get("/s/" + survey.getId())).andExpect(status().isOk())
      .andExpect(content().string(containsString("Custom &amp; description")))
      .andExpect(content().string(containsString("/api/surveys/" + survey.getId() + "/image")))
      .andExpect(content().string(containsString("name=\"twitter:image\"")));
  }

  @Test
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  void concurrentVisitsRespectLimitAndDoNotDuplicateAnAddress() throws Exception {
    try {
      runTogether(() -> pages.visit(page.getSlug(), null, "192.0.2.1") != null);
      assertEquals(1, pages.uniqueVisitors(page.getId()));
      assertEquals(2, pages.findById(page.getId()).getTotalViews());
      PromotionalPage current = pages.findById(page.getId()); current.setUniqueVisitorLimit(2); pages.save(current);
      var next = new java.util.concurrent.atomic.AtomicInteger(2);
      List<Boolean> accepted = runTogether(() -> pages.visit(page.getSlug(), null, "192.0.2." + next.getAndIncrement()) != null);
      assertEquals(1, accepted.stream().filter(Boolean::booleanValue).count());
      assertEquals(2, pages.uniqueVisitors(page.getId()));
      assertEquals(3, pages.findById(page.getId()).getTotalViews());
    } finally { pages.delete(pages.findById(page.getId())); }
  }

  List<Boolean> runTogether(Callable<Boolean> action) throws Exception {
    try (var executor = Executors.newFixedThreadPool(2)) {
      var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
      Callable<Boolean> task = () -> { ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new TimeoutException(); return action.call(); };
      var first = executor.submit(task); var second = executor.submit(task);
      assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
      return List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
    }
  }
}
