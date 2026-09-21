package org.eiredrake.tentacles.rewards;

import java.math.BigDecimal;
import java.util.*;
import org.eiredrake.tentacles.service.SurveyService;
import org.eiredrake.tentacles.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rewards")
@Transactional
public class RewardController {
  private final RewardService rewards;
  private final UserService users;
  private final SurveyService surveys;
  public RewardController(RewardService rewards, UserService users, SurveyService surveys) {
    this.rewards = rewards; this.users = users; this.surveys = surveys;
  }
  public record SurveyInput(boolean enabled, Map<Long, BigDecimal> questionPoints) {}
  public record Redemption(Long perkId, UUID requestId) {}

  @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
  public org.springframework.http.ResponseEntity<Map<String, String>> invalid(org.springframework.web.server.ResponseStatusException error) {
    return org.springframework.http.ResponseEntity.status(error.getStatusCode()).body(Map.of("error", error.getReason()));
  }

  @GetMapping("/settings")
  public RewardService.Settings settings() { return rewards.settings(); }
  @GetMapping("/account")
  public RewardService.Account account(@AuthenticationPrincipal OidcUser principal) { return rewards.account(users.findOrCreate(principal)); }
  @PostMapping("/redeem")
  public RewardService.Entry redeem(@AuthenticationPrincipal OidcUser principal, @RequestBody Redemption input) {
    return rewards.redeem(users.findOrCreate(principal), input.perkId(), input.requestId());
  }
  @PutMapping("/admin/settings")
  public RewardService.Settings settings(@RequestBody RewardService.Settings input) { return rewards.saveSettings(input); }
  @GetMapping({"/admin/surveys/{id}", "/surveys/{id}"})
  public RewardService.SurveyConfig survey(@PathVariable Long id) { return rewards.surveyConfig(surveys.findById(id)); }
  @PutMapping("/admin/surveys/{id}")
  public RewardService.SurveyConfig survey(@PathVariable Long id, @RequestBody SurveyInput input) {
    return rewards.saveSurvey(surveys.findById(id), input.enabled(), input.questionPoints());
  }
  @GetMapping("/admin/perks")
  public List<RewardService.Perk> perks() { return rewards.perks(true); }
  @PostMapping("/admin/perks")
  public RewardService.Perk createPerk(@RequestBody RewardService.PerkInput input) { return rewards.savePerk(null, input); }
  @PutMapping("/admin/perks/{id}")
  public RewardService.Perk updatePerk(@PathVariable Long id, @RequestBody RewardService.PerkInput input) { return rewards.savePerk(id, input); }
  @GetMapping("/admin/redemptions")
  public List<RewardService.Entry> redemptions() { return rewards.redemptions(); }
}
