package org.eiredrake.tentacles.repository;

import java.util.List;
import java.util.Optional;
import org.eiredrake.tentacles.model.AttachmentOwner;
import org.eiredrake.tentacles.model.ImageAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImageAttachmentRepository extends JpaRepository<ImageAttachment, Long> {
  Optional<ImageAttachment> findByOwnerTypeAndOwnerId(AttachmentOwner type, Long ownerId);
  List<ImageAttachment> findByQuestionId(Long questionId);
  List<ImageAttachment> findBySurveyId(Long surveyId);
}
