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
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler;

@Configuration
public class SecurityConfig {

    @Bean
    public LogoutSuccessHandler logoutSuccessHandler(
        ClientRegistrationRepository clientRegistrationRepository
    ) {
        OidcClientInitiatedLogoutSuccessHandler logoutSuccessHandler =
            new OidcClientInitiatedLogoutSuccessHandler(
                clientRegistrationRepository
            );
    
        logoutSuccessHandler.setPostLogoutRedirectUri(
            "{baseUrl}/"
        );
    
        return logoutSuccessHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        ClientRegistrationRepository clientRegistrationRepository
    ) throws Exception {
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
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessHandler(logoutSuccessHandler(clientRegistrationRepository))
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("JSESSIONID")
            );

        return http.build();
    }
}