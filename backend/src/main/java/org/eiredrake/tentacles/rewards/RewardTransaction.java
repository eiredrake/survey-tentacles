package org.eiredrake.tentacles.rewards;

import jakarta.persistence.*;
import java.time.Instant;

/** Append-only ledger. Snapshot identifiers/text deliberately survive source deletion. */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "operation_key"}),
  indexes = @Index(name = "reward_transaction_user", columnList = "user_id"))
public class RewardTransaction {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
  @Column(name = "user_id", nullable = false) Long userId;
  @Column(name = "operation_key", nullable = false) String operationKey;
  @Column(nullable = false) String userName;
  @Column(nullable = false) String kind;
  long amount;
  Long surveyId;
  Long questionId;
  Long perkId;
  @Column(nullable = false, length = 1000) String description;
  @Column(nullable = false) Instant occurredAt = Instant.now();
}
