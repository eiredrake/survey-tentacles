package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "nomination_question")
public class NominationQuestion extends Question {
  @Column(nullable = false)
  private int maxNominations = 0;

  public int getMaxNominations() { return maxNominations; }
  public void setMaxNominations(int maxNominations) { this.maxNominations = maxNominations; }
}
