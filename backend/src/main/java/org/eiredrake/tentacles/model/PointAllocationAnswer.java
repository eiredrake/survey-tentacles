package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "point_allocation_answer")
public class PointAllocationAnswer extends Answer {
  @ManyToOne(optional = false) @JoinColumn(name = "option_id", nullable = false)
  private PointAllocationOption option;
  @Column(nullable = false)
  private int points;

  public PointAllocationOption getOption() { return option; }
  public void setOption(PointAllocationOption option) { this.option = option; }
  public int getPoints() { return points; }
  public void setPoints(int points) { this.points = points; }
}
