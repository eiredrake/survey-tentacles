package org.eiredrake.tentacles.rewards;

import jakarta.persistence.*;

@Entity
public class RewardSettings {
  @Id Long id = 1L;
  @Version Long version;
  boolean enabled;
  @Column(nullable = false, length = 80) String pointName = "Points";
}
