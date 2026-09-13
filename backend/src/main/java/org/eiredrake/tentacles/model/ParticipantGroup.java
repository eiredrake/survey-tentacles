package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

@Entity
@Table(name = "participant_group")
public class ParticipantGroup {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @Version private long version;
  @Column(nullable = false, length = 100)
  private String name;
  @Column(nullable = false, unique = true, length = 300)
  private String nameKey;
  @ManyToMany
  @JoinTable(name = "participant_group_member", joinColumns = @JoinColumn(name = "group_id"),
    inverseJoinColumns = @JoinColumn(name = "user_id"),
    uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "user_id"}))
  private Set<User> members = new LinkedHashSet<>();

  public Long getId() { return id; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; this.nameKey = name.toLowerCase(Locale.ROOT); }
  public Set<User> getMembers() { return members; }
}
