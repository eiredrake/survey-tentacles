package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "image_attachment", uniqueConstraints = @UniqueConstraint(columnNames = {"owner_type", "owner_id"}),
  indexes = {@Index(columnList = "survey_id"), @Index(columnList = "question_id")})
public class ImageAttachment {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @Version private long version;
  @Enumerated(EnumType.STRING) @Column(name = "owner_type", nullable = false)
  private AttachmentOwner ownerType;
  @Column(name = "owner_id", nullable = false) private Long ownerId;
  @Column(name = "survey_id", nullable = false) private Long surveyId;
  @Column(name = "question_id", nullable = false) private Long questionId;
  @Column(nullable = false, unique = true) private String filename;
  @Column(nullable = false) private String contentType;
  @Column(nullable = false) private long size;

  public Long getId() { return id; }
  public AttachmentOwner getOwnerType() { return ownerType; }
  public Long getOwnerId() { return ownerId; }
  public Long getSurveyId() { return surveyId; }
  public Long getQuestionId() { return questionId; }
  public String getFilename() { return filename; }
  public String getContentType() { return contentType; }
  public long getSize() { return size; }
  public void setOwner(AttachmentOwner type, Long ownerId, Long surveyId, Long questionId) {
    this.ownerType = type; this.ownerId = ownerId; this.surveyId = surveyId; this.questionId = questionId;
  }
  public void setFile(String filename, String contentType, long size) {
    this.filename = filename; this.contentType = contentType; this.size = size;
  }
}
