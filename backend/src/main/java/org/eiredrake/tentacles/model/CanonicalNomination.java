package org.eiredrake.tentacles.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "canonical_nomination")
public class CanonicalNomination {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "question_id", nullable = false)
  private NominationQuestion question;

  @Column(nullable = false, length = 255)
  private String displayName;

  public Long getId() { return id; }
  public NominationQuestion getQuestion() { return question; }
  public void setQuestion(NominationQuestion question) { this.question = question; }
  public String getDisplayName() { return displayName; }
  public void setDisplayName(String displayName) { this.displayName = displayName; }
}