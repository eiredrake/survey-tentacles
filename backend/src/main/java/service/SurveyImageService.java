package org.eiredrake.tentacles.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class SurveyImageService {

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;

    private static final Set<String> ALLOWED_CONTENT_TYPES =
        Set.of(
            "image/png",
            "image/jpeg",
            "image/webp"
        );

    private final Path uploadDirectory;

    public SurveyImageService(
        @Value("${tentacles.upload-dir}") String uploadDirectory
    ) {
        this.uploadDirectory = Path.of(uploadDirectory);
    }

    public String save(MultipartFile file) throws IOException {
        validate(file);

        Files.createDirectories(uploadDirectory);

        String extension =
            extensionFor(file.getContentType());

        String filename =
            UUID.randomUUID() + extension;

        Path destination =
            uploadDirectory.resolve(filename);

        Files.copy(
            file.getInputStream(),
            destination,
            StandardCopyOption.REPLACE_EXISTING
        );

        return filename;
    }

    public void delete(String filename) throws IOException {
        if (filename == null || filename.isBlank()) {
            return;
        }

        Path file =
            uploadDirectory
                .resolve(filename)
                .normalize();

        if (!file.startsWith(uploadDirectory.normalize())) {
            throw new IllegalArgumentException(
                "Invalid image filename."
            );
        }

        Files.deleteIfExists(file);
    }

    public Path getPath(String filename) {
        if (filename == null || filename.isBlank()) {
            return null;
        }

        Path file =
            uploadDirectory
                .resolve(filename)
                .normalize();

        if (!file.startsWith(uploadDirectory.normalize())) {
            throw new IllegalArgumentException(
                "Invalid image filename."
            );
        }

        return file;
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                "Image file is required."
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException(
                "Image must be 5 MB or smaller."
            );
        }

        if (
            file.getContentType() == null ||
            !ALLOWED_CONTENT_TYPES.contains(
                file.getContentType()
            )
        ) {
            throw new IllegalArgumentException(
                "Image must be PNG, JPEG, or WebP."
            );
        }
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "image/webp" -> ".webp";
            default -> throw new IllegalArgumentException(
                "Unsupported image type."
            );
        };
    }
}