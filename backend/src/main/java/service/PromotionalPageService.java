package org.eiredrake.tentacles.service;

import java.time.Instant;
import java.util.List;
import org.eiredrake.tentacles.model.PromotionalPage;
import org.eiredrake.tentacles.model.PromotionalPageVisitor;
import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.repository.PromotionalPageRepository;
import org.eiredrake.tentacles.repository.PromotionalPageVisitorRepository;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PromotionalPageService {
  private final PromotionalPageRepository pages;
  private final PromotionalPageVisitorRepository visitors;
  @Value("${tentacles.public-base-url}") private String publicBaseUrl;

  public PromotionalPageService(PromotionalPageRepository pages, PromotionalPageVisitorRepository visitors) {
    this.pages = pages; this.visitors = visitors;
  }
  public PromotionalPage save(PromotionalPage page) { return pages.save(page); }
  public String publicUrl(PromotionalPage page) { return publicBaseUrl + "/p/" + page.getSlug(); }
  public List<PromotionalPage> findAll() { return pages.findAll(); }
  public PromotionalPage findById(Long id) { return pages.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Promotional page not found.")); }
  public PromotionalPage findBySlug(String slug) { return pages.findBySlug(slug).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Promotional page not found.")); }
  @Transactional public void delete(PromotionalPage page) { visitors.deleteAll(visitors.findByPromotionalPageIdOrderByFirstVisitedAtAsc(page.getId())); pages.delete(page); }
  public List<PromotionalPageVisitor> visitors(Long id) { return visitors.findByPromotionalPageIdOrderByFirstVisitedAtAsc(id); }
  public long uniqueVisitors(Long id) { return visitors.countByPromotionalPageId(id); }
  public boolean isExpired(PromotionalPage page, Instant now) {
    return page.getExpiresAt() != null && !now.isBefore(page.getExpiresAt())
      || page.getUniqueVisitorLimit() != null && visitors.countByPromotionalPageId(page.getId()) >= page.getUniqueVisitorLimit();
  }
  @Transactional
  public PromotionalPage visit(String slug, User user, String remoteIp) {
    PromotionalPage page = pages.findForVisit(slug).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Promotional page not found."));
    Instant now = Instant.now();
    if (!page.isEnabled()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    if (isExpired(page, now)) return null;
    PromotionalPageVisitor visitor = user == null
      ? visitors.findByPromotionalPageIdAndAnonymousIp(page.getId(), remoteIp).orElse(null)
      : visitors.findByPromotionalPageIdAndUserId(page.getId(), user.getId()).orElse(null);
    if (visitor == null) {
      visitor = new PromotionalPageVisitor(); visitor.setPromotionalPage(page); visitor.setUser(user);
      visitor.setAnonymousIp(user == null ? remoteIp : null); visitor.setFirstVisitedAt(now); visitor.setViewCount(0);
    }
    visitor.setLastVisitedAt(now); visitor.setViewCount(visitor.getViewCount() + 1); visitors.save(visitor);
    page.setTotalViews(page.getTotalViews() + 1); return pages.save(page);
  }
}
