package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "point_allocation_option")
public class PointAllocationOption {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @ManyToOne(optional = false) @JoinColumn(name = "question_id", nullable = false)
  private PointAllocationQuestion question;
  @Column(nullable = false)
  private String label;

  public Long getId() { return id; }
  public PointAllocationQuestion getQuestion() { return question; }
  public void setQuestion(PointAllocationQuestion question) { this.question = question; }
  public String getLabel() { return label; }
  public void setLabel(String label) { this.label = label; }
}
