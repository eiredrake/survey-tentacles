package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "nomination_answer")
public class NominationAnswer extends Answer {
  @Column(nullable = false, length = 255)
  private String nomination;

  @ManyToOne
  @JoinColumn(name = "canonical_nomination_id")
  private CanonicalNomination canonicalNomination;

  public String getNomination() { return nomination; }
  public void setNomination(String nomination) { this.nomination = nomination; }
  public CanonicalNomination getCanonicalNomination() { return canonicalNomination; }
  public void setCanonicalNomination(CanonicalNomination canonicalNomination) {
    this.canonicalNomination = canonicalNomination;
  }
}
