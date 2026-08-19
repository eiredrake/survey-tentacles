package org.eiredrake.tentacles.controller;

import java.util.Map;

import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import org.springframework.security.core.Authentication;

@RestController
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public Map<String, Object> me(
        @AuthenticationPrincipal OidcUser oidcUser,
        Authentication authentication) {

        User user = userService.findOrCreate(oidcUser);
        List<String> groups = oidcUser.getClaimAsStringList("groups");

        if (groups == null) {
            groups = List.of();
        }

        List<String> authorities = authentication.getAuthorities().stream()
            .map(authority -> authority.getAuthority())
            .toList();        

        return Map.of(
            "id", user.getId(),
            "subject", user.getOidcSubject(),
            "username", user.getUsername(),
            "email", user.getEmail(),
            "name", user.getDisplayName(),
            "groups", groups,
            "authorities", authorities
        );
    }
}