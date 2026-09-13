package org.eiredrake.tentacles.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.model.*;
import org.eiredrake.tentacles.repository.*;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ImageAttachmentService {
  private final ImageAttachmentRepository attachments;
  private final QuestionRepository questions;
  private final RelationshipSubjectRepository subjects;
  private final SurveyImageService files;

  public ImageAttachmentService(ImageAttachmentRepository attachments, QuestionRepository questions,
    RelationshipSubjectRepository subjects, SurveyImageService files) {
    this.attachments = attachments; this.questions = questions; this.subjects = subjects; this.files = files;
  }

  private Question ownerQuestion(Long surveyId, AttachmentOwner type, Long ownerId) {
    Question question = switch (type) {
      case QUESTION -> questions.findById(ownerId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
      case RELATIONSHIP_SUBJECT -> subjects.findById(ownerId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)).getQuestion();
    };
    if (!question.getSurvey().getId().equals(surveyId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return question;
  }

  @Transactional(readOnly = true)
  public ImageAttachment find(Long surveyId, AttachmentOwner type, Long ownerId) {
    ownerQuestion(surveyId, type, ownerId);
    return attachments.findByOwnerTypeAndOwnerId(type, ownerId).orElse(null);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(Long surveyId, Long questionId) {
    ownerQuestion(surveyId, AttachmentOwner.QUESTION, questionId);
    return attachments.findByQuestionId(questionId).stream().map(this::metadata).toList();
  }

  public Map<String, Object> metadata(ImageAttachment image) {
    return Map.of("ownerType", image.getOwnerType().name(), "ownerId", image.getOwnerId(),
      "contentType", image.getContentType(), "size", image.getSize(),
      "url", "/api/surveys/" + image.getSurveyId() + "/images/" + image.getOwnerType() + "/" + image.getOwnerId()
        + "?v=" + image.getFilename());
  }

  @Transactional
  public Map<String, Object> upload(Long surveyId, AttachmentOwner type, Long ownerId, MultipartFile file) throws IOException {
    Question question = ownerQuestion(surveyId, type, ownerId);
    ImageAttachment image = attachments.findByOwnerTypeAndOwnerId(type, ownerId).orElseGet(ImageAttachment::new);
    String oldFilename = image.getFilename();
    String filename = files.save(file);
    cleanAfterTransaction(filename, false);
    image.setOwner(type, ownerId, surveyId, question.getId());
    image.setFile(filename, file.getContentType(), file.getSize());
    attachments.saveAndFlush(image);
    if (oldFilename != null) cleanAfterTransaction(oldFilename, true);
    return metadata(image);
  }

  @Transactional
  public void remove(Long surveyId, AttachmentOwner type, Long ownerId) {
    ownerQuestion(surveyId, type, ownerId);
    attachments.findByOwnerTypeAndOwnerId(type, ownerId).ifPresent(this::remove);
  }

  @Transactional
  public void removeQuestion(Long questionId) { attachments.findByQuestionId(questionId).forEach(this::remove); }

  @Transactional
  public void removeSurvey(Long surveyId) { attachments.findBySurveyId(surveyId).forEach(this::remove); }

  private void remove(ImageAttachment image) {
    attachments.delete(image);
    cleanAfterTransaction(image.getFilename(), true);
  }

  @Transactional
  public void copyQuestion(Question source, Question target) {
    copy(AttachmentOwner.QUESTION, source.getId(), target.getId(), target);
    if (source instanceof RelationshipQuestion from && target instanceof RelationshipQuestion to) {
      for (int i = 0; i < from.getSubjects().size(); i++) {
        copy(AttachmentOwner.RELATIONSHIP_SUBJECT, from.getSubjects().get(i).getId(), to.getSubjects().get(i).getId(), target);
      }
    }
  }

  private void copy(AttachmentOwner type, Long sourceId, Long targetId, Question target) {
    attachments.findByOwnerTypeAndOwnerId(type, sourceId).ifPresent(source -> {
      try {
        String filename = files.copy(source.getFilename());
        cleanAfterTransaction(filename, false);
        ImageAttachment image = new ImageAttachment();
        image.setOwner(type, targetId, target.getSurvey().getId(), target.getId());
        image.setFile(filename, source.getContentType(), source.getSize());
        attachments.save(image);
      } catch (IOException error) { throw new UncheckedIOException("Unable to copy attached image.", error); }
    });
  }

  private void cleanAfterTransaction(String filename, boolean committed) {
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override public void afterCompletion(int status) {
        if (status != (committed ? STATUS_COMMITTED : STATUS_ROLLED_BACK)) return;
        try { files.delete(filename); }
        catch (IOException error) { LoggerFactory.getLogger(ImageAttachmentService.class).error("Unable to remove unused image {}", filename, error); }
      }
    });
  }
}
