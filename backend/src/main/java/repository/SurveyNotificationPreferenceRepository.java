package org.eiredrake.tentacles.repository;

import java.time.Instant;
import java.util.List;
import org.eiredrake.tentacles.model.SurveyNotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface SurveyNotificationPreferenceRepository extends JpaRepository<SurveyNotificationPreference, Long> {
  interface Subscription {
    Long getSurveyId();
    Instant getEnabledAt();
  }
  @Transactional(readOnly = true)
  @Query("select p.survey.id as surveyId, p.enabledAt as enabledAt from SurveyNotificationPreference p where p.user.id = :userId")
  List<Subscription> findSubscriptions(Long userId);
  boolean existsBySurveyIdAndUserId(Long surveyId, Long userId);
  void deleteBySurveyIdAndUserId(Long surveyId, Long userId);
  @Transactional(readOnly = true)
  @Query("select p.user.id from SurveyNotificationPreference p where p.survey.id = :surveyId and p.enabledAt <= :occurredAt")
  List<Long> findRecipients(Long surveyId, Instant occurredAt);
}
