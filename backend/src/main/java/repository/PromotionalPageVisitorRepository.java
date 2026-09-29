package org.eiredrake.tentacles.repository;

import java.util.List;
import java.util.Optional;
import org.eiredrake.tentacles.model.PromotionalPageVisitor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionalPageVisitorRepository extends JpaRepository<PromotionalPageVisitor, Long> {
  Optional<PromotionalPageVisitor> findByPromotionalPageIdAndUserId(Long pageId, Long userId);
  Optional<PromotionalPageVisitor> findByPromotionalPageIdAndAnonymousIp(Long pageId, String anonymousIp);
  long countByPromotionalPageId(Long pageId);
  List<PromotionalPageVisitor> findByPromotionalPageIdOrderByFirstVisitedAtAsc(Long pageId);
}
