package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;
import jakarta.persistence.*;

@Entity
@Table(name = "nomination_question")
public class NominationQuestion extends Question {
  @Column(nullable = false)
  private int maxNominations = 0;

  @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<CanonicalNomination> canonicalNominations = new ArrayList<>();

  public int getMaxNominations() { return maxNominations; }
  public void setMaxNominations(int maxNominations) { this.maxNominations = maxNominations; }
  public List<CanonicalNomination> getCanonicalNominations() { return canonicalNominations; }
}
