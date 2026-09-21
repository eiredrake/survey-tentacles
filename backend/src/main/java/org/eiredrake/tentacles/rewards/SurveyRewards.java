package org.eiredrake.tentacles.rewards;

import jakarta.persistence.*;
import java.util.HashMap;
import java.util.Map;

@Entity
public class SurveyRewards {
  @Id Long surveyId;
  @Version Long version;
  boolean enabled;
  @ElementCollection
  @MapKeyColumn(name = "question_id")
  @Column(name = "points", nullable = false)
  Map<Long, Integer> questionPoints = new HashMap<>();
}
