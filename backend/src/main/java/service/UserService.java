package org.eiredrake.tentacles.service;

import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.repository.UserRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User findOrCreate(OidcUser oidcUser) {

        User user = userRepository
                .findByOidcSubject(oidcUser.getSubject())
                .orElseGet(User::new);

        user.setOidcSubject(oidcUser.getSubject());
        user.setUsername(oidcUser.getPreferredUsername());
        user.setEmail(oidcUser.getEmail());
        user.setDisplayName(oidcUser.getFullName());

        return userRepository.save(user);
    }

    public User findByUsername(String username) {
        return userRepository.findByUsername(username)
            .orElseThrow(() -> new IllegalArgumentException(
                "User not found: " + username
            ));
    }    
}