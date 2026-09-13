package org.eiredrake.tentacles.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Set;
import org.slf4j.LoggerFactory;
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
            "image/webp",
            "image/gif"
        );

    private final Path uploadDirectory;

    public SurveyImageService(
        @Value("${tentacles.upload-dir}") String uploadDirectory,
        @Value("${tentacles.require-persistent-uploads:false}") boolean requirePersistentUploads
    ) {
        if (uploadDirectory == null || uploadDirectory.isBlank()) {
            throw new IllegalStateException("Survey upload directory must not be empty.");
        }
        try {
            this.uploadDirectory = Files.createDirectories(Path.of(uploadDirectory).toAbsolutePath().normalize()).toRealPath();
            if (requirePersistentUploads && !hasUploadMount(this.uploadDirectory, Files.readAllLines(Path.of("/proc/self/mountinfo")))) {
                throw new IllegalStateException("Survey images require persistent storage at " + this.uploadDirectory
                    + ". Mount the tentacles-upload-data volume there before starting the container.");
            }
        } catch (IOException error) {
            throw new IllegalStateException("Unable to initialize survey image storage at " + uploadDirectory, error);
        }
        LoggerFactory.getLogger(SurveyImageService.class).info("Survey images stored in {}", this.uploadDirectory);
    }

    static boolean hasUploadMount(Path directory, List<String> mountInfo) {
        for (String line : mountInfo) {
            String[] fields = line.split(" ");
            if (fields.length < 6 || fields[4].equals("/")) continue;
            if (line.contains(" - tmpfs ") || line.contains(" - ramfs ")) continue;
            String mount = fields[4].replace("\\040", " ").replace("\\011", "\t")
                .replace("\\012", "\n").replace("\\134", "\\");
            if (directory.startsWith(Path.of(mount).toAbsolutePath().normalize())) return true;
        }
        return false;
    }

    public String save(MultipartFile file) throws IOException {
        validate(file);
        validateSignature(file);

        Files.createDirectories(uploadDirectory);

        String extension =
            extensionFor(file.getContentType());

        String filename =
            UUID.randomUUID() + extension;

        Path destination =
            uploadDirectory.resolve(filename);

        try (var input = file.getInputStream()) {
            Files.copy(input, destination, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException error) {
            try { Files.deleteIfExists(destination); } catch (IOException cleanup) { error.addSuppressed(cleanup); }
            throw error;
        }

        return filename;
    }

    public String copy(String filename) throws IOException {
        Path source = getPath(filename);
        String copy = UUID.randomUUID() + filename.substring(filename.lastIndexOf('.'));
        Files.copy(source, uploadDirectory.resolve(copy));
        return copy;
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

    private void validate(MultipartFile file) throws IOException {
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
                "Image must be PNG, JPEG, WebP, or GIF."
            );
        }
    }

    private void validateSignature(MultipartFile file) throws IOException {
        byte[] header;
        try (var input = file.getInputStream()) { header = input.readNBytes(12); }
        String text = new String(header, java.nio.charset.StandardCharsets.ISO_8859_1);
        boolean valid = switch (file.getContentType()) {
            case "image/png" -> header.length >= 8 && java.util.Arrays.equals(java.util.Arrays.copyOf(header, 8),
                new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10});
            case "image/jpeg" -> header.length >= 3 && header[0] == (byte) 255 && header[1] == (byte) 216 && header[2] == (byte) 255;
            case "image/gif" -> text.startsWith("GIF87a") || text.startsWith("GIF89a");
            case "image/webp" -> header.length >= 12 && text.startsWith("RIFF") && text.substring(8, 12).equals("WEBP");
            default -> false;
        };
        if (!valid) throw new IllegalArgumentException("The file does not match its image type.");
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> throw new IllegalArgumentException(
                "Unsupported image type."
            );
        };
    }
}