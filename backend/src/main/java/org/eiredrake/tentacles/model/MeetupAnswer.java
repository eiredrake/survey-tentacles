package org.eiredrake.tentacles.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "meetup_answer")
public class MeetupAnswer extends Answer {
  @Column(nullable = false)
  private Instant dateTime;

  private Instant endDateTime;

  public Instant getEndDateTime() { return endDateTime; }
  public void setEndDateTime(Instant endDateTime) { this.endDateTime = endDateTime; }
  public Instant getDateTime() { return dateTime; }
  public void setDateTime(Instant dateTime) { this.dateTime = dateTime; }
}
