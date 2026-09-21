package org.eiredrake.tentacles.rewards;

import jakarta.persistence.*;

@Entity
public class RewardPerk {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
  @Column(nullable = false, length = 120) String name;
  @Column(nullable = false, length = 1000) String description = "";
  int cost;
  boolean active = true;
}
