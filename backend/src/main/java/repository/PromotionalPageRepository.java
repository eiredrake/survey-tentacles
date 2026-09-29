package org.eiredrake.tentacles.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.eiredrake.tentacles.model.PromotionalPage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PromotionalPageRepository extends JpaRepository<PromotionalPage, Long> {
  Optional<PromotionalPage> findBySlug(String slug);
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from PromotionalPage p where p.slug = :slug")
  Optional<PromotionalPage> findForVisit(@Param("slug") String slug);
}
