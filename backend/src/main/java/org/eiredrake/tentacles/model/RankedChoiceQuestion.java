package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "ranked_choice_question")
public class RankedChoiceQuestion extends Question {
  @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
  @OrderBy("displayOrder ASC, id ASC")
  private List<RankedChoiceOption> options = new ArrayList<>();

  public List<RankedChoiceOption> getOptions() { return options; }
}
