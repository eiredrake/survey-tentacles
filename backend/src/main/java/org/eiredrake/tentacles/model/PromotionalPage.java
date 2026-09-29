package org.eiredrake.tentacles.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "promotional_page", uniqueConstraints = @UniqueConstraint(columnNames = "slug"))
public class PromotionalPage {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @Column(nullable = false, length = 120) private String slug;
  @Column(nullable = false, length = 255) private String title;
  @Column(length = 255) private String tagline;
  @Column(nullable = false, length = 10000) private String content = "";
  private String imageFilename;
  private Instant expiresAt;
  private Integer uniqueVisitorLimit;
  @Column(length = 2048) private String expiredDestination;
  @Column(nullable = false) private boolean enabled = true;
  @Column(nullable = false) private long totalViews;
  public Long getId() { return id; } public String getSlug() { return slug; } public void setSlug(String value) { slug = value; }
  public String getTitle() { return title; } public void setTitle(String value) { title = value; }
  public String getTagline() { return tagline; } public void setTagline(String value) { tagline = value; }
  public String getContent() { return content; } public void setContent(String value) { content = value; }
  public String getImageFilename() { return imageFilename; } public void setImageFilename(String value) { imageFilename = value; }
  public Instant getExpiresAt() { return expiresAt; } public void setExpiresAt(Instant value) { expiresAt = value; }
  public Integer getUniqueVisitorLimit() { return uniqueVisitorLimit; } public void setUniqueVisitorLimit(Integer value) { uniqueVisitorLimit = value; }
  public String getExpiredDestination() { return expiredDestination; } public void setExpiredDestination(String value) { expiredDestination = value; }
  public boolean isEnabled() { return enabled; } public void setEnabled(boolean value) { enabled = value; }
  public long getTotalViews() { return totalViews; } public void setTotalViews(long value) { totalViews = value; }
}
