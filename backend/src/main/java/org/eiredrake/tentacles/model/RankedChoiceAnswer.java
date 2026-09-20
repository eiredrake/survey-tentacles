package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "ranked_choice_answer")
public class RankedChoiceAnswer extends Answer {
  @ManyToOne(optional = false) @JoinColumn(name = "option_id", nullable = false)
  private RankedChoiceOption option;
  @Column(name = "preference_rank", nullable = false)
  private Integer preferenceRank;

  public RankedChoiceOption getOption() { return option; }
  public void setOption(RankedChoiceOption option) { this.option = option; }
  public Integer getPreferenceRank() { return preferenceRank; }
  public void setPreferenceRank(Integer preferenceRank) { this.preferenceRank = preferenceRank; }
}
