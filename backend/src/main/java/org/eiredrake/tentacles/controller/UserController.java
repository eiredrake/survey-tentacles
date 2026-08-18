package org.eiredrake.tentacles.controller;

import java.util.Map;

import org.eiredrake.tentacles.model.User;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal OidcUser oidcUser) {

        User user = userService.findOrCreate(oidcUser);

        return Map.of(
            "id", user.getId(),
            "subject", user.getOidcSubject(),
            "username", user.getUsername(),
            "email", user.getEmail(),
            "name", user.getDisplayName()
        );
    }
}