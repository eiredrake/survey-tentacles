package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "nomination_answer")
public class NominationAnswer extends Answer {
  @Column(nullable = false, length = 255)
  private String nomination;

  public String getNomination() { return nomination; }
  public void setNomination(String nomination) { this.nomination = nomination; }
}
