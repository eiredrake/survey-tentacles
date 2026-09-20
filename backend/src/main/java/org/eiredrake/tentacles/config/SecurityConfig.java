package org.eiredrake.tentacles.config;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.DefaultRedirectStrategy;
import java.util.HashSet;
import java.util.Set;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler;
import org.springframework.http.HttpMethod;

@Configuration
public class SecurityConfig {

    @Bean
    public LogoutSuccessHandler logoutSuccessHandler(
        ClientRegistrationRepository clientRegistrationRepository,
        @Value("${tentacles.dev.encode-http-callback:false}") boolean encodeHttpCallback
    ) {
        OidcClientInitiatedLogoutSuccessHandler logoutSuccessHandler =
            new OidcClientInitiatedLogoutSuccessHandler(
                clientRegistrationRepository
            );
    
        logoutSuccessHandler.setPostLogoutRedirectUri(
            "{baseUrl}/"
        );
    
        if (encodeHttpCallback) {
            // Apply the same proxy workaround as login to the local logout callback.
            var redirect = new DefaultRedirectStrategy();
            logoutSuccessHandler.setRedirectStrategy((request, response, url) -> redirect.sendRedirect(request, response,
                url.replace("post_logout_redirect_uri=http://", "post_logout_redirect_uri=http%3A%2F%2F")));
        }
        return logoutSuccessHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        ClientRegistrationRepository clientRegistrationRepository,
        @Value("${tentacles.dev.encode-http-callback:false}") boolean encodeHttpCallback
    ) throws Exception {
        var authorizationResolver = new DefaultOAuth2AuthorizationRequestResolver(clientRegistrationRepository, "/oauth2/authorization");
        if (encodeHttpCallback) {
            // NPM blocks literal =http:// query values; encoding preserves the OAuth callback.
            authorizationResolver.setAuthorizationRequestCustomizer(builder -> builder.authorizationRequestUri(uri ->
                URI.create(uri.build().toASCIIString().replace("redirect_uri=http://", "redirect_uri=http%3A%2F%2F"))));
        }
        http
            .authorizeHttpRequests(auth -> auth
                // A stream's final container dispatch only completes an already-authorized request.
                .requestMatchers(request -> request.getDispatcherType() == DispatcherType.ASYNC
                    && request.getRequestURI().equals(request.getContextPath() + "/api/surveys/events")).permitAll()
                .requestMatchers(
                    "/health",
                    "/oauth2/**",
                    "/login/**",
                    "/s/**"
                ).permitAll()

                .requestMatchers(HttpMethod.GET, "/api/surveys/events", "/api/surveys/*/notifications").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/surveys/*/notifications").hasRole("ADMIN")

                .requestMatchers("/admin", "/admin/**", "/participant-groups.html", "/api/participant-groups", "/api/participant-groups/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/surveys/*/assignments/batch").hasRole("ADMIN")

                // Survey administration
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/surveys"
                ).hasRole("ADMIN")

                .requestMatchers(
                    HttpMethod.GET,
                    "/api/surveys/{surveyId}/image"
                ).permitAll()            

                .requestMatchers(
                    HttpMethod.POST,
                    "/api/surveys/*/title",
                    "/api/surveys/*/image",
                    "/api/surveys/*/status",
                    "/api/surveys/*/participants",
                    "/api/surveys/*/assignments",
                    "/api/surveys/*/assignments/*/required"
                ).hasRole("ADMIN")

                .requestMatchers(
                    HttpMethod.DELETE,
                    "/api/surveys/*",
                    "/api/surveys/*/assignments/*",
                    "/api/surveys/*/image"
                ).hasRole("ADMIN")

                .requestMatchers(HttpMethod.POST, "/api/surveys/*/images/*/*").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/surveys/*/images/*/*").hasRole("ADMIN")

                // Question administration
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/surveys/*/questions/scheduling",
                    "/api/surveys/*/questions/short-text",
                    "/api/surveys/*/questions/nomination",
                    "/api/surveys/*/questions/*/nomination",
                    "/api/surveys/*/questions/meetup",
                    "/api/surveys/*/questions/*/meetup",
                    "/api/surveys/*/questions/ranked-choice",
                    "/api/surveys/*/questions/*/ranked-choice",
                    "/api/surveys/*/questions/multi-select",
                    "/api/surveys/*/questions/*/multi-select",
                    "/api/surveys/*/questions/yes-no-abstain",
                    "/api/surveys/*/questions/*/yes-no-abstain",
                    "/api/surveys/*/questions/single-select",
                    "/api/surveys/*/questions/*/single-select",
                    "/api/surveys/*/questions/*/scheduling",
                    "/api/surveys/*/questions/*/short-text"
                ).hasRole("ADMIN")

                .requestMatchers(
                    HttpMethod.DELETE,
                    "/api/surveys/*/questions/*"
                ).hasRole("ADMIN")

                .anyRequest().authenticated()
            )
            .oauth2Login(oauth -> oauth
                .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(authorizationResolver))
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
                .logoutSuccessHandler(logoutSuccessHandler(clientRegistrationRepository, encodeHttpCallback))
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("JSESSIONID")
            );

        return http.build();
    }
}
