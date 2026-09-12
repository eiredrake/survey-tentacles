package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "survey_notification_preference", uniqueConstraints = @UniqueConstraint(columnNames = {"survey_id", "user_id"}))
public class SurveyNotificationPreference {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @ManyToOne(optional = false) @JoinColumn(name = "survey_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private Survey survey;
  @ManyToOne(optional = false) @JoinColumn(name = "user_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private User user;
  @Column(nullable = false)
  private Instant enabledAt;

  protected SurveyNotificationPreference() {}
  public SurveyNotificationPreference(Survey survey, User user) {
    this.survey = survey;
    this.user = user;
    this.enabledAt = Instant.now();
  }
  public User getUser() { return user; }
}
