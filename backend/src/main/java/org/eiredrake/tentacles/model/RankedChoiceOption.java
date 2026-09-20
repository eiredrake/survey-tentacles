package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "ranked_choice_option")
public class RankedChoiceOption {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @ManyToOne(optional = false) @JoinColumn(name = "question_id", nullable = false)
  private RankedChoiceQuestion question;
  @Column(nullable = false)
  private String name;
  @Column(nullable = false)
  private String description = "";
  @Column(nullable = false)
  private Integer displayOrder;

  public Long getId() { return id; }
  public RankedChoiceQuestion getQuestion() { return question; }
  public void setQuestion(RankedChoiceQuestion question) { this.question = question; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getDescription() { return description; }
  public void setDescription(String description) { this.description = description; }
  public Integer getDisplayOrder() { return displayOrder; }
  public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}
