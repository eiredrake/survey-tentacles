package org.eiredrake.tentacles.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.AttachmentOwner;
import org.eiredrake.tentacles.service.ImageAttachmentService;
import org.eiredrake.tentacles.service.SurveyImageService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/surveys/{surveyId}")
public class ImageAttachmentController {
  private final ImageAttachmentService attachments;
  private final SurveyImageService files;
  public ImageAttachmentController(ImageAttachmentService attachments, SurveyImageService files) {
    this.attachments = attachments; this.files = files;
  }

  @GetMapping("/questions/{questionId}/images")
  public List<Map<String, Object>> list(@PathVariable Long surveyId, @PathVariable Long questionId) {
    return attachments.list(surveyId, questionId);
  }

  @PostMapping("/images/{ownerType}/{ownerId}")
  public Map<String, Object> upload(@PathVariable Long surveyId, @PathVariable AttachmentOwner ownerType,
    @PathVariable Long ownerId, @RequestParam("file") MultipartFile file) throws IOException {
    return attachments.upload(surveyId, ownerType, ownerId, file);
  }

  @DeleteMapping("/images/{ownerType}/{ownerId}")
  public ResponseEntity<Void> remove(@PathVariable Long surveyId, @PathVariable AttachmentOwner ownerType, @PathVariable Long ownerId) {
    attachments.remove(surveyId, ownerType, ownerId);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/images/{ownerType}/{ownerId}")
  public ResponseEntity<Resource> image(@PathVariable Long surveyId, @PathVariable AttachmentOwner ownerType, @PathVariable Long ownerId) {
    var image = attachments.find(surveyId, ownerType, ownerId);
    if (image == null) return ResponseEntity.notFound().build();
    var path = files.getPath(image.getFilename());
    if (!Files.isRegularFile(path)) return ResponseEntity.notFound().build();
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.getContentType()))
      .header("Cache-Control", "private, no-cache").header("X-Content-Type-Options", "nosniff")
      .body(new FileSystemResource(path));
  }
}
