package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "promotional_page_visitor", uniqueConstraints = {
  @UniqueConstraint(columnNames = {"promotional_page_id", "user_id"}),
  @UniqueConstraint(columnNames = {"promotional_page_id", "anonymous_ip"})
})
public class PromotionalPageVisitor {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @ManyToOne(optional = false) @JoinColumn(name = "promotional_page_id") private PromotionalPage promotionalPage;
  @ManyToOne @JoinColumn(name = "user_id") private User user;
  @Column(name = "anonymous_ip", length = 45) private String anonymousIp;
  @Column(nullable = false) private Instant firstVisitedAt;
  @Column(nullable = false) private Instant lastVisitedAt;
  @Column(nullable = false) private long viewCount;
  public Long getId() { return id; } public PromotionalPage getPromotionalPage() { return promotionalPage; }
  public void setPromotionalPage(PromotionalPage value) { promotionalPage = value; } public User getUser() { return user; }
  public void setUser(User value) { user = value; } public String getAnonymousIp() { return anonymousIp; }
  public void setAnonymousIp(String value) { anonymousIp = value; } public Instant getFirstVisitedAt() { return firstVisitedAt; }
  public void setFirstVisitedAt(Instant value) { firstVisitedAt = value; } public Instant getLastVisitedAt() { return lastVisitedAt; }
  public void setLastVisitedAt(Instant value) { lastVisitedAt = value; } public long getViewCount() { return viewCount; }
  public void setViewCount(long value) { viewCount = value; }
}
