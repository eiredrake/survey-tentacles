package org.eiredrake.tentacles.controller;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.eiredrake.tentacles.service.SurveyImageService;
import org.eiredrake.tentacles.model.PromotionalPage;
import org.eiredrake.tentacles.model.PromotionalPageVisitor;
import org.eiredrake.tentacles.service.PromotionalPageService;
import org.eiredrake.tentacles.service.PromotionalContentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/promotional-pages")
public class PromotionalPageApiController {
  private final PromotionalPageService pages;
  private final SurveyImageService images;

  public PromotionalPageApiController(PromotionalPageService pages, SurveyImageService images) {
    this.pages = pages; this.images = images;
  }

  @GetMapping public List<Map<String, Object>> list() { return pages.findAll().stream().map(this::view).toList(); }
  @GetMapping("/{id}") public Map<String, Object> get(@PathVariable Long id) { return view(pages.findById(id)); }

  @PostMapping public Map<String, Object> create(@RequestBody Map<String, Object> input) {
    PromotionalPage page = new PromotionalPage();
    apply(page, input);
    return view(pages.save(page));
  }

  @PostMapping("/{id}") public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> input) {
    PromotionalPage page = pages.findById(id);
    apply(page, input);
    return view(pages.save(page));
  }

  @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable Long id) throws IOException {
    PromotionalPage page = pages.findById(id);
    pages.delete(page);
    if (page.getImageFilename() != null) images.delete(page.getImageFilename());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/{id}/visitors") public List<Map<String, Object>> visitors(@PathVariable Long id) {
    pages.findById(id);
    return pages.visitors(id).stream().map(this::visitor).toList();
  }

  @GetMapping("/{id}/image") public ResponseEntity<Resource> image(@PathVariable Long id) throws IOException {
    Path path = images.getPath(pages.findById(id).getImageFilename());
    if (path == null || !Files.exists(path)) return ResponseEntity.notFound().build();
    String type = Files.probeContentType(path);
    return ResponseEntity.ok().contentType(type == null ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(type))
      .body(new FileSystemResource(path));
  }

  @PostMapping("/{id}/image") public Map<String, Object> upload(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
    PromotionalPage page = pages.findById(id);
    String old = page.getImageFilename();
    String filename = images.save(file);
    page.setImageFilename(filename);
    try { pages.save(page); }
    catch (RuntimeException error) {
      try { images.delete(filename); } catch (IOException cleanup) { error.addSuppressed(cleanup); }
      throw error;
    }
    if (old != null) images.delete(old);
    return view(page);
  }

  @DeleteMapping("/{id}/image") public ResponseEntity<Void> deleteImage(@PathVariable Long id) throws IOException {
    PromotionalPage page = pages.findById(id);
    String old = page.getImageFilename();
    page.setImageFilename(null);
    pages.save(page);
    if (old != null) images.delete(old);
    return ResponseEntity.noContent().build();
  }

  private void apply(PromotionalPage page, Map<String, Object> input) {
    String slug = text(input.get("slug"), "Slug", 120);
    if (!slug.matches("[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*")) throw new IllegalArgumentException("Slug must contain letters, numbers, and single hyphens between words.");
    String title = text(input.get("title"), "Title", 255);
    String tagline = optional(input.get("tagline"), 255);
    String content = optional(input.get("content"), PromotionalContentService.MAX_LENGTH);
    String contentFormat = optional(input.get("contentFormat"), 16);
    if (contentFormat != null && !contentFormat.equals("html") && !contentFormat.equals("text"))
      throw new IllegalArgumentException("Unsupported content format.");
    Object enabled = input.get("enabled");
    if (enabled != null && !(enabled instanceof Boolean)) throw new IllegalArgumentException("Published must be true or false.");
    Instant expiresAt = instant(input.get("expiresAt"));
    Integer limit = positive(input.get("uniqueVisitorLimit"));
    String destination = destination(input.get("expiredDestination"));
    page.setSlug(slug); page.setTitle(title); page.setTagline(tagline); page.setContent(content == null ? "" : content);
    page.setContentFormat(contentFormat);
    page.setEnabled(!Boolean.FALSE.equals(enabled)); page.setExpiresAt(expiresAt);
    page.setUniqueVisitorLimit(limit); page.setExpiredDestination(destination);
  }

  private String text(Object value, String label, int max) {
    String text = optional(value, max);
    if (text == null || text.isBlank()) throw new IllegalArgumentException(label + " is required.");
    return text;
  }

  private String optional(Object value, int max) {
    if (value == null) return null;
    if (!(value instanceof String text) || text.length() > max) throw new IllegalArgumentException("Invalid text.");
    return text.trim();
  }

  private Integer positive(Object value) {
    if (value == null || "".equals(value)) return null;
    if (!(value instanceof Number n) || n.intValue() < 1 || n.doubleValue() != n.intValue())
      throw new IllegalArgumentException("Visitor limit must be a positive whole number.");
    return n.intValue();
  }

  private Instant instant(Object value) {
    if (value == null || "".equals(value)) return null;
    try { return Instant.parse((String) value); }
    catch (DateTimeParseException | ClassCastException error) { throw new IllegalArgumentException("Invalid expiration time."); }
  }

  private String destination(Object value) {
    String path = optional(value, 2048);
    if (path == null || path.isBlank()) return null;
    try {
      URI uri = URI.create(path);
      String decoded = uri.getPath();
      if (!path.startsWith("/") || path.startsWith("//") || uri.isAbsolute() || uri.getRawAuthority() != null
          || decoded == null || decoded.startsWith("//") || decoded.contains("\\")
          || path.chars().anyMatch(Character::isISOControl) || decoded.chars().anyMatch(Character::isISOControl))
        throw new IllegalArgumentException();
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("Expiration destination must be an internal path.");
    }
    return path;
  }

  @ExceptionHandler(IllegalArgumentException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  public Map<String, String> invalid(IllegalArgumentException error) { return Map.of("error", error.getMessage()); }

  @ExceptionHandler(DataIntegrityViolationException.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  public Map<String, String> conflict() { return Map.of("error", "Unable to save this page. Its public address may already be in use; choose another slug."); }

  private Map<String, Object> view(PromotionalPage page) {
    Map<String, Object> view = new HashMap<>();
    view.put("id", page.getId()); view.put("slug", page.getSlug()); view.put("title", page.getTitle());
    view.put("publicUrl", pages.publicUrl(page));
    view.put("tagline", page.getTagline() == null ? "" : page.getTagline()); view.put("content", pages.contentHtml(page));
    view.put("contentFormat", "html");
    view.put("imageFilename", page.getImageFilename()); view.put("enabled", page.isEnabled());
    view.put("expired", pages.isExpired(page, Instant.now())); view.put("expiresAt", page.getExpiresAt());
    view.put("uniqueVisitorLimit", page.getUniqueVisitorLimit());
    view.put("expiredDestination", page.getExpiredDestination() == null ? "" : page.getExpiredDestination());
    view.put("totalViews", page.getTotalViews()); view.put("uniqueVisitors", pages.uniqueVisitors(page.getId()));
    return view;
  }

  private Map<String, Object> visitor(PromotionalPageVisitor visitor) {
    Map<String, Object> view = new HashMap<>();
    view.put("username", visitor.getUser() == null ? "" : visitor.getUser().getUsername());
    view.put("name", visitor.getUser() == null ? "" : visitor.getUser().getDisplayName());
    view.put("anonymousIp", visitor.getAnonymousIp() == null ? "" : visitor.getAnonymousIp());
    view.put("firstVisitedAt", visitor.getFirstVisitedAt()); view.put("lastVisitedAt", visitor.getLastVisitedAt());
    view.put("viewCount", visitor.getViewCount());
    return view;
  }
}
