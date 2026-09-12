package org.eiredrake.tentacles.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;

class SurveyImageStorageTests {
  @TempDir Path directory;

  @Test void uploadedFileSurvivesRecreatingTheService() throws Exception {
    byte[] content = {1, 2, 3, 4};
    SurveyImageService first = new SurveyImageService(directory.toString(), false);
    String filename = first.save(new MockMultipartFile("image", "test.png", "image/png", content));
    SurveyImageService restarted = new SurveyImageService(directory.toString(), false);
    assertArrayEquals(content, Files.readAllBytes(restarted.getPath(filename)));
    restarted.delete(filename);
    assertFalse(Files.exists(first.getPath(filename)));
  }

  @Test void filenamesCannotEscapeTheConfiguredDirectory() {
    SurveyImageService service = new SurveyImageService(directory.toString(), false);
    assertThrows(IllegalArgumentException.class, () -> service.getPath("../outside.png"));
    assertThrows(IllegalArgumentException.class, () -> service.delete("../outside.png"));
    assertThrows(IllegalStateException.class, () -> new SurveyImageService("", false));
  }

  @Test void explicitMountIsRequiredAndRootOrMemoryFilesystemsDoNotQualify() {
    Path uploads = Path.of("/app/uploads").toAbsolutePath().normalize();
    assertFalse(SurveyImageService.hasUploadMount(uploads, List.of("1 0 0:1 / / rw - overlay overlay rw")));
    assertFalse(SurveyImageService.hasUploadMount(uploads, List.of("2 1 0:2 / /app/uploads-other rw - ext4 disk rw")));
    assertFalse(SurveyImageService.hasUploadMount(uploads, List.of("2 1 0:2 / /app/uploads rw - tmpfs tmpfs rw")));
    assertTrue(SurveyImageService.hasUploadMount(uploads, List.of("2 1 0:2 /data /app/uploads rw - ext4 disk rw")));
    assertTrue(SurveyImageService.hasUploadMount(uploads, List.of("2 1 0:2 /data /app rw - ext4 disk rw")));
  }

  @Test void mountPathsWithSpacesAreDecoded() {
    Path uploads = Path.of("/survey data/uploads").toAbsolutePath().normalize();
    assertTrue(SurveyImageService.hasUploadMount(uploads, List.of("2 1 0:2 /data /survey\\040data rw - ext4 disk rw")));
  }
}
