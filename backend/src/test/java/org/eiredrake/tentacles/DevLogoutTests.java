package org.eiredrake.tentacles;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.eiredrake.tentacles.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import static org.junit.jupiter.api.Assertions.*;

class DevLogoutTests {
  @Test void devLogoutEncodesHttpCallbackWithoutChangingItsDestination() throws Exception {
    String url = logout(true, "http", "localhost", 8081);
    assertTrue(url.startsWith("https://auth.example/application/o/tentacles/end-session/?"));
    assertFalse(url.contains("=http://"));
    assertTrue(url.contains("post_logout_redirect_uri=http%3A%2F%2Flocalhost:8081/"));
    assertTrue(URLDecoder.decode(url, StandardCharsets.UTF_8).contains("post_logout_redirect_uri=http://localhost:8081/"));
    assertTrue(url.contains("id_token_hint=test-token"));
  }

  @Test void disabledWorkaroundPreservesNormalLogout() throws Exception {
    assertTrue(logout(false, "http", "localhost", 8081).contains("post_logout_redirect_uri=http://localhost:8081/"));
  }

  @Test void productionHttpsLogoutIsUnchanged() throws Exception {
    assertEquals(logout(false, "https", "tentacles.example", 443), logout(true, "https", "tentacles.example", 443));
  }

  private String logout(boolean encode, String scheme, String host, int port) throws Exception {
    var registration = ClientRegistration.withRegistrationId("authentik").clientId("test")
      .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE).redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
      .authorizationUri("https://auth.example/authorize").tokenUri("https://auth.example/token")
      .providerConfigurationMetadata(Map.of("end_session_endpoint", "https://auth.example/application/o/tentacles/end-session/"))
      .build();
    var handler = new SecurityConfig().logoutSuccessHandler(new InMemoryClientRegistrationRepository(registration), encode);
    var principal = new DefaultOidcUser(List.of(), new OidcIdToken("test-token", Instant.now(), Instant.now().plusSeconds(60), Map.of("sub", "admin")));
    var authentication = new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "authentik");
    var request = new MockHttpServletRequest();
    request.setScheme(scheme);
    request.setServerName(host);
    request.setServerPort(port);
    request.setRequestURI("/logout");
    var response = new MockHttpServletResponse();
    handler.onLogoutSuccess(request, response, authentication);
    assertEquals(302, response.getStatus());
    return response.getRedirectedUrl();
  }
}
