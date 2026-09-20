package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "point_allocation_question")
public class PointAllocationQuestion extends Question {
  @Column(nullable = false)
  private int pointBudget;
  @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
  @OrderBy("id ASC")
  private List<PointAllocationOption> options = new ArrayList<>();

  public int getPointBudget() { return pointBudget; }
  public void setPointBudget(int pointBudget) { this.pointBudget = pointBudget; }
  public List<PointAllocationOption> getOptions() { return options; }
}
