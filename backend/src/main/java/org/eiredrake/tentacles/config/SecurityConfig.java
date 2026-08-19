package org.eiredrake.tentacles.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import java.util.HashSet;
import java.util.Set;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/health",
                    "/oauth2/**",
                    "/login/**"
                ).permitAll()
                .requestMatchers("/api/surveys/*/status").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth -> oauth
                .userInfoEndpoint(userInfo -> userInfo
                    .userAuthoritiesMapper(authorities -> {
                        Set<GrantedAuthority> mapped = new HashSet<>(authorities);

                        for (GrantedAuthority authority : authorities) {
                            if (authority instanceof OidcUserAuthority oidcAuthority) {
                                Object groupsClaim =
                                    oidcAuthority.getUserInfo().getClaims().get("groups");

                                if (groupsClaim instanceof Iterable<?> groups) {
                                    for (Object group : groups) {
                                        if ("authentik Admins".equals(group.toString())) {
                                            mapped.add(
                                                new SimpleGrantedAuthority("ROLE_ADMIN")
                                            );
                                        }
                                    }
                                }
                            }
                        }

                        return mapped;
                    })
                )
            );

        return http.build();
    }
}