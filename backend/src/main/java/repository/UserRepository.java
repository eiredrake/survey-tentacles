package org.eiredrake.tentacles.repository;

import java.util.Optional;

import org.eiredrake.tentacles.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByOidcSubject(String oidcSubject);
}